import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { isSessionDataExpired, sessionOptions, type SessionData } from './session-options';

export { sessionOptions };
export type { SessionData };

const defaultSession: SessionData = {
    userId: '',
    tenantId: '',
    role: '',
    email: '',
    token: '',
    isLoggedIn: false,
    mfaRequired: false,
    mfaVerified: false,
};

function resetSessionData(session: SessionData): void {
    session.userId = defaultSession.userId;
    session.tenantId = defaultSession.tenantId;
    session.tenantCode = undefined;
    session.tenantDomain = undefined;
    session.role = defaultSession.role;
    session.email = defaultSession.email;
    session.token = defaultSession.token;
    session.authVersion = undefined;
    session.authProvider = undefined;
    session.issuedAt = undefined;
    session.lastSeenAt = undefined;
    session.expiresAt = undefined;
    session.displayName = undefined;
    session.isLoggedIn = false;
    session.companyId = undefined;
    session.subscriptionTier = undefined;
    session.activeModules = undefined;
    session.mfaRequired = false;
    session.mfaVerified = false;
    session.passwordChangeRequired = false;
    session.temporaryPasswordExpiresAt = undefined;
    session.ssoState = undefined;
    session.impersonation = undefined;
    session.ltiLaunch = undefined;
}

type SessionAccess = 'default' | 'password-change' | 'mfa-enrollment';

async function readSession(access: SessionAccess) {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

    if (!session.isLoggedIn) {
        resetSessionData(session);
    } else if (isSessionDataExpired(session)) {
        resetSessionData(session);
    } else {
        // This module is also called by the DB request-context resolver. The
        // validator enters an explicit tenant AsyncLocalStorage scope before
        // querying, so the contextual pool never calls that resolver again.
        const { validatePersistedSession } = await import('./session-validation');
        const persisted = await validatePersistedSession(session);
        if (persisted.valid === false) {
            resetSessionData(session);
        } else {
            session.role = persisted.role;
            session.email = persisted.email;
            session.passwordChangeRequired = session.authProvider === 'impersonation'
                ? false
                : persisted.passwordChangeRequired;
            session.temporaryPasswordExpiresAt = persisted.temporaryPasswordExpiresAt;
            session.lastSeenAt = new Date().toISOString();

            const passwordRestricted = Boolean(session.passwordChangeRequired);
            const mfaRestricted = Boolean(session.mfaRequired && !session.mfaVerified);
            const accessAllowed = access === 'default'
                ? !passwordRestricted && !mfaRestricted
                : access === 'password-change'
                    ? passwordRestricted
                    : !passwordRestricted && mfaRestricted;

            // Restricted cookies authenticate only at their dedicated recovery
            // boundary. Ordinary and mismatched callers receive no user,
            // tenant, or role context, containing legacy direct session reads.
            if (!accessAllowed) {
                const temporaryPasswordExpiresAt = session.temporaryPasswordExpiresAt;
                const mfaRequired = session.mfaRequired;
                const mfaVerified = session.mfaVerified;
                resetSessionData(session);
                session.passwordChangeRequired = passwordRestricted;
                session.temporaryPasswordExpiresAt = temporaryPasswordExpiresAt;
                session.mfaRequired = mfaRequired;
                session.mfaVerified = mfaVerified;
            }
        }
    }

    return session;
}

export async function getSession() {
    return readSession('default');
}

/** Narrow accessor used only to replace an authenticated temporary credential. */
export async function getPasswordChangeSession() {
    return readSession('password-change');
}

/** Narrow accessor used only to enroll an authenticated, unverified MFA session. */
export async function getMfaEnrollmentSession() {
    return readSession('mfa-enrollment');
}
