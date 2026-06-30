import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { pool } from "../../../../lib/db/client";

// Free, open-source Enterprise Authentication replacing Clerk/WorkOS
export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "mock-google-id",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "mock-google-secret",
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        // @ts-ignore
        session.user.tenantId = token.tenantId;
      }
      return session;
    },
    async jwt({ token, profile }) {
      // Resolve tenant_id from the user's email domain on first sign in
      if (profile && profile.email && !token.tenantId) {
        const domain = profile.email.split('@')[1];
        
        // Strict Enterprise Security: Verify the domain exists in our database
        const res = await pool.query(
          `SELECT id FROM tenants WHERE domain = $1 LIMIT 1`,
          [domain]
        );
        
        if (res.rowCount === 0) {
          throw new Error("Unauthorized: School domain not registered on the platform.");
        }
        
        token.tenantId = res.rows[0].id; 
      }
      return token;
    }
  },
  session: {
    strategy: "jwt"
  },
  pages: {
    signIn: '/auth/signin',
  }
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
