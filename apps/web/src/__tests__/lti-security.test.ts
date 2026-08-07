import crypto from 'crypto';
import {
  __resetLtiSecurityCachesForTests,
  createLtiOidcLogin,
  localRoleForLtiLaunch,
  verifyLtiLaunchToken,
} from '@/lib/integrations/lti';
import { GET as ltiLoginRoute } from '@/app/api/lti/login/route';
import { POST as ltiLaunchRoute } from '@/app/api/lti/launch/route';

const ORIGINAL_ENV = process.env;
const ORIGINAL_FETCH = global.fetch;
const ISSUER = 'https://lms.security-test.example';
const CLIENT_ID = 'school-sis-security-test';
const JWKS_URL = `${ISSUER}/.well-known/jwks.json`;
const TENANT_ID = '00000000-0000-4000-8000-000000000019';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = publicKey.export({ format: 'jwk' });

function configureLtiEnvironment(): void {
  process.env.NODE_ENV = 'test';
  process.env.NEXT_PUBLIC_APP_URL = 'https://sis.security-test.example';
  process.env.LTI_STATE_SECRET = 'lti-security-test-secret-with-at-least-32-characters';
  process.env.LTI_ISSUER = ISSUER;
  process.env.LTI_CLIENT_ID = CLIENT_ID;
  process.env.LTI_JWKS_URL = JWKS_URL;
  process.env.LTI_AUTHORIZATION_URL = `${ISSUER}/oidc/auth`;
  process.env.LTI_DEPLOYMENT_ID = 'security-deployment';
  process.env.LTI_TENANT_ID = TENANT_ID;
  delete process.env.LTI_PLATFORMS_JSON;
  delete process.env.LTI_REDIRECT_URI;
}

async function beginLogin() {
  return createLtiOidcLogin(new Request(
    `https://sis.security-test.example/api/lti/login?iss=${encodeURIComponent(ISSUER)}`
      + `&client_id=${encodeURIComponent(CLIENT_ID)}`
      + '&login_hint=opaque-login'
      + `&target_link_uri=${encodeURIComponent('https://sis.security-test.example/api/lti/launch')}`,
  ));
}

function validPayload(nonce: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: ISSUER,
    aud: CLIENT_ID,
    sub: 'student-security-test',
    nonce,
    iat: now,
    exp: now + 300,
    'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
    'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiResourceLinkRequest',
    'https://purl.imsglobal.org/spec/lti/claim/deployment_id': 'security-deployment',
    'https://purl.imsglobal.org/spec/lti/claim/roles': [
      'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
    ],
    'https://purl.imsglobal.org/spec/lti/claim/context': { id: 'security-course' },
    ...overrides,
  };
}

function signToken(
  payload: Record<string, unknown>,
  headerOverrides: Record<string, unknown> = {},
): string {
  const header = Buffer.from(JSON.stringify({
    alg: 'RS256',
    kid: 'security-key',
    typ: 'JWT',
    ...headerOverrides,
  })).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${header}.${encodedPayload}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url');
  return `${signingInput}.${signature}`;
}

function trustedJwksResponse(headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify({
    keys: [{ ...publicJwk, kid: 'security-key', use: 'sig', alg: 'RS256' }],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/jwk-set+json', ...headers },
  });
}

beforeEach(() => {
  global.fetch = ORIGINAL_FETCH;
  process.env = { ...ORIGINAL_ENV, NODE_ENV: 'test' };
  __resetLtiSecurityCachesForTests();
  configureLtiEnvironment();
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
  global.fetch = ORIGINAL_FETCH;
});

