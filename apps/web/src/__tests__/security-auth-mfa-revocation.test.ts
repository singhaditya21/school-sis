import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const mockPoolQuery = jest.fn();
const mockRunWithRlsBypass = jest.fn((_justification: unknown, fn: () => unknown) => fn());
const mockRunWithTenantContext = jest.fn((_tenantId: string, fn: () => unknown) => fn());

const mockSelectFirst = jest.fn();
const mockScopeUpdate = jest.fn();

jest.mock('@/lib/db', () => ({
    pool: {
        query: (...args: unknown[]) => mockPoolQuery(...args),
    },
    runWithRlsBypass: (j: unknown, fn: () => unknown) => mockRunWithRlsBypass(j, fn),
    runWithTenantContext: (t: string, fn: () => unknown) => mockRunWithTenantContext(t, fn),
    RLS_BYPASS_JUSTIFICATIONS: {
        SESSION_REVOCATION_CHECK: 'auth.session-revocation-check',
        ENTERPRISE_IDENTITY_LOOKUP: 'auth.enterprise-identity',
        DEMO_TENANT_LOOKUP: 'security.demo-tenant-lookup',
    },
}));

jest.mock('@school-sis/api/src/data', () => ({
    eq: (col: unknown, val: unknown) => ({ col, val }),
    tenantScope: () => ({
        from: () => ({
            select: () => ({
                where: () => ({
                    first: () => mockSelectFirst(),
                }),
            }),
        }),
        update: (...args: unknown[]) => mockScopeUpdate(...args),
    }),
}));

import {
    isRoleMfaRequired,
    MFA_REQUIRED_ROLE_NAMES,
    sessionOptions,
} from '@/lib/auth/session-options';
import {
    canonicalizeEmailIdentity,
    DEMO_SANDBOX_SOUTH_TENANT_CODE,
    isPermanentPlatformAdminEmail,
    isReservedWorkspaceCode,
} from '@/lib/auth/platform-owner';
import { disableMFA, isMFARequired, redeemBackupCode } from '@/lib/auth/mfa';
import {
    assertActiveSessionState,
    clearSessionRevocationCache,
    evictTenantSessionCache,
    evictUserSessionCache,
    isSessionStateActive,
} from '@/lib/auth/session-revocation';
import { assertSameOriginMutation } from '@/lib/security/client-ip';
import { isValidTenantId, readTenantScopedJson } from '@/lib/tenant/isolation';
import { clearJwksCacheForTests, verifyOidcIdToken } from '@/lib/auth/enterprise';

function toBase64Url(input: Buffer | string): string {
    const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
    return buf.toString('base64url');
}

