import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import { pool, runWithRlsBypass, RLS_BYPASS_JUSTIFICATIONS } from '@/lib/db';
import type { QueryResult } from 'pg';
import { isMfaEnrollmentEnforced } from './identity';
import { isRoleMfaRequired } from './session-options';
import {
    isPermanentPlatformAdminEmail,
    PLATFORM_ALL_MODULES,
    PLATFORM_HQ_TENANT_CODE,
} from './platform-owner';
import { encryptEmailCandidates, decryptFieldTolerant } from '@/lib/encryption';
import { isSafeWebhookDestinationUrl } from '@/lib/metadata/platform';

type SSOCallbackResult =
    | {
        success: true;
        userId: string;
        email: string;
        tenantId: string;
        tenantCode?: string;
        tenantDomain?: string;
        role: string;
        displayName?: string;
        companyId?: string;
        subscriptionTier?: string;
        activeModules?: string[];
        mfaEnabled: boolean;
        mfaVerified: boolean;
        sessionVersion: number;
        tenantSessionVersion: number;
    }
    | {
        success: false;
        error: string;
    };

type OidcConfig = {
    issuer?: string;
    jwksUri?: string;
    authorizationUrl?: string;
    tokenUrl?: string;
    userInfoUrl?: string;
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
    scopes: string;
    tenantId?: string;
    assumeMfa: boolean;
    requireVerifiedEmail: boolean;
};

type OidcTokenResponse = {
    access_token?: string;
    id_token?: string;
    token_type?: string;
    error?: string;
    error_description?: string;
};

export type OidcUserInfo = {
    iss?: string;
    sub?: string;
    email?: string;
    email_verified?: boolean;
    preferred_username?: string;
    name?: string;
    given_name?: string;
    family_name?: string;
    aud?: string | string[];
    azp?: string;
    exp?: number;
    nbf?: number;
    iat?: number;
};

type OidcDiscoveryDocument = {
    issuer?: string;
    jwks_uri?: string;
};

type JwkRecord = crypto.JsonWebKey & {
    kid?: string;
    use?: string;
    alg?: string;
    kty?: string;
};

type JwksDocument = {
    keys?: JwkRecord[];
};

type IdentityUserRow = {
    id: string;
    tenantId: string;
    tenantCode: string | null;
    tenantDomain: string | null;
    email: string;
    role: string;
    firstName: string | null;
    lastName: string | null;
    isActive: boolean;
    mfaEnabled: boolean;
    sessionVersion?: number;
    tenantIsActive: boolean;
    tenantSessionVersion?: number;
    companyId: string | null;
    companyIsActive: boolean | null;
    subscriptionTier: string | null;
    activeModules: string[] | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const JWKS_CACHE_MAX_ENTRIES = 64;
const jwksCache = new Map<string, { keys: JwkRecord[]; expiresAt: number }>();

export function clearJwksCacheForTests(): void {
    if (process.env.NODE_ENV === 'test') {
        jwksCache.clear();
    }
}

function providerEnv(provider: string, key: string): string | undefined {
    const normalizedProvider = provider.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_');
    return process.env[`SSO_${normalizedProvider}_${key}`] || process.env[`SSO_${key}`];
}

function oidcConfig(provider: string): OidcConfig {
    return {
        issuer: providerEnv(provider, 'ISSUER'),
        jwksUri: providerEnv(provider, 'JWKS_URI'),
        authorizationUrl: providerEnv(provider, 'AUTHORIZATION_URL'),
        tokenUrl: providerEnv(provider, 'TOKEN_URL'),
        userInfoUrl: providerEnv(provider, 'USERINFO_URL'),
        clientId: providerEnv(provider, 'CLIENT_ID'),
        clientSecret: providerEnv(provider, 'CLIENT_SECRET'),
        redirectUri: providerEnv(provider, 'REDIRECT_URI'),
        scopes: providerEnv(provider, 'SCOPES') || 'openid email profile',
        tenantId: providerEnv(provider, 'TENANT_ID'),
        assumeMfa: providerEnv(provider, 'ASSUME_MFA') === 'true',
        requireVerifiedEmail: providerEnv(provider, 'REQUIRE_VERIFIED_EMAIL') !== 'false',
    };
}

function normalizeIssuer(value: string): string {
    return value.trim().replace(/\/+$/, '');
}

function isPrivateOrLoopbackIp(address: string): boolean {
    const normalized = address.trim().toLowerCase();
    if (
        normalized === '::1' ||
        normalized === '::' ||
        normalized.startsWith('fe80:') ||
        normalized.startsWith('fc') ||
        normalized.startsWith('fd')
    ) {
        return true;
    }

    const mappedPrefix = '::ffff:';
    const ipv4Candidate = normalized.startsWith(mappedPrefix)
        ? normalized.slice(mappedPrefix.length)
        : normalized;

    const parts = ipv4Candidate.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
        return false;
    }
    const [a, b] = parts;
    return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168)
    );
}

