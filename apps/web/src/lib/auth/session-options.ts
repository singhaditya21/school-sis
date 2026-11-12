import type { SessionOptions } from 'iron-session';
import {
    DEMO_SANDBOX_SOUTH_TENANT_CODE,
    DEMO_SANDBOX_TENANT_CODE,
} from './platform-owner';

export type SessionData = {
    userId: string;
    tenantId: string;
    tenantCode?: string;
    tenantDomain?: string;
    role: string;
    email: string;
    token: string;
    authProvider?: 'password' | 'sso' | 'impersonation' | 'system';
    issuedAt?: string;
    lastSeenAt?: string;
    expiresAt?: string;
    displayName?: string;
    isLoggedIn: boolean;
    companyId?: string;
    subscriptionTier?: string;
    activeModules?: string[];
    mfaRequired?: boolean;
    mfaVerified?: boolean;
    sessionVersion?: number;
    tenantSessionVersion?: number;
    isDemoSandbox?: boolean;
    ssoState?: {
        value: string;
        provider: string;
        redirectUri: string;
        expiresAt: string;
    };
    impersonation?: {
        actorUserId: string;
        actorTenantId: string;
        actorEmail: string;
        startedAt: string;
        expiresAt: string;
    };
    ltiLaunch?: {
        issuer: string;
        deploymentId: string;
        courseId: string;
        courseTitle?: string;
        courseLabel?: string;
        launchedAt: string;
    };
};

export const MFA_REQUIRED_ROLE_NAMES = [
    'PLATFORM_ADMIN',
    'SUPER_ADMIN',
    'GROUP_EXECUTIVE',
    'SCHOOL_ADMIN',
    'PRINCIPAL',
    'FINANCE_LEAD',
    'ACCOUNTANT',
] as const;

const MFA_REQUIRED_ROLE_SET = new Set<string>(MFA_REQUIRED_ROLE_NAMES);
const DEMO_SANDBOX_CODE_SET = new Set<string>([
    DEMO_SANDBOX_TENANT_CODE,
    DEMO_SANDBOX_SOUTH_TENANT_CODE,
]);

export function isRoleMfaRequired(
    role: string,
    options?: { isDemoSandbox?: boolean; tenantCode?: string | null },
): boolean {
    if (options?.isDemoSandbox === true) {
        return false;
    }
    const normalizedTenantCode = options?.tenantCode?.trim().toUpperCase();
    if (normalizedTenantCode && DEMO_SANDBOX_CODE_SET.has(normalizedTenantCode)) {
        return false;
    }
    return MFA_REQUIRED_ROLE_SET.has(role);
}

export function isSessionDataExpired(session: Pick<SessionData, 'expiresAt' | 'impersonation'>): boolean {
    const now = Date.now();
    if (session.expiresAt && Date.parse(session.expiresAt) <= now) {
        return true;
    }
    if (session.impersonation?.expiresAt && Date.parse(session.impersonation.expiresAt) <= now) {
        return true;
    }
    return false;
}

function getSessionSecret(): string {
    const secret = process.env.SESSION_SECRET;
    if (!secret || secret.length < 32) {
        if (process.env.npm_lifecycle_event === 'build' || process.env.NEXT_PHASE === 'phase-production-build') {
            return 'dummy-secret-for-build-time-only-32-chars-long-x';
        }

        throw new Error(
            'SESSION_SECRET environment variable is required and must be at least 32 characters. ' +
            'Generate one with: openssl rand -base64 32'
        );
    }
    return secret;
}

export const sessionOptions: SessionOptions = {
    password: getSessionSecret(),
    cookieName: 'school-sis-session',
    cookieOptions: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' && !process.env.PLAYWRIGHT_TEST,
        maxAge: 60 * 60 * 12,
        sameSite: 'lax',
    },
};
