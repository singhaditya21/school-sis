import crypto from 'crypto';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { isMfaEnrollmentEnforced } from '@/lib/auth/identity';
import { isRoleMfaRequired } from '@/lib/auth/session-options';
import { assertActiveSessionState } from '@/lib/auth/session-revocation';
import { isDemoSession } from '@/lib/tenant/demo-guard';
import { assertSameOriginMutation, resolveTrustedAppOrigin } from '@/lib/security/client-ip';
import { hasPermission, UserRole } from '@/lib/rbac/permissions';

export type ApiAuthContext = {
    userId: string;
    tenantId: string;
    role: string;
    email: string;
};

export type ApiAuthResult =
    | { ok: true; context: ApiAuthContext; response?: undefined }
    | { ok: false; response: NextResponse; context?: undefined };

export const ROLE_GROUPS = {
    platform: ['PLATFORM_ADMIN'] as const,
    tenantAdmins: ['PLATFORM_ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN'] as const,
    finance: ['PLATFORM_ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN', 'ACCOUNTANT', 'FINANCE_LEAD'] as const,
    staff: [
        'PLATFORM_ADMIN',
        'SUPER_ADMIN',
        'GROUP_EXECUTIVE',
        'SCHOOL_ADMIN',
        'PRINCIPAL',
        'REGISTRAR',
        'FINANCE_LEAD',
        'ACCOUNTANT',
        'ADMISSION_COUNSELOR',
        'STUDENT_SUCCESS_COUNSELOR',
        'TEACHER',
        'TRANSPORT_MANAGER',
        'TRUST_OFFICER',
        'CREDENTIAL_OFFICER',
    ] as const,
    parents: ['PARENT'] as const,
} as const;

async function enforceAmbientCsrfCheck(): Promise<NextResponse | null> {
    let hdrs: Awaited<ReturnType<typeof headers>>;
    try {
        hdrs = await headers();
    } catch {
        return null;
    }

    const authHeader = hdrs.get('authorization');
    const apiKeyHeader = hdrs.get('x-api-key');
    if ((authHeader && /^Bearer\s+\S+/i.test(authHeader)) || (apiKeyHeader && apiKeyHeader.trim().length > 0)) {
        return null;
    }

    const origin = hdrs.get('origin')?.trim();
    const secFetchSite = hdrs.get('sec-fetch-site')?.trim().toLowerCase();
    const secFetchMode = hdrs.get('sec-fetch-mode')?.trim().toLowerCase();

    // Browsers attach `Origin` on all state-changing requests (and CORS fetches) and never on
    // top-level GET link navigations; non-navigate cross-site Sec-Fetch-Site also indicates CSRF.
    const shouldValidateOrigin =
        Boolean(origin) ||
        Boolean(secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none' && secFetchMode !== 'navigate');

    if (!shouldValidateOrigin) {
        return null;
    }

    const host = (hdrs.get('x-forwarded-host') || hdrs.get('host') || '').split(',')[0]?.trim();
    const proto = (hdrs.get('x-forwarded-proto') || '').split(',')[0]?.trim() || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
    const fallbackOrigin = host ? `${proto}://${host}` : undefined;
    const targetUrl = resolveTrustedAppOrigin(fallbackOrigin);

    const syntheticHeaders = new Headers();
    for (const name of ['origin', 'referer', 'sec-fetch-site', 'authorization', 'x-api-key']) {
        const val = hdrs.get(name);
        if (val !== null) syntheticHeaders.set(name, val);
    }

    return assertSameOriginMutation(
        new Request(fallbackOrigin || targetUrl, {
            method: 'POST',
            headers: syntheticHeaders,
        }),
    );
}

export async function requireApiAuth(
    allowedRoles?: readonly string[],
    request?: Request,
): Promise<ApiAuthResult> {
    if (request) {
        const csrfError = assertSameOriginMutation(request);
        if (csrfError) {
            return { ok: false, response: csrfError };
        }
    } else {
        const ambientCsrfError = await enforceAmbientCsrfCheck();
        if (ambientCsrfError) {
            return { ok: false, response: ambientCsrfError };
        }
    }

    const session = await getSession();

    if (!session.isLoggedIn || !session.userId || !session.tenantId) {
        return {
            ok: false,
            response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
        };
    }

    try {
        await assertActiveSessionState(session);
    } catch {
        try {
            session.destroy();
        } catch {
            // Ignore cookie mutation errors in read-only contexts.
        }
        return {
            ok: false,
            response: NextResponse.json(
                { error: 'Unauthorized: Session revoked or inactive' },
                { status: 401 },
            ),
        };
    }

    const roleRequiresMfa = isRoleMfaRequired(session.role, {
        isDemoSandbox: session.isDemoSandbox,
        tenantCode: session.tenantCode,
    });
    const mfaUnverified =
        !isDemoSession(session) &&
        (Boolean(session.mfaRequired) || (isMfaEnrollmentEnforced() && roleRequiresMfa)) &&
        !session.mfaVerified;
    if (mfaUnverified) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: 'Two-factor authentication setup is required.', code: 'MFA_SETUP_REQUIRED' },
                { status: 403 },
            ),
        };
    }

    if (allowedRoles && !allowedRoles.includes(session.role)) {
        return {
            ok: false,
            response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
        };
    }

    return {
        ok: true,
        context: {
            userId: session.userId,
            tenantId: session.tenantId,
            role: session.role,
            email: session.email,
        },
    };
}

export async function requireApiPermission(
    permission: string,
    request?: Request,
): Promise<ApiAuthResult> {
    const auth = await requireApiAuth(undefined, request);
    if (auth.ok === false) return auth;

    if (!hasPermission(auth.context.role as UserRole, permission)) {
        return {
            ok: false,
            response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
        };
    }

    return auth;
}

export function requireServerSecret(name: string, minLength = 32): string {
    const value = process.env[name];
    if (!value || value.length < minLength) {
        throw new Error(`${name} environment variable is required and must be at least ${minLength} characters.`);
    }
    return value;
}

function bearerTokenFrom(headers: Headers): string {
    const authHeader = headers.get('authorization') || '';
    return authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
}

function constantTimeEquals(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function requireBearerServiceAuth(
    request: Request,
    envName: string,
    options: { minLength?: number; serviceName?: string; required?: boolean } = {},
): NextResponse | null {
    const minLength = options.minLength ?? 32;
    const serviceName = options.serviceName ?? 'service';
    const required = options.required ?? true;
    const secret = process.env[envName];

    if (!secret || secret.length < minLength) {
        if (!required) return null;
        return NextResponse.json(
            { error: `${serviceName} is not configured` },
            { status: 503 },
        );
    }

    const token = bearerTokenFrom(request.headers);
    if (!token || !constantTimeEquals(token, secret)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return null;
}
