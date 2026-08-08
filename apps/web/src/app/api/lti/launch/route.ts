import { NextResponse } from 'next/server';
import { pool, runWithTenantContext } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { establishSession } from '@/lib/auth/identity';
import {
    ensureIntegrationConnection,
    integrationApiHeaders,
    integrationJson,
    recordIntegrationAudit,
} from '@/lib/integrations/api-platform';
import {
    LTI_STATE_COOKIE_NAME,
    localRoleForLtiLaunch,
    verifyLtiLaunchToken,
} from '@/lib/integrations/lti';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type LocalLtiUser = {
    id: string;
    email: string;
    role: string;
    authVersion: number;
    passwordChangeRequired: boolean;
    temporaryPasswordExpiresAt: Date | string | null;
    firstName: string;
    lastName: string;
    mfaEnabled: boolean;
    tenantCode: string;
    tenantDomain: string | null;
    tenantIsActive: boolean;
    companyId: string | null;
    companyIsActive: boolean | null;
    subscriptionTier: string | null;
    activeModules: string[] | null;
};

function stateCookieFrom(request: Request): string {
    const cookieHeader = request.headers.get('cookie') || '';
    for (const segment of cookieHeader.split(';')) {
        const separator = segment.indexOf('=');
        if (separator < 0) continue;
        const name = segment.slice(0, separator).trim();
        if (name === LTI_STATE_COOKIE_NAME) return segment.slice(separator + 1).trim();
    }
    return '';
}

function expireStateCookie(response: NextResponse): NextResponse {
    response.cookies.set({
        name: LTI_STATE_COOKIE_NAME,
        value: '',
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/',
        expires: new Date(0),
        maxAge: 0,
    });
    return response;
}

export async function POST(request: Request) {
    const startedAt = Date.now();

    try {
        const formData = await request.formData();
        const idToken = String(formData.get('id_token') || '').trim();
        const encodedState = String(formData.get('state') || '').trim();
        const stateCookieValue = stateCookieFrom(request);

        if (!idToken || !encodedState || !stateCookieValue) {
            return expireStateCookie(integrationJson({
                error: 'Missing signed LTI id_token, state, or browser binding.',
            }, { status: 400 }));
        }

        const launch = await verifyLtiLaunchToken(idToken, encodedState, stateCookieValue);
        const expectedLocalRole = localRoleForLtiLaunch(launch.roles);

        const localUser = await runWithTenantContext(launch.tenantId, async () => {
            const result = await pool.query<LocalLtiUser>(
                `SELECT
                    u.id::text AS id,
                    u.email,
                    u.role::text AS role,
                    u.auth_version AS "authVersion",
                    u.password_change_required AS "passwordChangeRequired",
                    u.temporary_password_expires_at AS "temporaryPasswordExpiresAt",
                    u.first_name AS "firstName",
                    u.last_name AS "lastName",
                    u.mfa_enabled AS "mfaEnabled",
                    t.code AS "tenantCode",
                    t.domain AS "tenantDomain",
                    t.is_active AS "tenantIsActive",
                    c.id::text AS "companyId",
                    c.is_active AS "companyIsActive",
                    c.subscription_tier::text AS "subscriptionTier",
                    c.active_modules AS "activeModules"
                 FROM users u
                 INNER JOIN tenants t ON t.id = u.tenant_id
                 LEFT JOIN companies c ON c.id = t.company_id
                 WHERE u.tenant_id = $1
                   AND u.id::text = $2
                   AND u.is_active = TRUE
                 LIMIT 1`,
                [launch.tenantId, launch.subject],
            );
            const user = result.rows[0];
            if (!user || !user.tenantIsActive || (user.companyId && !user.companyIsActive)) {
                throw new Error('LTI subject is not linked to an active local user.');
            }
            if (user.role !== expectedLocalRole) {
                throw new Error('LTI role does not match the linked local user role.');
            }
            if (user.mfaEnabled) {
                throw new Error('LTI launch cannot satisfy this account\'s MFA requirement.');
            }
            if (
                user.passwordChangeRequired
                && (
                    !user.temporaryPasswordExpiresAt
                    || new Date(user.temporaryPasswordExpiresAt).getTime() <= Date.now()
                )
            ) {
                throw new Error('The linked user temporary password has expired.');
            }

            await ensureIntegrationConnection({
                tenantId: launch.tenantId,
                provider: 'LTI',
                scopes: ['lti:launch'],
                config: {
                    issuer: launch.issuer,
                    clientId: launch.clientId,
                    deploymentId: launch.deploymentId,
                },
            });
            return user;
        });

        const session = await getSession();
        establishSession(session, {
            userId: localUser.id,
            tenantId: launch.tenantId,
            tenantCode: localUser.tenantCode,
            tenantDomain: localUser.tenantDomain || undefined,
            role: localUser.role,
            email: localUser.email,
            provider: 'sso',
            authVersion: localUser.authVersion,
            passwordChangeRequired: localUser.passwordChangeRequired,
            temporaryPasswordExpiresAt: localUser.temporaryPasswordExpiresAt
                ? new Date(localUser.temporaryPasswordExpiresAt).toISOString()
                : undefined,
            displayName: `${localUser.firstName} ${localUser.lastName}`.trim() || localUser.email,
            companyId: localUser.companyId || undefined,
            subscriptionTier: localUser.subscriptionTier || undefined,
            activeModules: localUser.activeModules || [],
            mfaEnabled: false,
            mfaVerified: false,
        });
        session.ltiLaunch = {
            issuer: launch.issuer,
            deploymentId: launch.deploymentId,
            courseId: launch.context.id,
            courseTitle: launch.context.title,
            courseLabel: launch.context.label,
            launchedAt: new Date().toISOString(),
        };
        await session.save();

        await runWithTenantContext(launch.tenantId, async () => {
            await recordIntegrationAudit({
                tenantId: launch.tenantId,
                provider: 'LTI',
                action: 'lti.launch',
                status: 'SUCCESS',
                request,
                statusCode: 302,
                durationMs: Date.now() - startedAt,
                metadata: {
                    subject: launch.subject,
                    courseId: launch.context.id,
                    role: localUser.role,
                    issuer: launch.issuer,
                    deploymentId: launch.deploymentId,
                },
            });
        });

        const deepLinkUrl = new URL('/lti/launch', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');

        const response = NextResponse.redirect(deepLinkUrl.toString(), 302);
        for (const [key, value] of Object.entries(integrationApiHeaders())) {
            response.headers.set(key, value);
        }
        return expireStateCookie(response);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'LTI launch verification failed';
        return expireStateCookie(integrationJson({ error: message }, { status: 400 }));
    }
}
