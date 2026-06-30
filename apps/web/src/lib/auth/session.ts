import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { enterRlsBypassContext, enterTenantContext } from '@/lib/db';
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
    session.role = defaultSession.role;
    session.email = defaultSession.email;
    session.token = defaultSession.token;
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
    session.ssoState = undefined;
    session.impersonation = undefined;
}

export async function getSession() {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

    if (!session.isLoggedIn) {
        resetSessionData(session);
    } else if (isSessionDataExpired(session)) {
        session.destroy();
        resetSessionData(session);
    } else {
        session.lastSeenAt = new Date().toISOString();
        if (session.role === 'PLATFORM_ADMIN') {
            enterRlsBypassContext();
        } else if (session.tenantId) {
            enterTenantContext(session.tenantId);
        }
    }

    return session;
}
