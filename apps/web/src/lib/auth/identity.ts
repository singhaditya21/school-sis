import type { SessionData } from './session-options';
import { isMFARequired } from './mfa';

const DEFAULT_SESSION_TTL_MINUTES = 12 * 60;
const DEFAULT_PLATFORM_SESSION_TTL_MINUTES = 8 * 60;
const DEFAULT_IMPERSONATION_TTL_MINUTES = 60;

export type AuthProvider = NonNullable<SessionData['authProvider']>;

export type EstablishSessionInput = {
    userId: string;
    tenantId: string;
    role: string;
    email: string;
    provider: AuthProvider;
    displayName?: string;
    companyId?: string;
    subscriptionTier?: string;
    activeModules?: string[];
    mfaEnabled?: boolean;
    mfaVerified?: boolean;
    token?: string;
    impersonation?: SessionData['impersonation'];
};

function ttlMinutesForRole(role: string): number {
    const envValue = role === 'PLATFORM_ADMIN'
        ? process.env.PLATFORM_SESSION_TTL_MINUTES
        : process.env.SESSION_TTL_MINUTES;
    const fallback = role === 'PLATFORM_ADMIN'
        ? DEFAULT_PLATFORM_SESSION_TTL_MINUTES
        : DEFAULT_SESSION_TTL_MINUTES;
    const parsed = Number(envValue);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function futureIso(minutes: number): string {
    return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

export function impersonationExpiresAt(): string {
    const parsed = Number(process.env.IMPERSONATION_TTL_MINUTES);
    const minutes = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_IMPERSONATION_TTL_MINUTES;
    return futureIso(minutes);
}

export function isMfaEnrollmentEnforced(): boolean {
    return process.env.REQUIRE_MFA_ENROLLMENT === 'true' || process.env.NODE_ENV === 'production';
}

export function shouldRequireMfaEnrollment(role: string, mfaEnabled: boolean): boolean {
    return isMFARequired(role) && !mfaEnabled && isMfaEnrollmentEnforced();
}

export function mfaRequiredForSession(role: string, mfaEnabled: boolean): boolean {
    return Boolean(mfaEnabled) || (isMFARequired(role) && isMfaEnrollmentEnforced());
}

export function establishSession(session: SessionData, input: EstablishSessionInput): void {
    const issuedAt = new Date().toISOString();
    const mfaRequired = mfaRequiredForSession(input.role, Boolean(input.mfaEnabled));

    session.userId = input.userId;
    session.tenantId = input.tenantId;
    session.role = input.role;
    session.email = input.email;
    session.token = input.token || '';
    session.authProvider = input.provider;
    session.issuedAt = issuedAt;
    session.lastSeenAt = issuedAt;
    session.expiresAt = futureIso(ttlMinutesForRole(input.role));
    session.displayName = input.displayName;
    session.isLoggedIn = true;
    session.companyId = input.companyId;
    session.subscriptionTier = input.subscriptionTier;
    session.activeModules = input.activeModules || [];
    session.mfaRequired = mfaRequired;
    session.mfaVerified = !mfaRequired || Boolean(input.mfaVerified);
    session.impersonation = input.impersonation;
}

export function isImpersonating(session: SessionData): boolean {
    return Boolean(session.impersonation?.actorUserId) || Boolean(session.token?.startsWith('impersonating:'));
}

export function legacyImpersonationActorId(session: SessionData): string | null {
    if (!session.token?.startsWith('impersonating:')) return null;
    return session.token.split(':')[1] || null;
}
