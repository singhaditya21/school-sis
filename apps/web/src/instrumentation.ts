export async function register() {
  if (process.env.NEXT_PUBLIC_API_MOCKING === 'enabled') {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
      const { server } = await import('./mocks/node');
      server.listen({ onUnhandledRequest: 'bypass' });
      console.log('MSW Node Server listening for E2E mocks');
    }
  }
}
