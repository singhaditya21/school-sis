export type IntegrationRuntimeMode = 'LIVE' | 'MOCK';

const PRODUCTION_MOCK_ENV_VARS = [
  'ENABLE_INTEGRATION_MOCKS',
  'ENABLE_MOCK_API',
  'ENABLE_MOCK_LTI',
] as const;

const EXTERNAL_PROVIDER_ENV_VARS = [
  'EMAIL_PROVIDER',
  'SMS_PROVIDER',
  'WHATSAPP_PROVIDER',
  'PUSH_PROVIDER',
] as const;

function normalizedEnvValue(env: NodeJS.ProcessEnv, name: string): string {
  return (env[name] || '').trim().toLowerCase();
}

export function mockRuntimeIsAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === 'production') return false;
  if (env.NODE_ENV === 'test') return true;
  return normalizedEnvValue(env, 'ENABLE_INTEGRATION_MOCKS') === 'true';
}

export function integrationRuntimeMode(env: NodeJS.ProcessEnv = process.env): IntegrationRuntimeMode {
  return mockRuntimeIsAllowed(env) && normalizedEnvValue(env, 'INTEGRATIONS_MODE') === 'mock'
    ? 'MOCK'
    : 'LIVE';
}

export function mockWebhookDeliveryIsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return integrationRuntimeMode(env) === 'MOCK';
}

export function notificationProviderForChannel(
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH' | 'IN_APP',
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (channel === 'IN_APP') return 'database';

  const envName = `${channel}_PROVIDER`;
  const configured = normalizedEnvValue(env, envName);
  if (configured && configured !== 'mock') return configured;
  if (configured === 'mock' && mockRuntimeIsAllowed(env)) return 'mock';
  if (!configured && env.NODE_ENV === 'test') return 'mock';
  return 'unconfigured';
}

/**
 * Build/boot guard for modes that would fabricate integration success.
 * Missing providers are allowed so optional capabilities can remain disabled;
 * attempting to use an unconfigured channel fails in the provider layer.
 */
export function assertProductionMockModesDisabled(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== 'production') return;

  const violations: string[] = [];
  for (const name of PRODUCTION_MOCK_ENV_VARS) {
    if (normalizedEnvValue(env, name) === 'true') violations.push(`${name}=true`);
  }
  if (normalizedEnvValue(env, 'INTEGRATIONS_MODE') === 'mock') {
    violations.push('INTEGRATIONS_MODE=mock');
  }
  if (normalizedEnvValue(env, 'NEXT_PUBLIC_API_MOCKING') === 'enabled') {
    violations.push('NEXT_PUBLIC_API_MOCKING=enabled');
  }
  for (const name of EXTERNAL_PROVIDER_ENV_VARS) {
    if (normalizedEnvValue(env, name) === 'mock') violations.push(`${name}=mock`);
  }

  if (violations.length > 0) {
    throw new Error(
      `Production mock integrations are disabled. Remove: ${violations.join(', ')}.`,
    );
  }
}
