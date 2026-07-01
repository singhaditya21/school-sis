import { NextResponse } from 'next/server';
import { ROLE_GROUPS } from '@/lib/auth/api';
import {
    authenticateIntegrationRequest,
    ensureMockIntegrationConnection,
    integrationApiHeaders,
    integrationJson,
    recordIntegrationAudit,
} from '@/lib/integrations/api-platform';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type MockLtiClaims = {
    sub: string;
    name?: string;
    email?: string;
    roles?: string[];
    context?: {
        id: string;
        title?: string;
        label?: string;
    };
};

export async function POST(request: Request) {
    const startedAt = Date.now();
    const auth = await authenticateIntegrationRequest(request, {
        provider: 'LTI',
        scopes: ['lti:launch'],
        allowSession: true,
        sessionRoles: ROLE_GROUPS.staff,
    });
    if (auth.ok === false) return auth.response;

    try {
        await ensureMockIntegrationConnection({
            tenantId: auth.context.tenantId,
            provider: 'LTI',
            scopes: ['lti:launch'],
            userId: auth.context.userId,
        });

        const formData = await request.formData();
        const token = String(formData.get('id_token') || formData.get('mock_token') || '').trim();
        const state = String(formData.get('state') || '').trim();

        if (!token) {
            return integrationJson({ error: 'Missing mock LTI token' }, { status: 400 });
        }

        const claims = parseMockLtiToken(token);
        if (!claims.context?.id) {
            return integrationJson({ error: 'Mock LTI token must include context.id' }, { status: 400 });
        }

        const roles = claims.roles || [];
        const isInstructor = roles.some((role) =>
            role.includes('Instructor') || role.includes('Administrator') || role.includes('ContentDeveloper'),
        );

        await recordIntegrationAudit({
            tenantId: auth.context.tenantId,
            provider: 'LTI',
            action: 'lti.launch',
            status: 'SUCCESS',
            request,
            context: auth.context,
            statusCode: 302,
            durationMs: Date.now() - startedAt,
            metadata: {
                userId: claims.sub,
                courseId: claims.context.id,
                role: isInstructor ? 'TEACHER' : 'STUDENT',
                mode: 'mock',
            },
        });

        const deepLinkUrl = new URL('/courses/lti-launch', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
        deepLinkUrl.searchParams.set('courseId', claims.context.id);
        deepLinkUrl.searchParams.set('role', isInstructor ? 'TEACHER' : 'STUDENT');
        deepLinkUrl.searchParams.set('userId', claims.sub);
        if (claims.context.title) deepLinkUrl.searchParams.set('courseTitle', claims.context.title);
        if (state) deepLinkUrl.searchParams.set('state', state);

        const response = NextResponse.redirect(deepLinkUrl.toString(), 302);
        for (const [key, value] of Object.entries(integrationApiHeaders())) {
            response.headers.set(key, value);
        }
        return response;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Mock LTI launch failed';
        await recordIntegrationAudit({
            tenantId: auth.context.tenantId,
            provider: 'LTI',
            action: 'lti.launch',
            status: 'FAILED',
            request,
            context: auth.context,
            statusCode: 400,
            durationMs: Date.now() - startedAt,
            error: message,
        });
        return integrationJson({ error: message }, { status: 400 });
    }
}

function parseMockLtiToken(token: string): MockLtiClaims {
    let raw = token;
    if (token.startsWith('mock:')) raw = token.slice('mock:'.length);

    try {
        if (raw.startsWith('{')) return normalizeClaims(JSON.parse(raw));
        const decoded = Buffer.from(raw, 'base64url').toString('utf8');
        return normalizeClaims(JSON.parse(decoded));
    } catch {
        return normalizeClaims({
            sub: raw,
            roles: ['Learner'],
            context: {
                id: 'mock-course',
                title: 'Mock Course',
            },
        });
    }
}

function normalizeClaims(input: Record<string, unknown>): MockLtiClaims {
    const context = input.context && typeof input.context === 'object'
        ? input.context as Record<string, unknown>
        : input['https://purl.imsglobal.org/spec/lti/claim/context'] as Record<string, unknown> | undefined;
    const roles = Array.isArray(input.roles)
        ? input.roles.map(String)
        : Array.isArray(input['https://purl.imsglobal.org/spec/lti/claim/roles'])
            ? (input['https://purl.imsglobal.org/spec/lti/claim/roles'] as unknown[]).map(String)
            : ['Learner'];

    return {
        sub: String(input.sub || input.userId || 'mock-lti-user'),
        name: typeof input.name === 'string' ? input.name : undefined,
        email: typeof input.email === 'string' ? input.email : undefined,
        roles,
        context: {
            id: String(context?.id || 'mock-course'),
            title: typeof context?.title === 'string' ? context.title : 'Mock Course',
            label: typeof context?.label === 'string' ? context.label : undefined,
        },
    };
}
