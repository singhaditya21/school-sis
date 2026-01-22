import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

export type SessionData = {
    userId: string;
    tenantId: string | null;
    role: string;
    email: string;
    token: string;
    isLoggedIn: boolean;
};

const defaultSession: SessionData = {
    userId: '',
    tenantId: null,
    role: '',
    email: '',
    token: '',
    isLoggedIn: false,
};

export const sessionOptions: SessionOptions = {
    password: process.env.SESSION_SECRET || 'complex_password_at_least_32_characters_long',
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
