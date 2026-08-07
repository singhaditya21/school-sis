import crypto from 'crypto';
import { isValidTenantId } from '@/lib/tenant/isolation';
import { claimSingleUseToken } from '@/lib/auth/rate-limit';

const LTI_CONTEXT_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/context';
const LTI_DEPLOYMENT_ID_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/deployment_id';
const LTI_MESSAGE_TYPE_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/message_type';
const LTI_ROLES_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/roles';
const LTI_VERSION_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/version';
const STATE_TTL_SECONDS = 10 * 60;
const CLOCK_TOLERANCE_SECONDS = 5;
const MAX_LTI_PLATFORMS = 100;
const MAX_ID_TOKEN_BYTES = 64 * 1024;
const MAX_JWKS_BYTES = 256 * 1024;
const MAX_JWKS_KEYS = 64;
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const JWKS_REFRESH_COOLDOWN_MS = 30 * 1000;
const MAX_OBSERVED_STATES = 10_000;

export const LTI_STATE_COOKIE_NAME = '__Host-school-sis-lti-state';
export const LTI_STATE_COOKIE_MAX_AGE_SECONDS = STATE_TTL_SECONDS;

export type LtiPlatformConfiguration = {
  issuer: string;
  clientId: string;
  jwksUrl: string;
  authorizationUrl: string;
  deploymentId: string;
  tenantId: string;
  redirectUri?: string;
};

type LtiOidcState = {
  issuer: string;
  clientId: string;
  tenantId: string;
  redirectUri: string;
  id: string;
  nonce: string;
  browserBindingHash: string;
  iat: number;
  exp: number;
};

export type LtiOidcLogin = {
  redirect: URL;
  stateCookieValue: string;
};

type CachedJwks = {
  keys: Array<Record<string, unknown>>;
  fetchedAt: number;
  expiresAt: number;
};

type ObservedState = {
  expiresAt: number;
  consumed: boolean;
};

const jwksCache = new Map<string, CachedJwks>();
const observedStates = new Map<string, ObservedState>();

export type VerifiedLtiLaunch = {
  tenantId: string;
  issuer: string;
  clientId: string;
  deploymentId: string;
  subject: string;
  roles: string[];
  context: {
    id: string;
    title?: string;
    label?: string;
  };
};

export type LtiLocalRole = 'TEACHER' | 'STUDENT';

