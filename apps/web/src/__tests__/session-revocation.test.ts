import { getIronSession } from 'iron-session';
import { pool, runWithTenantContext } from '@/lib/db';
import { getMfaEnrollmentSession, getPasswordChangeSession, getSession } from '@/lib/auth/session';
import { validatePersistedSession } from '@/lib/auth/session-validation';

jest.mock('next/headers', () => ({
    cookies: jest.fn(async () => ({})),
}));

jest.mock('iron-session', () => ({
    getIronSession: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
    pool: { query: jest.fn() },
    runWithTenantContext: jest.fn(),
}));

const TENANT_ID = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_TENANT_ID = '33333333-3333-4333-8333-333333333333';
const ACTOR_USER_ID = '44444444-4444-4444-8444-444444444444';

function persistedRow(overrides: Record<string, unknown> = {}) {
    return {
        role: 'TEACHER',
        email: 'teacher@example.edu',
        isActive: true,
        authVersion: 4,
        passwordChangeRequired: false,
        temporaryPasswordExpiresAt: null,
        tenantIsActive: true,
        companyId: '22222222-2222-4222-8222-222222222222',
        companyIsActive: true,
        ...overrides,
    };
}

function signedSession(overrides: Record<string, unknown> = {}) {
    return {
        userId: USER_ID,
        tenantId: TENANT_ID,
        role: 'TEACHER',
        email: 'teacher@example.edu',
        token: '',
        authVersion: 4,
        isLoggedIn: true,
        destroy: jest.fn(),
        save: jest.fn(),
        ...overrides,
    };
}

