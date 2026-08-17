import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { integrationApiHeaders } from '@/lib/integrations/api-platform';
import {
  assertSignedLtiToken,
  createLtiOidcLogin,
  verifyLtiLaunchToken,
} from '@/lib/integrations/lti';
import {
  assertProductionMockModesDisabled,
  integrationRuntimeMode,
  mockWebhookDeliveryIsEnabled,
  notificationProviderForChannel,
} from '@/lib/integrations/runtime-mode';

const ORIGINAL_ENV = process.env;
const ORIGINAL_FETCH = global.fetch;

function configureLtiEnvironment() {
  process.env.NODE_ENV = 'test';
  process.env.NEXT_PUBLIC_APP_URL = 'https://sis.example.edu';
  process.env.SESSION_SECRET = 'production-test-session-secret-at-least-32-characters';
  process.env.LTI_ISSUER = 'https://lms.example.edu';
  process.env.LTI_CLIENT_ID = 'school-sis-client';
  process.env.LTI_JWKS_URL = 'https://lms.example.edu/.well-known/jwks.json';
  process.env.LTI_AUTHORIZATION_URL = 'https://lms.example.edu/oidc/auth';
  process.env.LTI_DEPLOYMENT_ID = 'deployment-1';
  process.env.LTI_TENANT_ID = '00000000-0000-4000-8000-000000000001';
}

beforeEach(() => {
  global.fetch = ORIGINAL_FETCH;
  process.env = { ...ORIGINAL_ENV, NODE_ENV: 'test' };
  delete process.env.ENABLE_INTEGRATION_MOCKS;
  delete process.env.ENABLE_MOCK_API;
  delete process.env.ENABLE_MOCK_LTI;
  delete process.env.INTEGRATIONS_MODE;
  delete process.env.NEXT_PUBLIC_API_MOCKING;
  delete process.env.EMAIL_PROVIDER;
  delete process.env.SMS_PROVIDER;
  delete process.env.WHATSAPP_PROVIDER;
  delete process.env.PUSH_PROVIDER;
  delete process.env.LTI_PLATFORMS_JSON;
  delete process.env.LTI_ISSUER;
  delete process.env.LTI_CLIENT_ID;
  delete process.env.LTI_JWKS_URL;
  delete process.env.LTI_AUTHORIZATION_URL;
  delete process.env.LTI_DEPLOYMENT_ID;
  delete process.env.LTI_TENANT_ID;
  delete process.env.LTI_REDIRECT_URI;
  delete process.env.LTI_STATE_SECRET;
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
  global.fetch = ORIGINAL_FETCH;
});