async function assertSafeOidcEndpoint(rawUrl: string): Promise<URL> {
    if (!isSafeWebhookDestinationUrl(rawUrl)) {
        throw new Error('OIDC endpoint must use a public HTTPS URL.');
    }

    const parsed = new URL(rawUrl);
    if (process.env.NODE_ENV !== 'test') {
        const resolved = await dns.lookup(parsed.hostname, { all: true });
        if (resolved.length === 0 || resolved.some((entry) => isPrivateOrLoopbackIp(entry.address))) {
            throw new Error('OIDC endpoint resolved to a non-public IP address.');
        }
    }

    return parsed;
}

async function safeOidcFetch(url: string, init?: RequestInit): Promise<Response> {
    await assertSafeOidcEndpoint(url);
    return fetch(url, {
        ...init,
        redirect: 'error',
    });
}

function decodeBase64UrlJson<T>(segment: string): T | null {
    try {
        return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T;
    } catch {
        return null;
    }
}

async function resolveJwksForIssuer(issuer: string, explicitJwksUri?: string): Promise<JwkRecord[]> {
    const normalizedIss = normalizeIssuer(issuer);
    const cacheKey = explicitJwksUri ? `${normalizedIss}|${explicitJwksUri}` : normalizedIss;
    const now = Date.now();
    const cached = jwksCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
        return cached.keys;
    }

    let jwksUri = explicitJwksUri?.trim();
    if (!jwksUri) {
        const discoveryUrl = `${normalizedIss}/.well-known/openid-configuration`;
        const discoveryResponse = await safeOidcFetch(discoveryUrl, {
            headers: { accept: 'application/json' },
        });
        const discovery = await readJson<OidcDiscoveryDocument>(discoveryResponse);
        if (!discoveryResponse.ok || !discovery?.jwks_uri) {
            throw new Error('Failed to load OIDC discovery configuration.');
        }
        if (discovery.issuer && normalizeIssuer(discovery.issuer) !== normalizedIss) {
            throw new Error('OIDC discovery issuer mismatch.');
        }
        jwksUri = discovery.jwks_uri;
    }

    const jwksResponse = await safeOidcFetch(jwksUri, {
        headers: { accept: 'application/json' },
    });
    const jwks = await readJson<JwksDocument>(jwksResponse);
    if (!jwksResponse.ok || !Array.isArray(jwks?.keys) || jwks.keys.length === 0) {
        throw new Error('Failed to load OIDC JWKS signing keys.');
    }

    if (jwksCache.size >= JWKS_CACHE_MAX_ENTRIES) {
        const oldest = jwksCache.keys().next().value;
        if (oldest) jwksCache.delete(oldest);
    }
    jwksCache.set(cacheKey, {
        keys: jwks.keys,
        expiresAt: now + JWKS_CACHE_TTL_MS,
    });
    return jwks.keys;
}

