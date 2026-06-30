import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { pool, runWithRlsBypass } from '@/lib/db';

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

// Free, open-source Enterprise Authentication replacing Clerk/WorkOS.
// Providers are disabled unless real OAuth credentials are configured.
export const authOptions: NextAuthOptions = {
  providers: googleClientId && googleClientSecret
    ? [
      GoogleProvider({
        clientId: googleClientId,
        clientSecret: googleClientSecret,
      }),
    ]
    : [],
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        (session.user as typeof session.user & { tenantId?: unknown }).tenantId = token.tenantId;
      }
      return session;
    },
    async jwt({ token, profile }) {
      if (profile && profile.email && !token.tenantId) {
        const domain = profile.email.split('@')[1];

        const res = await runWithRlsBypass(() => pool.query(
          `SELECT id FROM tenants WHERE domain = $1 LIMIT 1`,
          [domain]
        )) as { rowCount: number | null; rows: Array<{ id: string }> };

        if (res.rowCount === 0) {
          throw new Error('Unauthorized: School domain not registered on the platform.');
        }

        token.tenantId = res.rows[0].id;
      }
      return token;
    },
  },
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/auth/signin',
  },
};