describe('production integration safety', () => {
  it('keeps liveness database-independent and audits persisted mock configuration in readiness', () => {
    const instrumentation = fs.readFileSync(path.join(process.cwd(), 'src/instrumentation.ts'), 'utf8');
    const health = fs.readFileSync(path.join(process.cwd(), 'src/app/api/health/route.ts'), 'utf8');
    const readiness = fs.readFileSync(path.join(process.cwd(), 'src/app/api/ready/route.ts'), 'utf8');
    const snapshot = fs.readFileSync(path.join(process.cwd(), 'src/lib/observability/snapshot.ts'), 'utf8');

    expect(instrumentation).not.toContain('assertNoProductionMockConnections');
    expect(instrumentation).not.toContain('integration_connections');
    expect(health).not.toContain('@/lib/db');
    expect(health).not.toContain('integration_connections');
    expect(readiness).toContain('getIntegrationConfigurationHealth');
    expect(readiness).toContain('integrationConfiguration.status === "healthy"');
    expect(readiness).toContain('integrationConfiguration.enforced === true');
    expect(readiness).toContain('integrationConfiguration.mockConnectionCount === 0');
    expect(snapshot).toContain('RLS_BYPASS_JUSTIFICATIONS.PRODUCTION_INTEGRATION_AUDIT');
    expect(snapshot).toContain("mode = 'MOCK' OR config ->> 'mock' = 'true'");
  });

  it('never emits the legacy mock integration header', () => {
    process.env.NODE_ENV = 'production';
    const headers = new Headers(integrationApiHeaders());

    expect(headers.get('X-School-SIS-API-Version')).toBe('v1');
    expect(headers.has('X-School-SIS-Integration-Mode')).toBe(false);
  });

  it('forces live webhook and connection behavior in production even when mock flags are present', () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_INTEGRATION_MOCKS = 'true';
    process.env.INTEGRATIONS_MODE = 'mock';

    expect(integrationRuntimeMode()).toBe('LIVE');
    expect(mockWebhookDeliveryIsEnabled()).toBe(false);
  });

  it('fails the production build/boot guard when any mock runtime mode is configured', () => {
    process.env.NODE_ENV = 'production';
    process.env.INTEGRATIONS_MODE = 'mock';
    process.env.EMAIL_PROVIDER = 'mock';
    process.env.NEXT_PUBLIC_API_MOCKING = 'enabled';

    expect(() => assertProductionMockModesDisabled()).toThrow(
      /Production mock integrations are disabled/,
    );
  });

  it('treats missing external notification providers as unconfigured in production', () => {
    process.env.NODE_ENV = 'production';

    expect(notificationProviderForChannel('EMAIL')).toBe('unconfigured');
    expect(notificationProviderForChannel('SMS')).toBe('unconfigured');
    expect(notificationProviderForChannel('WHATSAPP')).toBe('unconfigured');
    expect(notificationProviderForChannel('PUSH')).toBe('unconfigured');
    expect(notificationProviderForChannel('IN_APP')).toBe('database');
  });

  it('rejects unsigned, mock-prefixed, and alg=none LTI tokens', () => {
    const unsignedPayload = Buffer.from(JSON.stringify({ sub: 'student-1' })).toString('base64url');
    const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');

    expect(() => assertSignedLtiToken('mock:student-1')).toThrow(/Unsigned mock/);
    expect(() => assertSignedLtiToken(unsignedPayload)).toThrow(/compact signed JWT/);
    expect(() => assertSignedLtiToken(`${noneHeader}.${unsignedPayload}.unsigned`)).toThrow(
      /trusted signature algorithm/,
    );
  });

  it('creates an LTI 1.3 OIDC authorization request with signed state and nonce', async () => {
    configureLtiEnvironment();

    const { redirect } = await createLtiOidcLogin(new Request(
      'https://sis.example.edu/api/lti/login?iss=https%3A%2F%2Flms.example.edu&client_id=school-sis-client&login_hint=opaque-login&target_link_uri=https%3A%2F%2Fsis.example.edu%2Fapi%2Flti%2Flaunch',
    ));

    expect(redirect.origin + redirect.pathname).toBe('https://lms.example.edu/oidc/auth');
    expect(redirect.searchParams.get('response_type')).toBe('id_token');
    expect(redirect.searchParams.get('response_mode')).toBe('form_post');
    expect(redirect.searchParams.get('nonce')).toBeTruthy();
    expect(redirect.searchParams.get('state')).toContain('.');
  });

  it('accepts only an RS256 id_token verified by the configured platform JWKS', async () => {
    configureLtiEnvironment();
    const { redirect, stateCookieValue } = await createLtiOidcLogin(new Request(
      'https://sis.example.edu/api/lti/login?iss=https%3A%2F%2Flms.example.edu&client_id=school-sis-client&login_hint=opaque-login&target_link_uri=https%3A%2F%2Fsis.example.edu%2Fapi%2Flti%2Flaunch',
    ));
    const nonce = redirect.searchParams.get('nonce')!;
    const state = redirect.searchParams.get('state')!;
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const publicJwk = publicKey.export({ format: 'jwk' });
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss: 'https://lms.example.edu',
      aud: 'school-sis-client',
      sub: 'student-1',
      nonce,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300,
      'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
      'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiResourceLinkRequest',
      'https://purl.imsglobal.org/spec/lti/claim/deployment_id': 'deployment-1',
      'https://purl.imsglobal.org/spec/lti/claim/roles': [
        'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
      ],
      'https://purl.imsglobal.org/spec/lti/claim/context': { id: 'course-1', title: 'Math' },
    })).toString('base64url');
    const signingInput = `${header}.${payload}`;
    const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url');
    const idToken = `${signingInput}.${signature}`;
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      keys: [{ ...publicJwk, kid: 'test-key', use: 'sig', alg: 'RS256' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const launch = await verifyLtiLaunchToken(idToken, state, stateCookieValue);

    expect(launch.tenantId).toBe('00000000-0000-4000-8000-000000000001');
    expect(launch.subject).toBe('student-1');
    expect(launch.context).toMatchObject({ id: 'course-1', title: 'Math' });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://lms.example.edu/.well-known/jwks.json',
      expect.any(Object),
    );
  });

  it('keeps fixture data and the mock API out of the runtime source tree', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'src/app/api/mock/route.ts'))).toBe(false);
    expect(fs.existsSync(path.join(process.cwd(), 'src/lib/mock-data.ts'))).toBe(false);
  });

  it('does not fabricate integration or payment success in remaining runtime actions', () => {
    const registry = fs.readFileSync(path.join(process.cwd(), 'src/app/api/integrations/registry/route.ts'), 'utf8');
    const digilocker = fs.readFileSync(path.join(process.cwd(), 'src/lib/actions/digilocker.ts'), 'utf8');
    const checkout = fs.readFileSync(path.join(process.cwd(), 'src/app/(parent)/my-fees/pay/page.tsx'), 'utf8');
    const messaging = fs.readFileSync(path.join(process.cwd(), 'src/lib/actions/messaging.ts'), 'utf8');
    const attendance = fs.readFileSync(path.join(process.cwd(), 'src/lib/actions/attendance.ts'), 'utf8');
    const admissions = fs.readFileSync(path.join(process.cwd(), 'src/lib/actions/admissions.ts'), 'utf8');
    const marketplace = fs.readFileSync(path.join(process.cwd(), 'src/app/(dashboard)/appexchange/page.tsx'), 'utf8');
    const wallet = fs.readFileSync(path.join(process.cwd(), 'src/app/student/wallet/page.tsx'), 'utf8');
    const agentWebhook = fs.readFileSync(path.join(process.cwd(), 'src/app/api/agent-webhook/route.ts'), 'utf8');

    expect(registry).not.toContain('ensureIntegrationConnection({');
    expect(digilocker).not.toContain('Mock Digilocker Content');
    expect(digilocker).not.toContain("'SUCCESS', responseHash");
    expect(digilocker).not.toContain('APAAR ID verified and linked successfully');
    expect(checkout).not.toContain('Fallback: show success for demo');
    expect(checkout).not.toContain('setSuccess(true)');
    expect(checkout).not.toContain('cardNumber');
    expect(checkout).not.toContain('QR Code');
    expect(messaging).not.toContain("SET status = 'SENT'");
    expect(attendance).toContain('if (smsResult.success) delivered++');
    expect(attendance).toContain('if (emailResult.success) delivered++');
    expect(admissions).toContain('if (!result.success)');
    expect(marketplace).not.toContain('FALLBACK_PLUGINS');
    expect(marketplace).not.toContain('CREATE TABLE');
    expect(wallet).not.toContain('Cryptographically Verified');
    expect(wallet).not.toContain('DL-CBSE');
    expect(agentWebhook).not.toContain('enqueuePlatformJob');
    expect(agentWebhook).toContain('{ status: 503 }');
  });

  it('binds verified LTI subjects to local sessions without identity query parameters', () => {
    const launchRoute = fs.readFileSync(path.join(process.cwd(), 'src/app/api/lti/launch/route.ts'), 'utf8');
    const launchPage = path.join(process.cwd(), 'src/app/lti/launch/page.tsx');

    expect(launchRoute).toContain('u.id::text = $2');
    expect(launchRoute).toContain('establishSession(session');
    expect(launchRoute).toContain('session.ltiLaunch =');
    expect(launchRoute).not.toContain("searchParams.set('userId'");
    expect(launchRoute).not.toContain("searchParams.set('role'");
    expect(fs.existsSync(launchPage)).toBe(true);
  });
});