export async function verifyOidcIdToken(
    idToken: string,
    options: {
        clientId: string;
        expectedIssuer?: string;
        trustedEndpointOrigin?: string;
        jwksUri?: string;
        nowSeconds?: number;
    },
): Promise<OidcUserInfo> {
    const parts = idToken.split('.');
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
        throw new Error('Malformed OIDC ID token.');
    }

    const header = decodeBase64UrlJson<{ alg?: string; kid?: string }>(parts[0]);
    const payload = decodeBase64UrlJson<OidcUserInfo>(parts[1]);
    if (!header || !payload) {
        throw new Error('Malformed OIDC ID token JSON claims.');
    }

    if (header.alg !== 'RS256' && header.alg !== 'ES256') {
        throw new Error(`Unsupported OIDC ID token signing algorithm: ${String(header.alg)}`);
    }

    if (!payload.iss || typeof payload.iss !== 'string') {
        throw new Error('OIDC ID token is missing iss claim.');
    }
    await assertSafeOidcEndpoint(payload.iss);

    if (options.expectedIssuer) {
        if (normalizeIssuer(payload.iss) !== normalizeIssuer(options.expectedIssuer)) {
            throw new Error('OIDC ID token issuer mismatch.');
        }
    } else if (options.trustedEndpointOrigin) {
        const issuerOrigin = new URL(payload.iss).origin;
        if (issuerOrigin !== options.trustedEndpointOrigin) {
            throw new Error('OIDC ID token issuer origin does not match configured identity provider.');
        }
    } else {
        throw new Error('OIDC issuer verification requires SSO_ISSUER or a trusted HTTPS endpoint.');
    }

    const audiences = Array.isArray(payload.aud)
        ? payload.aud
        : typeof payload.aud === 'string'
            ? [payload.aud]
            : [];
    if (!options.clientId || !audiences.includes(options.clientId)) {
        throw new Error('OIDC ID token audience mismatch.');
    }
    if (audiences.length > 1 && payload.azp && payload.azp !== options.clientId) {
        throw new Error('OIDC ID token authorized party (azp) mismatch.');
    }

    const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp) || payload.exp <= now) {
        throw new Error('OIDC ID token has expired.');
    }
    if (typeof payload.nbf === 'number' && Number.isFinite(payload.nbf) && payload.nbf > now + 60) {
        throw new Error('OIDC ID token is not yet valid.');
    }

    const candidateJwks = (await resolveJwksForIssuer(payload.iss, options.jwksUri)).filter((jwk) => {
        if (jwk.use && jwk.use !== 'sig') return false;
        if (header.kid && jwk.kid && jwk.kid !== header.kid) return false;
        if (header.alg === 'RS256' && jwk.kty !== 'RSA') return false;
        if (header.alg === 'ES256' && jwk.kty !== 'EC') return false;
        return true;
    });

    if (candidateJwks.length === 0) {
        throw new Error('No matching OIDC JWK found for ID token signature verification.');
    }

    const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`, 'utf8');
    const signature = Buffer.from(parts[2], 'base64url');

    let signatureVerified = false;
    for (const jwk of candidateJwks) {
        try {
            const publicKey = crypto.createPublicKey({
                key: jwk,
                format: 'jwk',
            });
            const valid = header.alg === 'RS256'
                ? crypto.verify('RSA-SHA256', signingInput, publicKey, signature)
                : crypto.verify(
                    'sha256',
                    signingInput,
                    { key: publicKey, dsaEncoding: 'ieee-p1363' },
                    signature,
                );
            if (valid) {
                signatureVerified = true;
                break;
            }
        } catch {
            // Try next matching key in rotation set.
        }
    }

    if (!signatureVerified) {
        throw new Error('OIDC ID token cryptographic signature verification failed.');
    }

    return payload;
}

export function clearOidcJwksCacheForTests(): void {
    jwksCache.clear();
}

function emailFromUserInfo(userInfo: OidcUserInfo): string | null {
    const candidate = (userInfo.email || userInfo.preferred_username || '').trim().toLowerCase();
    if (!candidate || !candidate.includes('@')) return null;
    return candidate;
}

function displayNameFor(row: IdentityUserRow, userInfo: OidcUserInfo): string {
    return userInfo.name || [row.firstName, row.lastName].filter(Boolean).join(' ') || row.email;
}

async function readJson<T>(response: Response): Promise<T | null> {
    try {
        return await response.json() as T;
    } catch {
        return null;
    }
}

async function exchangeCodeForToken(
    code: string,
    provider: string,
    redirectUri?: string,
): Promise<{ ok: true; token: OidcTokenResponse } | { ok: false; error: string }> {
    const config = oidcConfig(provider);
    if (!config.tokenUrl || !config.clientId || !config.clientSecret) {
        return { ok: false, error: 'Enterprise SSO token exchange is not configured.' };
    }

    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
    });
    const callbackRedirectUri = redirectUri || config.redirectUri;
    if (callbackRedirectUri) {
        body.set('redirect_uri', callbackRedirectUri);
    }

    let response: Response;
    try {
        response = await safeOidcFetch(config.tokenUrl, {
            method: 'POST',
            headers: {
                accept: 'application/json',
                'content-type': 'application/x-www-form-urlencoded',
            },
            body,
        });
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : 'Enterprise SSO token endpoint rejected.',
        };
    }

    const token = await readJson<OidcTokenResponse>(response);
    if (!response.ok || !token) {
        return { ok: false, error: 'Enterprise SSO token exchange failed.' };
    }
    if (token.error) {
        return { ok: false, error: token.error_description || token.error };
    }
    if (!token.access_token && !token.id_token) {
        return { ok: false, error: 'Enterprise SSO did not return an access token or ID token.' };
    }

    return { ok: true, token };
}

async function fetchVerifiedUserInfo(
    provider: string,
    token: OidcTokenResponse,
): Promise<{ ok: true; userInfo: OidcUserInfo } | { ok: false; error: string }> {
    const config = oidcConfig(provider);
    if (!config.clientId) {
        return { ok: false, error: 'Enterprise SSO client_id is not configured.' };
    }

    let verifiedIdTokenClaims: OidcUserInfo | null = null;
    if (token.id_token) {
        let trustedEndpointOrigin: string | undefined;
        try {
            const refUrl = config.tokenUrl || config.authorizationUrl;
            if (refUrl) trustedEndpointOrigin = new URL(refUrl).origin;
        } catch {
            trustedEndpointOrigin = undefined;
        }

        try {
            verifiedIdTokenClaims = await verifyOidcIdToken(token.id_token, {
                clientId: config.clientId,
                expectedIssuer: config.issuer,
                trustedEndpointOrigin,
                jwksUri: config.jwksUri,
            });
        } catch (error) {
            return {
                ok: false,
                error: error instanceof Error ? error.message : 'Invalid Enterprise SSO ID token.',
            };
        }
    }

    if (config.userInfoUrl && token.access_token) {
        try {
            const response = await safeOidcFetch(config.userInfoUrl, {
                headers: {
                    accept: 'application/json',
                    authorization: `Bearer ${token.access_token}`,
                },
            });
            if (response.ok) {
                const userInfo = await readJson<OidcUserInfo>(response);
                if (userInfo) {
                    if (verifiedIdTokenClaims?.sub && userInfo.sub && verifiedIdTokenClaims.sub !== userInfo.sub) {
                        return { ok: false, error: 'OIDC userinfo subject does not match verified ID token.' };
                    }
                    return {
                        ok: true,
                        userInfo: verifiedIdTokenClaims ? { ...verifiedIdTokenClaims, ...userInfo } : userInfo,
                    };
                }
            }
        } catch (error) {
            return {
                ok: false,
                error: error instanceof Error ? error.message : 'Enterprise SSO userinfo request failed.',
            };
        }
    }

    if (verifiedIdTokenClaims) {
        return { ok: true, userInfo: verifiedIdTokenClaims };
    }

    return { ok: false, error: 'Enterprise SSO did not return verified user identity claims.' };
}

async function findExistingIdentityUser(
    email: string,
    tenantId?: string,
): Promise<{ ok: true; user: IdentityUserRow } | { ok: false; error: string }> {
    if (tenantId && !UUID_RE.test(tenantId)) {
        return { ok: false, error: 'Enterprise SSO tenant mapping is invalid.' };
    }

    const values: Array<string | string[]> = [email, encryptEmailCandidates(email)];
    const tenantFilter = tenantId ? 'AND u.tenant_id = $3' : '';
    if (tenantId) values.push(tenantId);

    const result = await runWithRlsBypass<QueryResult<IdentityUserRow>>(
        RLS_BYPASS_JUSTIFICATIONS.ENTERPRISE_IDENTITY_LOOKUP,
        () => pool.query<IdentityUserRow>(
        `SELECT
            u.id,
            u.tenant_id AS "tenantId",
            t.code AS "tenantCode",
            t.domain AS "tenantDomain",
            COALESCE(u.email_enc, u.email) AS "email",
            u.role,
            u.first_name AS "firstName",
            u.last_name AS "lastName",
            u.is_active AS "isActive",
            u.mfa_enabled AS "mfaEnabled",
            u.session_version AS "sessionVersion",
            t.is_active AS "tenantIsActive",
            t.session_version AS "tenantSessionVersion",
            c.id AS "companyId",
            c.is_active AS "companyIsActive",
            c.subscription_tier AS "subscriptionTier",
            c.active_modules AS "activeModules"
         FROM users u
         JOIN tenants t ON t.id = u.tenant_id
         LEFT JOIN companies c ON c.id = t.company_id
         WHERE (u.email_enc = ANY($2::text[]) OR lower(u.email) = lower($1))
         ${tenantFilter}
         LIMIT 2`,
        values,
        ),
    );
    const rows = result.rows;

    if (rows.length === 0) {
        return { ok: false, error: 'No active local account is linked to this SSO identity.' };
    }
    if (rows.length > 1) {
        return { ok: false, error: 'SSO identity is ambiguous across tenants. Configure SSO_TENANT_ID for this provider.' };
    }

    const user = rows[0];
    user.email = user.email == null ? user.email : decryptFieldTolerant(user.email);
    if (!user.isActive || !user.tenantIsActive || (user.companyId && !user.companyIsActive)) {
        return { ok: false, error: 'This SSO account or tenant is inactive.' };
    }

    return { ok: true, user };
}

export async function generateSSOAuthorizationUrl(
    provider: string,
    redirectUri: string,
    state?: string,
): Promise<string> {
    const config = oidcConfig(provider);

    if (!config.authorizationUrl || !config.clientId) {
        throw new Error('Enterprise SSO is not configured.');
    }
    if (!isSafeWebhookDestinationUrl(config.authorizationUrl)) {
        throw new Error('Enterprise SSO authorization URL must use a public HTTPS origin.');
    }

    const url = new URL(config.authorizationUrl);
    url.searchParams.set('provider', provider);
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', redirectUri || config.redirectUri || '');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', config.scopes);
    if (state) {
        url.searchParams.set('state', state);
    }
    return url.toString();
}

export async function handleSSOCallback(
    code: string,
    provider: string,
    redirectUri?: string,
): Promise<SSOCallbackResult> {
    if (!code) {
        return { success: false, error: 'Missing SSO authorization code.' };
    }

    const config = oidcConfig(provider);
    const tokenResult = await exchangeCodeForToken(code, provider, redirectUri);
    if (tokenResult.ok === false) {
        return { success: false, error: tokenResult.error };
    }

    const verifiedUserInfo = await fetchVerifiedUserInfo(provider, tokenResult.token);
    if (verifiedUserInfo.ok === false) {
        return { success: false, error: verifiedUserInfo.error };
    }
    const { userInfo } = verifiedUserInfo;

    if (config.clientId && userInfo.aud) {
        const audiences = Array.isArray(userInfo.aud) ? userInfo.aud : [userInfo.aud];
        if (audiences.length > 0 && !audiences.includes(config.clientId)) {
            return { success: false, error: 'Enterprise SSO token audience is invalid.' };
        }
    }
    if (config.requireVerifiedEmail && userInfo.email_verified === false) {
        return { success: false, error: 'Enterprise SSO email is not verified.' };
    }

    const email = emailFromUserInfo(userInfo);
    if (!email) {
        return { success: false, error: 'Enterprise SSO did not return a usable email address.' };
    }

    const identity = await findExistingIdentityUser(email, config.tenantId);
    if (identity.ok === false) {
        return { success: false, error: identity.error };
    }

    const { user } = identity;
    if (
        user.role === 'PLATFORM_ADMIN' ||
        isPermanentPlatformAdminEmail(user.email)
    ) {
        if (
            user.role !== 'PLATFORM_ADMIN' ||
            (user.tenantCode || '').toUpperCase() !== PLATFORM_HQ_TENANT_CODE ||
            !isPermanentPlatformAdminEmail(user.email)
        ) {
            return { success: false, error: 'Invalid platform administrator identity mapping.' };
        }
    }

    const roleRequiresMfa = isRoleMfaRequired(user.role, { tenantCode: user.tenantCode });
    const requiresMfaBackedSso =
        user.mfaEnabled || (roleRequiresMfa && !user.mfaEnabled && isMfaEnrollmentEnforced());
    if (requiresMfaBackedSso && !config.assumeMfa) {
        return {
            success: false,
            error: 'This account requires MFA-backed SSO. Enable SSO_ASSUME_MFA only after enforcing MFA at the identity provider.',
        };
    }

    const isHqAdmin = user.role === 'PLATFORM_ADMIN';

    return {
        success: true,
        userId: user.id,
        tenantId: user.tenantId,
        tenantCode: user.tenantCode || undefined,
        tenantDomain: user.tenantDomain || undefined,
        role: user.role,
        email: user.email,
        displayName: displayNameFor(user, userInfo),
        companyId: user.companyId || undefined,
        subscriptionTier: isHqAdmin ? 'ENTERPRISE' : (user.subscriptionTier || undefined),
        activeModules: isHqAdmin
            ? [...PLATFORM_ALL_MODULES]
            : (Array.isArray(user.activeModules) ? user.activeModules : []),
        mfaEnabled: Boolean(user.mfaEnabled),
        mfaVerified: config.assumeMfa,
        sessionVersion: Number(user.sessionVersion ?? 1),
        tenantSessionVersion: Number(user.tenantSessionVersion ?? 1),
    };
}