describe('persisted signed-session revocation', () => {
    let tenantScopeActive = false;

    beforeEach(() => {
        jest.clearAllMocks();
        tenantScopeActive = false;
        (runWithTenantContext as jest.Mock).mockImplementation(async (
            tenantId: string,
            operation: () => Promise<unknown>,
        ) => {
            expect([TENANT_ID, ACTOR_TENANT_ID]).toContain(tenantId);
            tenantScopeActive = true;
            try {
                return await operation();
            } finally {
                tenantScopeActive = false;
            }
        });
        (pool.query as jest.Mock).mockImplementation(async () => {
            // If this query escaped the explicit scope, the DB resolver could
            // call getSession() again and recurse indefinitely.
            if (!tenantScopeActive) throw new Error('request-context resolver recursion');
            return { rows: [persistedRow()] };
        });
    });

    it('invalidates pre-migration cookies that do not carry authVersion without querying', async () => {
        await expect(validatePersistedSession({
            userId: USER_ID,
            tenantId: TENANT_ID,
        })).resolves.toEqual({ valid: false, reason: 'MISSING_REVISION' });
        expect(pool.query).not.toHaveBeenCalled();
    });

    it('invalidates malformed persisted identity keys without entering DB context', async () => {
        await expect(validatePersistedSession({
            userId: 'not-a-user-id',
            tenantId: TENANT_ID,
            authVersion: 4,
        })).resolves.toEqual({ valid: false, reason: 'INVALID_IDENTITY' });
        expect(runWithTenantContext).not.toHaveBeenCalled();
        expect(pool.query).not.toHaveBeenCalled();
    });

    it('performs the identity lookup inside an explicit tenant scope', async () => {
        await expect(validatePersistedSession({
            userId: USER_ID,
            tenantId: TENANT_ID,
            authVersion: 4,
        })).resolves.toEqual(expect.objectContaining({ valid: true, role: 'TEACHER' }));
        expect(runWithTenantContext).toHaveBeenCalledWith(TENANT_ID, expect.any(Function));
        expect(pool.query).toHaveBeenCalledTimes(1);
    });

    it('withholds identity context from ordinary callers while allowing only the password-replacement path', async () => {
        (pool.query as jest.Mock).mockImplementation(async () => {
            if (!tenantScopeActive) throw new Error('request-context resolver recursion');
            return {
                rows: [persistedRow({
                    passwordChangeRequired: true,
                    temporaryPasswordExpiresAt: new Date(Date.now() + 60_000),
                })],
            };
        });

        const ordinarySession = signedSession({ authProvider: 'password' });
        (getIronSession as jest.Mock).mockResolvedValueOnce(ordinarySession);
        const ordinary = await getSession();
        expect(ordinary.isLoggedIn).toBe(false);
        expect(ordinary.userId).toBe('');
        expect(ordinary.tenantId).toBe('');
        expect(ordinary.role).toBe('');
        expect(ordinary.passwordChangeRequired).toBe(true);
        expect(ordinarySession.destroy).not.toHaveBeenCalled();

        const replacementSession = signedSession({ authProvider: 'password' });
        (getIronSession as jest.Mock).mockResolvedValueOnce(replacementSession);
        const replacement = await getPasswordChangeSession();
        expect(replacement.isLoggedIn).toBe(true);
        expect(replacement.userId).toBe(USER_ID);
        expect(replacement.tenantId).toBe(TENANT_ID);
        expect(replacement.passwordChangeRequired).toBe(true);
    });

    it('withholds unverified MFA identity from ordinary callers and exposes it only to enrollment', async () => {
        const ordinarySession = signedSession({
            mfaRequired: true,
            mfaVerified: false,
        });
        (getIronSession as jest.Mock).mockResolvedValueOnce(ordinarySession);
        const ordinary = await getSession();
        expect(ordinary.isLoggedIn).toBe(false);
        expect(ordinary.userId).toBe('');
        expect(ordinary.tenantId).toBe('');
        expect(ordinary.role).toBe('');
        expect(ordinary.mfaRequired).toBe(true);
        expect(ordinary.mfaVerified).toBe(false);

        const enrollmentSession = signedSession({
            mfaRequired: true,
            mfaVerified: false,
        });
        (getIronSession as jest.Mock).mockResolvedValueOnce(enrollmentSession);
        const enrollment = await getMfaEnrollmentSession();
        expect(enrollment.isLoggedIn).toBe(true);
        expect(enrollment.userId).toBe(USER_ID);
        expect(enrollment.tenantId).toBe(TENANT_ID);

        const wrongRecoverySession = signedSession({
            mfaRequired: true,
            mfaVerified: false,
        });
        (getIronSession as jest.Mock).mockResolvedValueOnce(wrongRecoverySession);
        const wrongRecovery = await getPasswordChangeSession();
        expect(wrongRecovery.isLoggedIn).toBe(false);
        expect(wrongRecovery.userId).toBe('');
    });

    it.each([
        [{ authVersion: 5 }, 'USER_REVOKED'],
        [{ isActive: false }, 'USER_REVOKED'],
        [{ tenantIsActive: false }, 'USER_REVOKED'],
        [{ companyIsActive: false }, 'USER_REVOKED'],
        [{
            passwordChangeRequired: true,
            temporaryPasswordExpiresAt: new Date(Date.now() - 60_000),
        }, 'TEMPORARY_PASSWORD_EXPIRED'],
    ])('rejects revoked persisted state %#', async (overrides, reason) => {
        (pool.query as jest.Mock).mockImplementation(async () => {
            if (!tenantScopeActive) throw new Error('request-context resolver recursion');
            return { rows: [persistedRow(overrides)] };
        });
        await expect(validatePersistedSession({
            userId: USER_ID,
            tenantId: TENANT_ID,
            authVersion: 4,
        })).resolves.toEqual({ valid: false, reason });
    });

    it('binds impersonation validity to both the target and platform actor revisions', async () => {
        const impersonation = {
            actorUserId: ACTOR_USER_ID,
            actorTenantId: ACTOR_TENANT_ID,
            actorEmail: 'platform@example.edu',
            actorAuthVersion: 9,
            startedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
        };
        (pool.query as jest.Mock).mockImplementation(async (_sql: string, values: string[]) => {
            if (!tenantScopeActive) throw new Error('request-context resolver recursion');
            if (values[0] === ACTOR_TENANT_ID) {
                return { rows: [persistedRow({ role: 'PLATFORM_ADMIN', authVersion: 9 })] };
            }
            return { rows: [persistedRow()] };
        });

        await expect(validatePersistedSession({
            userId: USER_ID,
            tenantId: TENANT_ID,
            authVersion: 4,
            authProvider: 'impersonation',
            token: `impersonating:${ACTOR_USER_ID}`,
            impersonation,
        })).resolves.toEqual(expect.objectContaining({ valid: true }));
        expect(runWithTenantContext).toHaveBeenCalledWith(ACTOR_TENANT_ID, expect.any(Function));

        (pool.query as jest.Mock).mockImplementation(async (_sql: string, values: string[]) => {
            if (!tenantScopeActive) throw new Error('request-context resolver recursion');
            if (values[0] === ACTOR_TENANT_ID) {
                return { rows: [persistedRow({ role: 'PLATFORM_ADMIN', authVersion: 10 })] };
            }
            return { rows: [persistedRow()] };
        });
        await expect(validatePersistedSession({
            userId: USER_ID,
            tenantId: TENANT_ID,
            authVersion: 4,
            authProvider: 'impersonation',
            token: `impersonating:${ACTOR_USER_ID}`,
            impersonation,
        })).resolves.toEqual({ valid: false, reason: 'USER_REVOKED' });
    });

    it('clears a revoked session in memory without mutating cookies from a read-only render', async () => {
        const session = signedSession();
        (getIronSession as jest.Mock).mockResolvedValue(session);
        (pool.query as jest.Mock).mockImplementation(async () => {
            if (!tenantScopeActive) throw new Error('request-context resolver recursion');
            return { rows: [persistedRow({ authVersion: 5 })] };
        });

        const result = await getSession();

        expect(session.destroy).not.toHaveBeenCalled();
        expect(result.isLoggedIn).toBe(false);
        expect(result.userId).toBe('');
        expect(result.authVersion).toBeUndefined();
    });
});
