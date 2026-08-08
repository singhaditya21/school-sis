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

type NotificationProviderName = 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH';

const LIVE_NOTIFICATION_PROVIDERS: Record<NotificationProviderName, Record<string, readonly string[]>> = {
  EMAIL: {
    resend: ['RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET'],
    smtp: ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'NOTIFICATION_RECEIPT_WEBHOOK_SECRET'],
  },
  SMS: {
    msg91: ['MSG91_AUTH_KEY', 'NOTIFICATION_RECEIPT_WEBHOOK_SECRET'],
    twilio: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER', 'NOTIFICATION_TWILIO_STATUS_CALLBACK_URL'],
  },
  WHATSAPP: {
    twilio: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM_NUMBER', 'NOTIFICATION_TWILIO_STATUS_CALLBACK_URL'],
  },
  PUSH: {
    firebase: ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'NOTIFICATION_RECEIPT_WEBHOOK_SECRET'],
  },
};

function configuredValue(env: NodeJS.ProcessEnv, name: string): boolean {
  return Boolean(env[name]?.trim());
}

/**
 * Production providers are optional, but selecting one is a complete contract:
 * send credentials and an authenticated receipt path must be configured together.
 */
export function assertProductionNotificationProvidersConfigured(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== 'production') return;

  const requiredChannels = new Set(
    (env.REQUIRED_NOTIFICATION_CHANNELS || '')
      .split(',')
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean),
  );
  const violations: string[] = [];

  for (const channel of Object.keys(LIVE_NOTIFICATION_PROVIDERS) as NotificationProviderName[]) {
    const provider = normalizedEnvValue(env, `${channel}_PROVIDER`);
    if (!provider) {
      if (requiredChannels.has(channel)) violations.push(`${channel}_PROVIDER is required`);
      continue;
    }
    const requirements = LIVE_NOTIFICATION_PROVIDERS[channel][provider];
    if (!requirements) {
      violations.push(`${channel}_PROVIDER=${provider} is unsupported`);
      continue;
    }
    const missing = requirements.filter((name) => !configuredValue(env, name));
    if (missing.length > 0) violations.push(`${channel}_PROVIDER=${provider} is missing ${missing.join(', ')}`);
  }

  for (const required of requiredChannels) {
    if (!(required in LIVE_NOTIFICATION_PROVIDERS)) violations.push(`unknown required channel ${required}`);
  }

  const callbackUrl = env.NOTIFICATION_TWILIO_STATUS_CALLBACK_URL;
  if (callbackUrl) {
    try {
      if (new URL(callbackUrl).protocol !== 'https:') throw new Error();
    } catch {
      violations.push('NOTIFICATION_TWILIO_STATUS_CALLBACK_URL must be a valid HTTPS URL');
    }
  }
  if (
    env.NOTIFICATION_RECEIPT_WEBHOOK_SECRET
    && env.NOTIFICATION_RECEIPT_WEBHOOK_SECRET.trim().length < 32
  ) {
    violations.push('NOTIFICATION_RECEIPT_WEBHOOK_SECRET must be at least 32 characters');
  }

  if (violations.length > 0) {
    throw new Error(`Production notification provider configuration is invalid: ${violations.join('; ')}.`);
  }
}
