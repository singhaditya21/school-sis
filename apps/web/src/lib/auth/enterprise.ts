import { pool, runWithRlsBypass } from '@/lib/db';
import type { QueryResult } from 'pg';
import { shouldRequireMfaEnrollment } from './identity';

type SSOCallbackResult =
    | {
        success: true;
        userId: string;
        email: string;
        tenantId: string;
        role: string;
        displayName?: string;
        companyId?: string;
        subscriptionTier?: string;
        activeModules?: string[];
        mfaEnabled: boolean;
        mfaVerified: boolean;
    }
    | {
        success: false;
        error: string;
    };

type OidcConfig = {
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

type OidcUserInfo = {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    preferred_username?: string;
    name?: string;
    given_name?: string;
    family_name?: string;
    aud?: string | string[];
};

type IdentityUserRow = {
    id: string;
    tenantId: string;
    email: string;
    role: string;
    firstName: string | null;
    lastName: string | null;
    isActive: boolean;
    mfaEnabled: boolean;
    tenantIsActive: boolean;
    companyId: string | null;
    companyIsActive: boolean | null;
    subscriptionTier: string | null;
    activeModules: string[] | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

function providerEnv(provider: string, key: string): string | undefined {
    const normalizedProvider = provider.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_');
    return process.env[`SSO_${normalizedProvider}_${key}`] || process.env[`SSO_${key}`];
}

function oidcConfig(provider: string): OidcConfig {
    return {
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

function decodeJwtPayload(idToken: string): OidcUserInfo | null {
    const payload = idToken.split('.')[1];
    if (!payload) return null;

    try {
        const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
        return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as OidcUserInfo;
    } catch {
        return null;
    }
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

    const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
            accept: 'application/json',
            'content-type': 'application/x-www-form-urlencoded',
        },
        body,
    });

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

async function fetchUserInfo(provider: string, token: OidcTokenResponse): Promise<OidcUserInfo | null> {
    const config = oidcConfig(provider);

    if (config.userInfoUrl && token.access_token) {
        const response = await fetch(config.userInfoUrl, {
            headers: {
                accept: 'application/json',
                authorization: `Bearer ${token.access_token}`,
            },
        });
        if (response.ok) {
            const userInfo = await readJson<OidcUserInfo>(response);
            if (userInfo) return userInfo;
        }
    }

    return token.id_token ? decodeJwtPayload(token.id_token) : null;
}

async function findExistingIdentityUser(
    email: string,
    tenantId?: string,
): Promise<{ ok: true; user: IdentityUserRow } | { ok: false; error: string }> {
    if (tenantId && !UUID_RE.test(tenantId)) {
        return { ok: false, error: 'Enterprise SSO tenant mapping is invalid.' };
    }

    const values: string[] = [email];
    const tenantFilter = tenantId ? 'AND u.tenant_id = $2' : '';
    if (tenantId) values.push(tenantId);

    const result = await runWithRlsBypass<QueryResult<IdentityUserRow>>(() => pool.query<IdentityUserRow>(
        `SELECT
            u.id,
            u.tenant_id AS "tenantId",
            u.email,
            u.role,
            u.first_name AS "firstName",
            u.last_name AS "lastName",
            u.is_active AS "isActive",
            u.mfa_enabled AS "mfaEnabled",
            t.is_active AS "tenantIsActive",
            c.id AS "companyId",
            c.is_active AS "companyIsActive",
            c.subscription_tier AS "subscriptionTier",
            c.active_modules AS "activeModules"
         FROM users u
         JOIN tenants t ON t.id = u.tenant_id
         LEFT JOIN companies c ON c.id = t.company_id
         WHERE lower(u.email) = lower($1)
         ${tenantFilter}
         LIMIT 2`,
        values,
    ));
    const rows = result.rows;

    if (rows.length === 0) {
        return { ok: false, error: 'No active local account is linked to this SSO identity.' };
    }
    if (rows.length > 1) {
        return { ok: false, error: 'SSO identity is ambiguous across tenants. Configure SSO_TENANT_ID for this provider.' };
    }

    const user = rows[0];
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

    const userInfo = await fetchUserInfo(provider, tokenResult.token);
    if (!userInfo) {
        return { success: false, error: 'Enterprise SSO did not return user identity claims.' };
    }
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
    const requiresMfaBackedSso = user.mfaEnabled || shouldRequireMfaEnrollment(user.role, Boolean(user.mfaEnabled));
    if (requiresMfaBackedSso && !config.assumeMfa) {
        return { success: false, error: 'This account requires MFA-backed SSO. Enable SSO_ASSUME_MFA only after enforcing MFA at the identity provider.' };
    }

    return {
        success: true,
        userId: user.id,
        tenantId: user.tenantId,
        role: user.role,
        email: user.email,
        displayName: displayNameFor(user, userInfo),
        companyId: user.companyId || undefined,
        subscriptionTier: user.subscriptionTier || undefined,
        activeModules: Array.isArray(user.activeModules) ? user.activeModules : [],
        mfaEnabled: Boolean(user.mfaEnabled),
        mfaVerified: config.assumeMfa,
    };
}