describe('Security Hardening — Auth, MFA Enrollment Gate, Session Revocation, CSRF & Platform Boundary', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        jest.clearAllMocks();
        mockPoolQuery.mockReset();
        mockSelectFirst.mockReset();
        mockScopeUpdate.mockReset();
        clearSessionRevocationCache();
        clearJwksCacheForTests();
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    describe('HIGH-02: redeemBackupCode requires active mfa_enabled = true', () => {
        it('rejects backup code redemption when mfa_enabled is false during incomplete enrollment', async () => {
            const rawCode = 'A1B2C3D4E5';
            const hashed = await bcrypt.hash(rawCode, 4);
            mockSelectFirst.mockResolvedValueOnce({
                mfaEnabled: false,
                mfaBackupCodes: [hashed],
            });

            const result = await redeemBackupCode('user-1', 'tenant-1', rawCode);

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/must be active/i);
            expect(mockScopeUpdate).not.toHaveBeenCalled();
        });

        it('succeeds and consumes the single-use backup code when mfa_enabled is true', async () => {
            const rawCode = 'F6E5D4C3B2';
            const otherCode = '1122334455';
            const [hashTarget, hashOther] = await Promise.all([
                bcrypt.hash(rawCode, 4),
                bcrypt.hash(otherCode, 4),
            ]);
            mockSelectFirst.mockResolvedValueOnce({
                mfaEnabled: true,
                mfaBackupCodes: [hashTarget, hashOther],
            });
            mockScopeUpdate.mockResolvedValueOnce(undefined);

            const result = await redeemBackupCode('user-1', 'tenant-1', 'f6e5d-4c3b2');

            expect(result).toEqual({
                success: true,
                codesRemaining: 1,
            });
            expect(mockScopeUpdate).toHaveBeenCalledTimes(1);
            expect(mockScopeUpdate.mock.calls[0]?.[1]).toEqual({
                mfaBackupCodes: [hashOther],
            });
        });

        it('bumps users.session_version and evicts revocation cache when disableMFA runs', async () => {
            mockPoolQuery.mockResolvedValueOnce({ rows: [] });

            await disableMFA('user-9', 'tenant-9');

            expect(mockPoolQuery).toHaveBeenCalledTimes(1);
            const [sqlText, params] = mockPoolQuery.mock.calls[0] as [string, unknown[]];
            expect(sqlText).toContain('session_version = session_version + 1');
            expect(params).toEqual(['user-9', 'tenant-9']);
        });
    });

    describe('CRIT-03, HIGH-02 & LOW-03: Unified MFA_REQUIRED_ROLE_NAMES, Demo Sandbox Exemption & 12h Cookie TTL', () => {
        it('requires MFA for FINANCE_LEAD and GROUP_EXECUTIVE while exempting demo sandbox sessions', () => {
            expect(MFA_REQUIRED_ROLE_NAMES).toEqual(
                expect.arrayContaining([
                    'PLATFORM_ADMIN',
                    'SUPER_ADMIN',
                    'GROUP_EXECUTIVE',
                    'SCHOOL_ADMIN',
                    'PRINCIPAL',
                    'FINANCE_LEAD',
                    'ACCOUNTANT',
                ]),
            );

            expect(isRoleMfaRequired('FINANCE_LEAD')).toBe(true);
            expect(isRoleMfaRequired('GROUP_EXECUTIVE')).toBe(true);
            expect(isRoleMfaRequired('TEACHER')).toBe(false);

            expect(isRoleMfaRequired('FINANCE_LEAD', { isDemoSandbox: true })).toBe(false);
            expect(isRoleMfaRequired('FINANCE_LEAD', { tenantCode: 'DEMO-CAMPUS' })).toBe(false);
            expect(isRoleMfaRequired('GROUP_EXECUTIVE', { tenantCode: 'demo-campus-south' })).toBe(false);
            expect(isMFARequired('FINANCE_LEAD', { isDemoSandbox: true })).toBe(false);

            expect(sessionOptions.cookieOptions?.maxAge).toBe(60 * 60 * 12);
        });
    });

    describe('MED-02: Canonical Platform-Owner Email Identity & Reserved Demo Campus Codes', () => {
        it('catches Gmail dot, +tag, and googlemail.com aliases for singhaditya21@gmail.com', () => {
            expect(canonicalizeEmailIdentity('  Singh.Aditya.21+test@Gmail.com ')).toBe(
                'singhaditya21@gmail.com',
            );
            expect(canonicalizeEmailIdentity('singhaditya21@googlemail.com')).toBe(
                'singhaditya21@gmail.com',
            );
            expect(canonicalizeEmailIdentity('s.i.n.g.h.aditya21+hq@googlemail.com')).toBe(
                'singhaditya21@gmail.com',
            );
            // Non-Gmail domains preserve local-part dots and subaddress tags
            expect(canonicalizeEmailIdentity('singh.aditya.21+staff@stjudes.edu')).toBe(
                'singh.aditya.21+staff@stjudes.edu',
            );

            expect(isPermanentPlatformAdminEmail('singh.aditya.21+test@gmail.com')).toBe(true);
            expect(isPermanentPlatformAdminEmail('singhaditya21@googlemail.com')).toBe(true);
            expect(isPermanentPlatformAdminEmail('S.inghAditya21+bypass@GOOGLEMAIL.COM')).toBe(true);
            expect(isPermanentPlatformAdminEmail('singhaditya21@stjudes.edu')).toBe(false);

            expect(DEMO_SANDBOX_SOUTH_TENANT_CODE).toBe('DEMO-CAMPUS-SOUTH');
            expect(isReservedWorkspaceCode('DEMO-CAMPUS-SOUTH')).toBe(true);
            expect(isReservedWorkspaceCode('demo-campus-south')).toBe(true);
        });
    });

    describe('MED-01: CSRF Same-Origin Mutation & Strict JSON Content-Type Enforcement', () => {
        const tenantA = '018f4b7e-8c12-7a9b-9abc-111111111111'; // UUIDv7 ([1-8])

        it('rejects cross-origin and cross-site cookie mutations while allowing same-origin and Bearer requests', () => {
            expect(isValidTenantId(tenantA)).toBe(true);

            const crossOriginReq = new Request('https://app.scholarmind.app/api/logout', {
                method: 'POST',
                headers: {
                    origin: 'https://evil.attacker.example',
                },
            });
            const crossOriginBlock = assertSameOriginMutation(crossOriginReq);
            expect(crossOriginBlock?.status).toBe(403);

            const crossSiteFetchReq = new Request('https://app.scholarmind.app/api/students', {
                method: 'POST',
                headers: {
                    'sec-fetch-site': 'cross-site',
                },
            });
            expect(assertSameOriginMutation(crossSiteFetchReq)?.status).toBe(403);

            const sameOriginReq = new Request('https://app.scholarmind.app/api/students', {
                method: 'POST',
                headers: {
                    origin: 'https://app.scholarmind.app',
                    'sec-fetch-site': 'same-origin',
                },
            });
            expect(assertSameOriginMutation(sameOriginReq)).toBeNull();

            const bearerReq = new Request('https://app.scholarmind.app/api/scim/v2/Users', {
                method: 'POST',
                headers: {
                    origin: 'https://idp.partner.example',
                    authorization: 'Bearer scim-live-token-xyz',
                },
            });
            expect(assertSameOriginMutation(bearerReq)).toBeNull();
        });

        it('rejects non-JSON Content-Type with 415 while accepting valid application/json in readTenantScopedJson', async () => {
            const formCsrfReq = new Request('https://app.scholarmind.app/api/students', {
                method: 'POST',
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                },
                body: 'firstName=Evil',
            });
            const formResult = await readTenantScopedJson(formCsrfReq, tenantA);
            expect(formResult.ok).toBe(false);
            if (!formResult.ok) {
                expect(formResult.response.status).toBe(415);
            }

            const missingCtReq = new Request('https://app.scholarmind.app/api/students', {
                method: 'POST',
                body: new Uint8Array(Buffer.from('{"firstName":"Aarav"}')),
            });
            const missingCtResult = await readTenantScopedJson(missingCtReq, tenantA);
            expect(missingCtResult.ok).toBe(false);
            if (!missingCtResult.ok) {
                expect(missingCtResult.response.status).toBe(415);
            }

            const validJsonReq = new Request('https://app.scholarmind.app/api/students', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json; charset=utf-8',
                },
                body: JSON.stringify({ firstName: 'Aarav', tenantId: tenantA }),
            });
            const validResult = await readTenantScopedJson<{ firstName: string }>(
                validJsonReq,
                tenantA,
            );
            expect(validResult).toEqual({
                ok: true,
                data: { firstName: 'Aarav', tenantId: tenantA },
            });
        });
    });

    describe('HIGH-03: Server-Side session_version, User Active & Tenant Active Session Revocation', () => {
        const baseSession = {
            isLoggedIn: true,
            userId: 'user-rev-1',
            tenantId: 'tenant-rev-1',
            role: 'SCHOOL_ADMIN',
            sessionVersion: 3,
            tenantSessionVersion: 2,
        };

        it('allows matching active session state and caches within TTL until evicted', async () => {
            mockPoolQuery.mockResolvedValueOnce({
                rows: [
                    {
                        user_active: true,
                        current_role: 'SCHOOL_ADMIN',
                        user_session_version: 3,
                        tenant_active: true,
                        tenant_session_version: 2,
                    },
                ],
            });

            await expect(assertActiveSessionState(baseSession)).resolves.toBeUndefined();
            await expect(assertActiveSessionState(baseSession)).resolves.toBeUndefined();
            expect(mockPoolQuery).toHaveBeenCalledTimes(1);

            // Evicting user session cache forces immediate re-validation against DB
            evictUserSessionCache('tenant-rev-1', 'user-rev-1');
            mockPoolQuery.mockResolvedValueOnce({
                rows: [
                    {
                        user_active: true,
                        current_role: 'SCHOOL_ADMIN',
                        user_session_version: 4, // bumped after password reset / MFA disable
                        tenant_active: true,
                        tenant_session_version: 2,
                    },
                ],
            });

            await expect(assertActiveSessionState(baseSession)).rejects.toThrow(
                /Session revoked or inactive/i,
            );
            expect(mockPoolQuery).toHaveBeenCalledTimes(2);
        });

        it('rejects deactivated users, suspended tenants, role changes, and bumped tenantSessionVersion', async () => {
            // 1. Deactivated user
            mockPoolQuery.mockResolvedValueOnce({
                rows: [
                    {
                        user_active: false,
                        current_role: 'SCHOOL_ADMIN',
                        user_session_version: 3,
                        tenant_active: true,
                        tenant_session_version: 2,
                    },
                ],
            });
            await expect(assertActiveSessionState(baseSession)).rejects.toThrow(
                /Session revoked or inactive/i,
            );

            // 2. Suspended tenant
            clearSessionRevocationCache();
            mockPoolQuery.mockResolvedValueOnce({
                rows: [
                    {
                        user_active: true,
                        current_role: 'SCHOOL_ADMIN',
                        user_session_version: 3,
                        tenant_active: false,
                        tenant_session_version: 2,
                    },
                ],
            });
            expect(await isSessionStateActive(baseSession)).toBe(false);

            // 3. Tenant session_version bump after evictTenantSessionCache
            evictTenantSessionCache('tenant-rev-1');
            mockPoolQuery.mockResolvedValueOnce({
                rows: [
                    {
                        user_active: true,
                        current_role: 'SCHOOL_ADMIN',
                        user_session_version: 3,
                        tenant_active: true,
                        tenant_session_version: 3,
                    },
                ],
            });
            await expect(assertActiveSessionState(baseSession)).rejects.toThrow(
                /Session revoked or inactive/i,
            );
        });
    });

    describe('MED-11: Cryptographic OIDC ID Token Signature & Claim Verification', () => {
        it('verifies RS256 signed OIDC id_token via OIDC Discovery JWKS and rejects forged or audience-mismatched tokens', async () => {
            const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
                modulusLength: 2048,
            });
            const publicJwk = {
                ...publicKey.export({ format: 'jwk' }),
                kid: 'rsa-key-2026',
                use: 'sig',
                alg: 'RS256',
            };

            const issuer = 'https://idp.institution.example/oauth2';
            const jwksUri = 'https://idp.institution.example/oauth2/jwks.json';

            global.fetch = jest.fn(async (input: RequestInfo | URL) => {
                const url = String(input);
                if (url === `${issuer}/.well-known/openid-configuration`) {
                    return new Response(
                        JSON.stringify({ issuer, jwks_uri: jwksUri }),
                        { status: 200, headers: { 'content-type': 'application/json' } },
                    );
                }
                if (url === jwksUri) {
                    return new Response(
                        JSON.stringify({ keys: [publicJwk] }),
                        { status: 200, headers: { 'content-type': 'application/json' } },
                    );
                }
                return new Response('Not Found', { status: 404 });
            }) as typeof fetch;

            const now = 1_780_000_000;
            const header = toBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'rsa-key-2026' }));
            const payloadObj = {
                iss: issuer,
                sub: 'oidc-subject-42',
                aud: 'scholarmind-enterprise-client',
                email: 'dean@institution.example',
                email_verified: true,
                exp: now + 300,
                iat: now - 10,
            };
            const payload = toBase64Url(JSON.stringify(payloadObj));
            const sig = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${payload}`, 'utf8'), privateKey);
            const validIdToken = `${header}.${payload}.${toBase64Url(sig)}`;

            const verified = await verifyOidcIdToken(validIdToken, {
                clientId: 'scholarmind-enterprise-client',
                expectedIssuer: issuer,
                nowSeconds: now,
            });
            expect(verified.sub).toBe('oidc-subject-42');
            expect(verified.email).toBe('dean@institution.example');

            // Tamper with email claim without re-signing -> must fail cryptographic verification
            const tamperedPayload = toBase64Url(
                JSON.stringify({ ...payloadObj, email: 'attacker@institution.example' }),
            );
            const forgedToken = `${header}.${tamperedPayload}.${toBase64Url(sig)}`;
            await expect(
                verifyOidcIdToken(forgedToken, {
                    clientId: 'scholarmind-enterprise-client',
                    expectedIssuer: issuer,
                    nowSeconds: now,
                }),
            ).rejects.toThrow(/signature verification failed/i);

            // Audience mismatch -> rejected
            await expect(
                verifyOidcIdToken(validIdToken, {
                    clientId: 'different-client-id',
                    expectedIssuer: issuer,
                    nowSeconds: now,
                }),
            ).rejects.toThrow(/audience mismatch/i);

            // Expired token -> rejected
            await expect(
                verifyOidcIdToken(validIdToken, {
                    clientId: 'scholarmind-enterprise-client',
                    expectedIssuer: issuer,
                    nowSeconds: now + 600,
                }),
            ).rejects.toThrow(/expired/i);
        });
    });
});
