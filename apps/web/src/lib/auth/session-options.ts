import type { SessionOptions } from 'iron-session';

export type SessionData = {
    userId: string;
    tenantId: string;
    tenantCode?: string;
    tenantDomain?: string;
    role: string;
    email: string;
    token: string;
    /** Persisted user revision. Missing values are deliberately treated as revoked. */
    authVersion?: number;
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
    passwordChangeRequired?: boolean;
    temporaryPasswordExpiresAt?: string;
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
        actorAuthVersion: number;
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
    'REGISTRAR',
    'FINANCE_LEAD',
    'ACCOUNTANT',
] as const;

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
        maxAge: 60 * 60 * 24 * 7,
        sameSite: 'lax',
    },
};
