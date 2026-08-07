export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateSecurityEnvironment } = await import('./lib/security/env');
    const {
      registerDbRlsContextResolver,
      RLS_BYPASS_JUSTIFICATIONS,
    } = await import('@/lib/db');
    const { getSession } = await import('./lib/auth/session');

    registerDbRlsContextResolver(async () => {
      const session = await getSession();
      if (!session.isLoggedIn || !session.userId) return undefined;
      if (session.role === 'PLATFORM_ADMIN') {
        return {
          bypassRls: true,
          justification: RLS_BYPASS_JUSTIFICATIONS.PLATFORM_SESSION,
        };
      }
      return session.tenantId ? { tenantId: session.tenantId } : undefined;
    });

    validateSecurityEnvironment();
    if (process.env.NODE_ENV === 'production') {
      const { assertNoProductionMockConnections } = await import('./lib/integrations/api-platform');
      await assertNoProductionMockConnections();
    }
  }

  if (process.env.NEXT_PUBLIC_API_MOCKING === 'enabled') {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
      const { server } = await import('./mocks/node');
      server.listen({ onUnhandledRequest: 'bypass' });
      console.log('MSW Node Server listening for E2E mocks');
    }
  }
}
