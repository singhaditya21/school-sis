import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
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

export async function requireApiAuth(allowedRoles?: readonly string[]): Promise<ApiAuthResult> {
    const session = await getSession();

    if (!session.isLoggedIn || !session.userId || !session.tenantId) {
        return {
            ok: false,
            response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
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

export async function requireApiPermission(permission: string): Promise<ApiAuthResult> {
    const auth = await requireApiAuth();
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
