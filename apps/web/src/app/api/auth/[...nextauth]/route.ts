import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

// Free, open-source Enterprise Authentication replacing Clerk/WorkOS
const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "mock-google-id",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "mock-google-secret",
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      // Here we securely inject the multitenant tenant_id into the session 
      // based on the user's Google Workspace domain.
      if (session.user) {
        // @ts-ignore
        session.user.tenantId = token.tenantId || "default-mock-tenant-id";
      }
      return session;
    },
    async jwt({ token, user, profile }) {
      // Resolve tenant_id from the user's email domain on first sign in
      if (profile && profile.email) {
        const domain = profile.email.split('@')[1];
        // Imagine a db query here: SELECT id FROM tenants WHERE domain = domain
        token.tenantId = `tenant-${domain}`; 
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
});

export { handler as GET, handler as POST };