function ltiRoleName(role: string): string {
  return role.split(/[\/#]/).filter(Boolean).pop() || '';
}

export function localRoleForLtiLaunch(roles: readonly string[]): LtiLocalRole {
  const roleNames = new Set(roles.map(ltiRoleName));
  const instructor = ['Instructor', 'Administrator', 'ContentDeveloper']
    .some((role) => roleNames.has(role));
  const learner = roleNames.has('Learner');

  if (instructor === learner) {
    throw new Error(
      instructor
        ? 'LTI launch contains conflicting learner and instructor roles.'
        : 'LTI launch does not contain a supported learner or instructor role.',
    );
  }
  return instructor ? 'TEACHER' : 'STUDENT';
}

function requiredString(input: unknown, field: string): string {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error(`LTI platform configuration requires ${field}.`);
  }
  return input.trim();
}

function validateHttpsUrl(value: string, field: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${field} must be a valid URL.`);
  }
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new Error(`${field} must use HTTPS in production.`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${field} must use HTTP or HTTPS.`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${field} must not contain URL credentials.`);
  }
  if (parsed.hash) {
    throw new Error(`${field} must not contain a URL fragment.`);
  }
  return value;
}

function validateIssuerUrl(value: string): string {
  const issuer = validateHttpsUrl(value, 'LTI issuer');
  if (new URL(issuer).search) {
    throw new Error('LTI issuer must not contain a query string.');
  }
  return issuer;
}

function normalizePlatform(input: unknown): LtiPlatformConfiguration {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Each LTI platform configuration must be an object.');
  }
  const value = input as Record<string, unknown>;
  const tenantId = requiredString(value.tenantId, 'tenantId');
  if (!isValidTenantId(tenantId)) {
    throw new Error('LTI platform tenantId must be a valid UUID.');
  }

  const redirectUri = typeof value.redirectUri === 'string' && value.redirectUri.trim()
    ? validateHttpsUrl(value.redirectUri.trim(), 'LTI redirectUri')
    : undefined;

  return {
    issuer: validateIssuerUrl(requiredString(value.issuer, 'issuer')),
    clientId: requiredString(value.clientId, 'clientId'),
    jwksUrl: validateHttpsUrl(requiredString(value.jwksUrl, 'jwksUrl'), 'LTI jwksUrl'),
    authorizationUrl: validateHttpsUrl(
      requiredString(value.authorizationUrl, 'authorizationUrl'),
      'LTI authorizationUrl',
    ),
    deploymentId: requiredString(value.deploymentId, 'deploymentId'),
    tenantId,
    redirectUri,
  };
}

function configuredPlatforms(env: NodeJS.ProcessEnv = process.env): LtiPlatformConfiguration[] {
  if (env.LTI_PLATFORMS_JSON?.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(env.LTI_PLATFORMS_JSON);
    } catch {
      throw new Error('LTI_PLATFORMS_JSON must contain valid JSON.');
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('LTI_PLATFORMS_JSON must be a non-empty array.');
    }
    if (parsed.length > MAX_LTI_PLATFORMS) {
      throw new Error(`LTI_PLATFORMS_JSON cannot contain more than ${MAX_LTI_PLATFORMS} platforms.`);
    }
    return parsed.map(normalizePlatform);
  }

  const singlePlatformFields = [
    env.LTI_ISSUER,
    env.LTI_CLIENT_ID,
    env.LTI_JWKS_URL,
    env.LTI_AUTHORIZATION_URL,
    env.LTI_DEPLOYMENT_ID,
    env.LTI_TENANT_ID,
  ];
  if (!singlePlatformFields.some((value) => value?.trim())) return [];

  return [normalizePlatform({
    issuer: env.LTI_ISSUER,
    clientId: env.LTI_CLIENT_ID,
    jwksUrl: env.LTI_JWKS_URL,
    authorizationUrl: env.LTI_AUTHORIZATION_URL,
    deploymentId: env.LTI_DEPLOYMENT_ID,
    tenantId: env.LTI_TENANT_ID,
    redirectUri: env.LTI_REDIRECT_URI,
  })];
}

function stateSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.LTI_STATE_SECRET || env.SESSION_SECRET || '';
  if (secret.length < 32) {
    throw new Error('LTI_STATE_SECRET (or SESSION_SECRET) must be at least 32 characters.');
  }
  return secret;
}

function defaultRedirectUri(env: NodeJS.ProcessEnv = process.env): string {
  const appUrl = requiredString(env.NEXT_PUBLIC_APP_URL, 'NEXT_PUBLIC_APP_URL');
  return validateHttpsUrl(new URL('/api/lti/launch', appUrl).toString(), 'LTI redirect URI');
}

function platformRedirectUri(platform: LtiPlatformConfiguration): string {
  return platform.redirectUri || defaultRedirectUri();
}

function findPlatform(issuer: string, clientId?: string): LtiPlatformConfiguration {
  const candidates = configuredPlatforms().filter((platform) =>
    platform.issuer === issuer && (!clientId || platform.clientId === clientId),
  );
  if (candidates.length !== 1) {
    throw new Error('No unique trusted LTI platform configuration matches this request.');
  }
  return candidates[0];
}

function randomBindingValue(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function bindingHash(value: string): Buffer {
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

function pruneObservedStates(now: number): void {
  for (const [id, state] of observedStates) {
    if (state.expiresAt <= now) observedStates.delete(id);
  }
}

function rememberIssuedState(id: string, expiresAt: number): void {
  const now = Math.floor(Date.now() / 1000);
  pruneObservedStates(now);
  while (observedStates.size >= MAX_OBSERVED_STATES) {
    const oldestId = observedStates.keys().next().value;
    if (typeof oldestId !== 'string') break;
    observedStates.delete(oldestId);
  }
  observedStates.set(id, { expiresAt, consumed: false });
}

async function consumeObservedState(id: string, expiresAt: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  pruneObservedStates(now);
  const observed = observedStates.get(id);
  if (observed?.consumed) {
    throw new Error('LTI OIDC state has already been consumed.');
  }

  const claimed = await claimSingleUseToken(id, 'lti_oidc_state');
  if (!claimed) {
    throw new Error('LTI OIDC state has already been consumed or replay protection is unavailable.');
  }

  // A launch can legitimately land on a different serverless instance from the
  // one that initiated it. Record an unseen, independently cookie-bound state as
  // consumed here; known states are atomically transitioned in this process.
  observedStates.set(id, { expiresAt, consumed: true });
}

function assertStateCookieBinding(state: LtiOidcState, stateCookieValue: string): void {
  if (!/^[A-Za-z0-9_-]{43}$/.test(stateCookieValue)) {
    throw new Error('LTI OIDC state is not bound to this browser.');
  }
  const expected = Buffer.from(state.browserBindingHash, 'base64url');
  const actual = bindingHash(stateCookieValue);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new Error('LTI OIDC state is not bound to this browser.');
  }
}

function encodeState(state: LtiOidcState): string {
  const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
  const signature = crypto.createHmac('sha256', stateSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function decodeState(value: string): LtiOidcState {
  if (Buffer.byteLength(value, 'utf8') > 4_096) throw new Error('Invalid LTI state.');
  const [payload, signature, extra] = value.split('.');
  if (
    !payload
    || !signature
    || extra
    || !/^[A-Za-z0-9_-]+$/.test(payload)
    || !/^[A-Za-z0-9_-]{43}$/.test(signature)
  ) {
    throw new Error('Invalid LTI state.');
  }

  const expected = crypto.createHmac('sha256', stateSecret()).update(payload).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new Error('Invalid LTI state signature.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid LTI state payload.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid LTI state payload.');
  }
  const state = parsed as Partial<LtiOidcState>;
  if (
    typeof state.issuer !== 'string'
    || typeof state.clientId !== 'string'
    || typeof state.tenantId !== 'string'
    || typeof state.redirectUri !== 'string'
    || typeof state.id !== 'string'
    || typeof state.nonce !== 'string'
    || typeof state.browserBindingHash !== 'string'
    || typeof state.iat !== 'number'
    || typeof state.exp !== 'number'
  ) {
    throw new Error('Invalid LTI state claims.');
  }
  if (
    !isValidTenantId(state.tenantId)
    || !/^[A-Za-z0-9_-]{43}$/.test(state.id)
    || !/^[A-Za-z0-9_-]{43}$/.test(state.nonce)
    || !/^[A-Za-z0-9_-]{43}$/.test(state.browserBindingHash)
    || !Number.isSafeInteger(state.iat)
    || !Number.isSafeInteger(state.exp)
  ) {
    throw new Error('Invalid LTI state claims.');
  }
  const now = Math.floor(Date.now() / 1000);
  if (state.exp <= now) throw new Error('LTI state has expired.');
  if (
    state.iat > now + CLOCK_TOLERANCE_SECONDS
    || state.iat < now - STATE_TTL_SECONDS - CLOCK_TOLERANCE_SECONDS
    || state.exp <= state.iat
    || state.exp - state.iat > STATE_TTL_SECONDS
  ) {
    throw new Error('LTI state has invalid issuance bounds.');
  }
  return state as LtiOidcState;
}

export function __resetLtiSecurityCachesForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('LTI security caches can only be reset in tests.');
  }
  jwksCache.clear();
  observedStates.clear();
}

async function oidcLoginParameters(request: Request): Promise<URLSearchParams> {
  if (request.method === 'POST') {
    const formData = await request.formData();
    const params = new URLSearchParams();
    for (const [key, value] of formData.entries()) {
      if (typeof value === 'string') params.set(key, value);
    }
    return params;
  }
  return new URL(request.url).searchParams;
}

export async function createLtiOidcLogin(request: Request): Promise<LtiOidcLogin> {
  const params = await oidcLoginParameters(request);
  const issuer = requiredString(params.get('iss'), 'iss');
  const loginHint = requiredString(params.get('login_hint'), 'login_hint');
  const clientId = params.get('client_id')?.trim() || undefined;
  const platform = findPlatform(issuer, clientId);
  const redirectUri = platformRedirectUri(platform);
  const targetLinkUri = params.get('target_link_uri')?.trim();
  if (targetLinkUri && targetLinkUri !== redirectUri) {
    throw new Error('Untrusted LTI target_link_uri.');
  }

  const nonce = randomBindingValue();
  const stateId = randomBindingValue();
  const stateCookieValue = randomBindingValue();
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + STATE_TTL_SECONDS;
  const state = encodeState({
    issuer: platform.issuer,
    clientId: platform.clientId,
    tenantId: platform.tenantId,
    redirectUri,
    id: stateId,
    nonce,
    browserBindingHash: bindingHash(stateCookieValue).toString('base64url'),
    iat: issuedAt,
    exp: expiresAt,
  });

  const authorizationUrl = new URL(platform.authorizationUrl);
  authorizationUrl.searchParams.set('scope', 'openid');
  authorizationUrl.searchParams.set('response_type', 'id_token');
  authorizationUrl.searchParams.set('response_mode', 'form_post');
  authorizationUrl.searchParams.set('prompt', 'none');
  authorizationUrl.searchParams.set('client_id', platform.clientId);
  authorizationUrl.searchParams.set('redirect_uri', redirectUri);
  authorizationUrl.searchParams.set('login_hint', loginHint);
  authorizationUrl.searchParams.set('nonce', nonce);
  authorizationUrl.searchParams.set('state', state);
  const messageHint = params.get('lti_message_hint')?.trim();
  if (messageHint) authorizationUrl.searchParams.set('lti_message_hint', messageHint);
  rememberIssuedState(stateId, expiresAt);
  return { redirect: authorizationUrl, stateCookieValue };
}

function parseJwtPart(part: string, label: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(`Invalid LTI JWT ${label}.`);
  }
}

export function assertSignedLtiToken(idToken: string): void {
  if (idToken.startsWith('mock:')) throw new Error('Unsigned mock LTI tokens are not accepted.');
  if (Buffer.byteLength(idToken, 'utf8') > MAX_ID_TOKEN_BYTES) {
    throw new Error('LTI id_token exceeds the maximum accepted size.');
  }
  const parts = idToken.split('.');
  if (
    parts.length !== 3
    || parts.some((part) => !part || !/^[A-Za-z0-9_-]+$/.test(part))
  ) {
    throw new Error('LTI id_token must be a compact signed JWT.');
  }
  const header = parseJwtPart(parts[0], 'header');
  if (header.alg !== 'RS256') {
    throw new Error('LTI id_token must use a trusted signature algorithm (RS256).');
  }
  if (header.crit !== undefined || (header.b64 !== undefined && header.b64 !== true)) {
    throw new Error('LTI id_token uses unsupported critical JOSE header parameters.');
  }
}

function unverifiedJwtPayload(idToken: string): Record<string, unknown> {
  assertSignedLtiToken(idToken);
  return parseJwtPart(idToken.split('.')[1], 'payload');
}

function assertTrustedAudience(payload: Record<string, unknown>, clientId: string): void {
  const audience = payload.aud;
  let audiences: string[];
  if (typeof audience === 'string' && audience) {
    audiences = [audience];
  } else if (
    Array.isArray(audience)
    && audience.length > 0
    && audience.every((value) => typeof value === 'string' && value.length > 0)
  ) {
    audiences = audience as string[];
  } else {
    throw new Error('LTI id_token has an invalid audience claim.');
  }

  if (!audiences.includes(clientId)) {
    throw new Error('LTI id_token audience is not trusted.');
  }
  if (payload.azp !== undefined && payload.azp !== clientId) {
    throw new Error('LTI id_token authorized party is not trusted.');
  }
  if (audiences.length > 1 && payload.azp !== clientId) {
    throw new Error('LTI id_token with multiple audiences must identify this client as azp.');
  }
}

function isNumericDate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function jwksCacheTtl(response: Response): number {
  const cacheControl = response.headers.get('cache-control') || '';
  if (/(?:^|,)\s*(?:no-store|no-cache)(?:\s|,|$)/i.test(cacheControl)) return 0;
  const maxAge = cacheControl.match(/(?:^|,)\s*max-age\s*=\s*(\d+)/i)?.[1];
  if (!maxAge) return JWKS_CACHE_TTL_MS;
  const seconds = Number(maxAge);
  if (!Number.isSafeInteger(seconds) || seconds < 0) return 0;
  return Math.min(seconds * 1_000, JWKS_CACHE_TTL_MS);
}

async function readBoundedJwks(response: Response): Promise<Array<Record<string, unknown>>> {
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    if (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_JWKS_BYTES) {
      throw new Error('LTI JWKS response exceeds the maximum accepted size.');
    }
  }

  const contentType = response.headers.get('content-type');
  if (
    !contentType
    || !/^(?:application\/json|application\/jwk-set\+json)(?:\s*;|$)/i.test(contentType)
  ) {
    throw new Error('LTI JWKS response must use a JSON content type.');
  }

  if (!response.body) throw new Error('LTI JWKS response body is empty.');
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_JWKS_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error('LTI JWKS response exceeds the maximum accepted size.');
    }
    chunks.push(Buffer.from(value));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks, totalBytes).toString('utf8'));
  } catch {
    throw new Error('LTI JWKS response is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('LTI JWKS response must be a JSON object.');
  }
  const keys = (parsed as { keys?: unknown }).keys;
  if (
    !Array.isArray(keys)
    || keys.length > MAX_JWKS_KEYS
    || keys.some((key) => !key || typeof key !== 'object' || Array.isArray(key))
  ) {
    throw new Error(`LTI JWKS must contain at most ${MAX_JWKS_KEYS} valid key objects.`);
  }
  return keys as Array<Record<string, unknown>>;
}

async function fetchTrustedJwks(jwksUrl: string): Promise<CachedJwks> {
  let response: Response;
  try {
    response = await fetch(jwksUrl, {
      headers: { Accept: 'application/jwk-set+json, application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new Error('LTI JWKS request failed or timed out.');
  }
  if (!response.ok) throw new Error(`LTI JWKS request failed with HTTP ${response.status}.`);

  const keys = await readBoundedJwks(response);
  const fetchedAt = Date.now();
  const cached = {
    keys,
    fetchedAt,
    expiresAt: fetchedAt + jwksCacheTtl(response),
  };
  jwksCache.set(jwksUrl, cached);
  return cached;
}

async function trustedJwksForKey(jwksUrl: string, kid: string): Promise<CachedJwks> {
  const now = Date.now();
  let cached = jwksCache.get(jwksUrl);
  if (!cached || cached.expiresAt <= now) {
    return fetchTrustedJwks(jwksUrl);
  }

  const keyIsCached = cached.keys.some((key) => key.kid === kid);
  if (!keyIsCached && now - cached.fetchedAt >= JWKS_REFRESH_COOLDOWN_MS) {
    cached = await fetchTrustedJwks(jwksUrl);
  }
  return cached;
}

async function verifyWithRemoteJwks(
  idToken: string,
  platform: LtiPlatformConfiguration,
): Promise<Record<string, unknown>> {
  const parts = idToken.split('.');
  const header = parseJwtPart(parts[0], 'header');
  if (
    header.alg !== 'RS256'
    || typeof header.kid !== 'string'
    || !header.kid
    || header.kid.length > 256
  ) {
    throw new Error('LTI id_token must use RS256 and identify a JWKS key.');
  }

  const jwks = await trustedJwksForKey(platform.jwksUrl, header.kid);
  const matchingKeys = jwks.keys.filter((candidate) =>
    candidate.kid === header.kid
    && candidate.kty === 'RSA'
    && (!candidate.use || candidate.use === 'sig')
    && (!candidate.alg || candidate.alg === 'RS256')
    && (
      candidate.key_ops === undefined
      || (Array.isArray(candidate.key_ops) && candidate.key_ops.includes('verify'))
    ),
  );
  if (matchingKeys.length !== 1) {
    throw new Error(
      matchingKeys.length > 1
        ? 'LTI signing key is ambiguous in the trusted JWKS.'
        : 'LTI signing key was not found in the trusted JWKS.',
    );
  }

  let publicKey: crypto.KeyObject;
  try {
    publicKey = crypto.createPublicKey({
      key: matchingKeys[0] as crypto.JsonWebKey,
      format: 'jwk',
    });
  } catch {
    throw new Error('LTI JWKS contains an invalid signing key.');
  }
  if (
    publicKey.asymmetricKeyType !== 'rsa'
    || (publicKey.asymmetricKeyDetails?.modulusLength || 0) < 2_048
  ) {
    throw new Error('LTI JWKS signing key must be RSA with a modulus of at least 2048 bits.');
  }
  const signingInput = `${parts[0]}.${parts[1]}`;
  const signature = Buffer.from(parts[2], 'base64url');
  if (!crypto.verify('RSA-SHA256', Buffer.from(signingInput), publicKey, signature)) {
    throw new Error('LTI id_token signature verification failed.');
  }

  return parseJwtPart(parts[1], 'payload');
}

export async function verifyLtiLaunchToken(
  idToken: string,
  encodedState: string,
  stateCookieValue: string,
): Promise<VerifiedLtiLaunch> {
  const state = decodeState(encodedState);
  assertStateCookieBinding(state, stateCookieValue);
  const platform = findPlatform(state.issuer, state.clientId);
  if (state.tenantId !== platform.tenantId || state.redirectUri !== platformRedirectUri(platform)) {
    throw new Error('LTI state does not match the trusted platform configuration.');
  }

  const unverified = unverifiedJwtPayload(idToken);
  if (unverified.iss !== platform.issuer) throw new Error('LTI id_token issuer is not trusted.');
  assertTrustedAudience(unverified, platform.clientId);

  const payload = await verifyWithRemoteJwks(idToken, platform);

  const now = Math.floor(Date.now() / 1000);
  const expiration = payload.exp;
  const issuedAt = payload.iat;
  const notBefore = payload.nbf;
  if (payload.iss !== platform.issuer) throw new Error('LTI id_token issuer verification failed.');
  assertTrustedAudience(payload, platform.clientId);
  if (!isNumericDate(expiration) || expiration <= now - CLOCK_TOLERANCE_SECONDS) {
    throw new Error('LTI id_token is expired or missing exp.');
  }
  if (
    notBefore !== undefined
    && (!isNumericDate(notBefore) || notBefore > now + CLOCK_TOLERANCE_SECONDS)
  ) {
    throw new Error('LTI id_token is not active yet.');
  }
  if (
    !isNumericDate(issuedAt)
    || issuedAt > now + CLOCK_TOLERANCE_SECONDS
    || issuedAt < now - STATE_TTL_SECONDS
    || expiration <= issuedAt
  ) {
    throw new Error('LTI id_token has an invalid or stale iat.');
  }
  if (typeof payload.nonce !== 'string' || payload.nonce !== state.nonce) {
    throw new Error('LTI id_token nonce does not match the OIDC login.');
  }
  if (payload[LTI_VERSION_CLAIM] !== '1.3.0') {
    throw new Error('Unsupported LTI version.');
  }
  if (payload[LTI_MESSAGE_TYPE_CLAIM] !== 'LtiResourceLinkRequest') {
    throw new Error('Unsupported LTI message type.');
  }
  if (payload[LTI_DEPLOYMENT_ID_CLAIM] !== platform.deploymentId) {
    throw new Error('LTI deployment_id does not match the trusted platform.');
  }
  if (typeof payload.sub !== 'string' || !payload.sub.trim()) {
    throw new Error('LTI id_token is missing sub.');
  }
  if (payload.sub.length > 255) {
    throw new Error('LTI id_token sub exceeds the maximum accepted length.');
  }

  const contextValue = payload[LTI_CONTEXT_CLAIM];
  if (!contextValue || typeof contextValue !== 'object' || Array.isArray(contextValue)) {
    throw new Error('LTI id_token is missing context.');
  }
  const context = contextValue as Record<string, unknown>;
  if (typeof context.id !== 'string' || !context.id.trim()) {
    throw new Error('LTI id_token context is missing id.');
  }
  if (context.id.length > 512) {
    throw new Error('LTI context id exceeds the maximum accepted length.');
  }
  const rolesValue = payload[LTI_ROLES_CLAIM];
  if (
    !Array.isArray(rolesValue)
    || rolesValue.length === 0
    || rolesValue.length > 32
    || rolesValue.some((role) => typeof role !== 'string' || !role.trim() || role.length > 512)
  ) {
    throw new Error('LTI id_token is missing valid roles.');
  }

  localRoleForLtiLaunch(rolesValue as string[]);

  await consumeObservedState(state.id, state.exp);

  return {
    tenantId: platform.tenantId,
    issuer: platform.issuer,
    clientId: platform.clientId,
    deploymentId: platform.deploymentId,
    subject: payload.sub,
    roles: rolesValue as string[],
    context: {
      id: context.id,
      title: typeof context.title === 'string' ? context.title.slice(0, 255) : undefined,
      label: typeof context.label === 'string' ? context.label.slice(0, 100) : undefined,
    },
  };
}
