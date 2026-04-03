import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

export type SessionData = {
    userId: string;
    tenantId: string;
    role: string;
    email: string;
    token: string; // kept for backward compatibility, not used
    isLoggedIn: boolean;
    companyId?: string;
    subscriptionTier?: string;
    activeModules?: string[];
};

const defaultSession: SessionData = {
    userId: '',
    tenantId: '',
    role: '',
    email: '',
    token: '',
    isLoggedIn: false,
};

function getSessionSecret(): string {
    const secret = process.env.SESSION_SECRET;
    if (!secret || secret.length < 32) {
        // Enforce secret everywhere except local build time (Webpack workers).
        // VERCEL_ENV falls back to undefined in Render/VPS environments
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
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        sameSite: 'lax',
    },
};

export async function getSession() {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

    if (!session.isLoggedIn) {
        session.userId = defaultSession.userId;
        session.tenantId = defaultSession.tenantId;
        session.role = defaultSession.role;
        session.email = defaultSession.email;
        session.isLoggedIn = defaultSession.isLoggedIn;
    }

    return session;
}