describe('LTI OIDC security boundaries', () => {
  it('maps only unambiguous standard learner and instructor roles', () => {
    expect(localRoleForLtiLaunch([
      'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
    ])).toBe('STUDENT');
    expect(localRoleForLtiLaunch([
      'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
    ])).toBe('TEACHER');
    expect(() => localRoleForLtiLaunch([
      'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
      'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
    ])).toThrow(/conflicting/);
    expect(() => localRoleForLtiLaunch(['urn:example:Observer'])).toThrow(/supported/);
  });

  it('sets a secure browser-binding cookie and expires it on the callback', async () => {
    const loginRequest = new Request(
      `https://sis.security-test.example/api/lti/login?iss=${encodeURIComponent(ISSUER)}`
        + `&client_id=${encodeURIComponent(CLIENT_ID)}`
        + '&login_hint=opaque-login'
        + `&target_link_uri=${encodeURIComponent('https://sis.security-test.example/api/lti/launch')}`,
    );
    const loginResponse = await ltiLoginRoute(loginRequest);
    const setCookie = loginResponse.headers.get('set-cookie') || '';

    expect(loginResponse.status).toBe(302);
    expect(setCookie).toMatch(/__Host-school-sis-lti-state=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=none/i);
    expect(setCookie).toMatch(/Path=\//i);

    const callbackResponse = await ltiLaunchRoute(new Request(
      'https://sis.security-test.example/api/lti/launch',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: '__Host-school-sis-lti-state=stale-binding',
        },
        body: new URLSearchParams({ state: 'invalid-state' }),
      },
    ));
    expect(callbackResponse.status).toBe(400);
    expect(callbackResponse.headers.get('set-cookie')).toMatch(/Max-Age=0/);
  });

  it('requires the independent browser binding and rejects a consumed state replay', async () => {
    const login = await beginLogin();
    const nonce = login.redirect.searchParams.get('nonce')!;
    const state = login.redirect.searchParams.get('state')!;
    const decodedState = Buffer.from(state.split('.')[0], 'base64url').toString('utf8');
    const idToken = signToken(validPayload(nonce));
    global.fetch = jest.fn().mockResolvedValue(trustedJwksResponse());

    expect(decodedState).not.toContain(login.stateCookieValue);
    await expect(verifyLtiLaunchToken(idToken, state, 'wrong-browser-binding')).rejects.toThrow(
      /not bound to this browser/,
    );

    await expect(verifyLtiLaunchToken(idToken, state, login.stateCookieValue)).resolves.toMatchObject({
      tenantId: TENANT_ID,
      subject: 'student-security-test',
    });
    await expect(verifyLtiLaunchToken(idToken, state, login.stateCookieValue)).rejects.toThrow(
      /already been consumed/,
    );
  });

  it('requires azp to select this client when aud contains multiple parties', async () => {
    const login = await beginLogin();
    const nonce = login.redirect.searchParams.get('nonce')!;
    const state = login.redirect.searchParams.get('state')!;
    const missingAzp = signToken(validPayload(nonce, { aud: [CLIENT_ID, 'another-client'] }));

    await expect(verifyLtiLaunchToken(missingAzp, state, login.stateCookieValue)).rejects.toThrow(
      /must identify this client as azp/,
    );
    expect(global.fetch).toBe(ORIGINAL_FETCH);

    global.fetch = jest.fn().mockResolvedValue(trustedJwksResponse());
    const selectedClient = signToken(validPayload(nonce, {
      aud: [CLIENT_ID, 'another-client'],
      azp: CLIENT_ID,
    }));
    await expect(verifyLtiLaunchToken(selectedClient, state, login.stateCookieValue)).resolves.toBeDefined();
  });

  it('caches a bounded trusted JWKS across launches and blocks immediate unknown-kid refetches', async () => {
    const first = await beginLogin();
    const second = await beginLogin();
    const fetchMock = jest.fn().mockResolvedValue(trustedJwksResponse({
      'Cache-Control': 'public, max-age=3600',
    }));
    global.fetch = fetchMock;

    const firstToken = signToken(validPayload(first.redirect.searchParams.get('nonce')!));
    const secondToken = signToken(validPayload(second.redirect.searchParams.get('nonce')!));
    await verifyLtiLaunchToken(
      firstToken,
      first.redirect.searchParams.get('state')!,
      first.stateCookieValue,
    );
    await verifyLtiLaunchToken(
      secondToken,
      second.redirect.searchParams.get('state')!,
      second.stateCookieValue,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(JWKS_URL, expect.objectContaining({
      redirect: 'error',
      signal: expect.any(AbortSignal),
    }));

    const third = await beginLogin();
    const unknownKid = signToken(
      validPayload(third.redirect.searchParams.get('nonce')!),
      { kid: 'unknown-key' },
    );
    await expect(verifyLtiLaunchToken(
      unknownKid,
      third.redirect.searchParams.get('state')!,
      third.stateCookieValue,
    )).rejects.toThrow(/signing key was not found/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops reading a JWKS response after the configured byte limit', async () => {
    const login = await beginLogin();
    const token = signToken(validPayload(login.redirect.searchParams.get('nonce')!));
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      keys: [],
      padding: 'x'.repeat(300 * 1024),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    await expect(verifyLtiLaunchToken(
      token,
      login.redirect.searchParams.get('state')!,
      login.stateCookieValue,
    )).rejects.toThrow(/exceeds the maximum accepted size/);
  });

  it('rejects a JWKS response without an explicit JSON content type', async () => {
    const login = await beginLogin();
    const token = signToken(validPayload(login.redirect.searchParams.get('nonce')!));
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ keys: [] }), {
      status: 200,
    }));

    await expect(verifyLtiLaunchToken(
      token,
      login.redirect.searchParams.get('state')!,
      login.stateCookieValue,
    )).rejects.toThrow(/must use a JSON content type/);
  });

  it('rejects insecure platform endpoints in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.LTI_JWKS_URL = 'http://lms.security-test.example/jwks.json';

    await expect(beginLogin()).rejects.toThrow(/must use HTTPS in production/);
  });
});
