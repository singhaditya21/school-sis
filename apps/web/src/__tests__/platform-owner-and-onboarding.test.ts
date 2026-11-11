import fs from 'node:fs';
import path from 'node:path';
import {
    AI_PRO_DEFAULT_MODULES,
    CORE_DEFAULT_MODULES,
    isPermanentPlatformAdminEmail,
    isReservedWorkspaceCode,
    modulesForSubscriptionTier,
    normalizeWorkspaceCode,
    PERMANENT_PLATFORM_ADMIN_EMAIL,
    PLATFORM_ALL_MODULES,
    PLATFORM_HQ_COMPANY_NAME,
    PLATFORM_HQ_TENANT_CODE,
} from '@/lib/auth/platform-owner';

const mockSql = jest.fn();
const mockSqlFor = jest.fn();
const mockPoolConnect = jest.fn();
const mockPoolQuery = jest.fn();
const mockRunWithRlsBypass = jest.fn((_justification: unknown, fn: () => unknown) => fn());
const mockRunWithTenantContext = jest.fn((_tenantId: string, fn: () => unknown) => fn());

jest.mock('@/lib/db', () => ({
    sql: (...args: unknown[]) => mockSql(...args),
    sqlFor: (...args: unknown[]) => mockSqlFor(...args),
    pool: {
        connect: (...args: unknown[]) => mockPoolConnect(...args),
        query: (...args: unknown[]) => mockPoolQuery(...args),
    },
    runWithRlsBypass: (j: unknown, fn: () => unknown) => mockRunWithRlsBypass(j, fn),
    runWithTenantContext: (t: string, fn: () => unknown) => mockRunWithTenantContext(t, fn),
    RLS_BYPASS_JUSTIFICATIONS: {
        PASSWORD_LOGIN: 'auth.password-login',
        TENANT_PROVISIONING: 'onboarding.tenant-provisioning',
        PLATFORM_SESSION: 'auth.platform-session',
        STRIPE_SUBSCRIPTION_UPDATE: 'payments.stripe-subscription',
    },
}));

const mockRedirect = jest.fn((target: string) => {
    const err = new Error(`NEXT_REDIRECT:${target}`);
    (err as Error & { digest?: string }).digest = `NEXT_REDIRECT;${target}`;
    throw err;
});

jest.mock('next/navigation', () => ({
    redirect: (target: string) => mockRedirect(target),
}));

jest.mock('next/headers', () => ({
    headers: jest.fn(async () => new Headers({ 'x-forwarded-for': '203.0.113.10' })),
    cookies: jest.fn(async () => ({})),
}));

jest.mock('next/cache', () => ({
    revalidatePath: jest.fn(),
}));

const mockSessionState: Record<string, unknown> = {
    save: jest.fn(async () => undefined),
    destroy: jest.fn(),
};

jest.mock('@/lib/auth/session', () => ({
    getSession: jest.fn(async () => mockSessionState),
    sessionOptions: { cookieName: 'sis_session', password: 'x'.repeat(32) },
}));

jest.mock('iron-session', () => ({
    getIronSession: jest.fn(async () => mockSessionState),
}));

jest.mock('@/lib/auth/rate-limit', () => ({
    consumeRateLimit: jest.fn(async () => null),
    consumeLoginRateLimit: jest.fn(async () => null),
    clearRateLimit: jest.fn(async () => undefined),
}));

const mockCompare = jest.fn();
const mockHash = jest.fn(async () => '$2a$12$mockedhashvalue123456789012345678901234567890');
jest.mock('bcryptjs', () => ({
    compare: (...args: unknown[]) => mockCompare(...args),
    hash: (...args: unknown[]) => mockHash(...args),
}));

jest.mock('@/lib/encryption', () => ({
    encryptEmail: (email: string) => `enc:${email.toLowerCase().trim()}`,
    encryptEmailCandidates: (email: string) => [`enc:${email.toLowerCase().trim()}`],
    decryptFieldTolerant: (val: string | null | undefined) =>
        val && val.startsWith('enc:') ? val.slice(4) : val || '',
}));

const mockRequireRole = jest.fn();
jest.mock('@/lib/auth/middleware', () => ({
    requireRole: (...args: unknown[]) => mockRequireRole(...args),
    requireAuth: jest.fn(),
}));

jest.mock('@/lib/payments/ledger', () => ({
    recordProviderEvent: jest.fn(async () => ({ duplicate: false, event: { id: 'evt-row-1' } })),
    markProviderEventProcessed: jest.fn(async () => undefined),
    completeProviderPayment: jest.fn(async () => undefined),
}));

import { loginActionV2 } from '@/lib/actions/auth';
import { setupSchoolWorkspace } from '@/lib/actions/onboarding';
import { createUser, updateUser } from '@/lib/actions/users';
import {
    createTenantAction,
    toggleTenantStatusAction,
    updateCompanySettingsAction,
} from '@/lib/actions/platform';
import { handleStripeWebhookEvent } from '@/lib/payments/stripe-webhooks';

describe('Permanent Platform Owner (`singhaditya21@gmail.com`) & Automated Tenant Onboarding', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSql.mockReset();
        mockSqlFor.mockReset();
        mockPoolConnect.mockReset();
        mockPoolQuery.mockReset();
        mockCompare.mockReset();
        mockRequireRole.mockReset();
        for (const key of Object.keys(mockSessionState)) {
            if (key !== 'save' && key !== 'destroy') {
                delete mockSessionState[key];
            }
        }
    });

    describe('Canonical platform-owner constants & helpers', () => {
        it('recognizes singhaditya21@gmail.com case- and whitespace-insensitively and reserves HQ codes', () => {
            expect(PERMANENT_PLATFORM_ADMIN_EMAIL).toBe('singhaditya21@gmail.com');
            expect(PLATFORM_HQ_TENANT_CODE).toBe('HQ');
            expect(PLATFORM_HQ_COMPANY_NAME).toBe('ScholarMind HQ');

            expect(isPermanentPlatformAdminEmail('singhaditya21@gmail.com')).toBe(true);
            expect(isPermanentPlatformAdminEmail('  SinghAditya21@Gmail.COM ')).toBe(true);
            expect(isPermanentPlatformAdminEmail('founder@scholarmind.com')).toBe(false);
            expect(isPermanentPlatformAdminEmail('principal@stjudes.edu')).toBe(false);

            expect(isReservedWorkspaceCode('hq')).toBe(true);
            expect(isReservedWorkspaceCode('HQ')).toBe(true);
            expect(isReservedWorkspaceCode('platform')).toBe(true);
            expect(isReservedWorkspaceCode('stjudes')).toBe(false);
            expect(normalizeWorkspaceCode(' stjudes ')).toBe('STJUDES');

            expect(modulesForSubscriptionTier('CORE')).toEqual([...CORE_DEFAULT_MODULES]);
            expect(modulesForSubscriptionTier('AI_PRO')).toEqual([...AI_PRO_DEFAULT_MODULES]);
            expect(modulesForSubscriptionTier('ENTERPRISE')).toEqual([...PLATFORM_ALL_MODULES]);
        });
    });

    describe('loginActionV2 permanent admin routing & HQ boundary', () => {
        it('auto-routes singhaditya21@gmail.com to HQ PLATFORM_ADMIN even without Platform Admin tab toggle', async () => {
            mockSql
                .mockResolvedValueOnce([
                    {
                        id: 'owner-id-1',
                        tenantId: 'hq-tenant-id',
                        tenantCode: 'HQ',
                        tenantDomain: 'hq.scholarmind.app',
                        email: 'enc:singhaditya21@gmail.com',
                        passwordHash: '$2a$12$realhash',
                        role: 'PLATFORM_ADMIN',
                        isActive: true,
                        firstName: 'Aditya',
                        lastName: 'Singh',
                        mfaEnabled: true,
                    },
                ])
                .mockResolvedValueOnce([]);
            mockCompare.mockResolvedValueOnce(true);

            const form = new FormData();
            form.set('loginMode', 'school'); // Default tab — no schoolCode needed for permanent admin!
            form.set('email', 'SinghAditya21@gmail.com');
            form.set('password', 'SuperSecurePassword123!');

            const res = await loginActionV2(form);
            // With mfaEnabled = true and no mfaCode yet, prompts for TOTP code cleanly
            expect(res).toEqual({
                error: 'Enter your authenticator code to continue',
                mfaRequired: true,
            });
            expect(mockSql).toHaveBeenCalledTimes(1);
        });

        it('blocks non-owner emails from authenticating through Platform Admin mode and blocks HQ school code on staff login', async () => {
            mockCompare.mockResolvedValue(false);

            const attackerPlatformForm = new FormData();
            attackerPlatformForm.set('loginMode', 'platform');
            attackerPlatformForm.set('email', 'impostor@scholarmind.com');
            attackerPlatformForm.set('password', 'ValidLengthPass123!');
            const res1 = await loginActionV2(attackerPlatformForm);
            expect(res1).toEqual({ error: 'Invalid email or password' });
            expect(mockSql).not.toHaveBeenCalled();

            const hqSchoolCodeForm = new FormData();
            hqSchoolCodeForm.set('loginMode', 'school');
            hqSchoolCodeForm.set('schoolCode', 'hq');
            hqSchoolCodeForm.set('email', 'staff@school.edu');
            hqSchoolCodeForm.set('password', 'ValidLengthPass123!');
            const res2 = await loginActionV2(hqSchoolCodeForm);
            expect(res2).toEqual({
                error: 'Invalid school code. Please check with your school administrator.',
            });
            expect(mockSql).not.toHaveBeenCalled();
        });
    });

    describe('setupSchoolWorkspace self-serve automated onboarding', () => {
        it('rejects singhaditya21@gmail.com and reserved subdomains from self-serve tenant onboarding', async () => {
            const ownerClaim = new FormData();
            ownerClaim.set('schoolName', 'Test Academy');
            ownerClaim.set('adminFirstName', 'Test');
            ownerClaim.set('adminLastName', 'User');
            ownerClaim.set('email', 'singhaditya21@gmail.com');
            ownerClaim.set('domain', 'testacademy');
            ownerClaim.set('password', 'StrongPassword123!');

            const resOwner = await setupSchoolWorkspace(ownerClaim);
            expect(resOwner.error).toMatch(/reserved for ScholarMind Platform Administration/i);

            const reservedDomain = new FormData();
            reservedDomain.set('schoolName', 'Admin School');
            reservedDomain.set('adminFirstName', 'Jane');
            reservedDomain.set('adminLastName', 'Doe');
            reservedDomain.set('email', 'jane@adminschool.edu');
            reservedDomain.set('domain', 'platform');
            reservedDomain.set('password', 'StrongPassword123!');

            const resReserved = await setupSchoolWorkspace(reservedDomain);
            expect(resReserved.error).toMatch(/reserved/i);
        });

        it('provisions an immediately active CORE workspace with UPPERCASE tenant code and SUPER_ADMIN founder', async () => {
            mockSql
                .mockResolvedValueOnce([]) // existingUser check
                .mockResolvedValueOnce([]); // existingDomain check

            const executedSql: Array<{ strings: string; values: unknown[] }> = [];
            const mockClientRelease = jest.fn();
            mockPoolConnect.mockResolvedValueOnce({ release: mockClientRelease });

            mockSqlFor.mockImplementationOnce(() => {
                return (strings: TemplateStringsArray, ...values: unknown[]) => {
                    const text = strings.join('?');
                    executedSql.push({ strings: text, values });
                    if (text.includes('INSERT INTO companies')) {
                        return Promise.resolve([{ id: 'comp-stjudes-1' }]);
                    }
                    if (text.includes('INSERT INTO tenants')) {
                        return Promise.resolve([{ id: 'ten-stjudes-1' }]);
                    }
                    if (text.includes('INSERT INTO users')) {
                        return Promise.resolve([
                            {
                                id: 'usr-stjudes-1',
                                email: 'enc:principal@stjudes.edu',
                                firstName: 'Meera',
                                lastName: 'Nair',
                                role: 'SUPER_ADMIN',
                            },
                        ]);
                    }
                    const p = Promise.resolve([]) as Promise<unknown[]> & {
                        execute: () => Promise<number>;
                    };
                    p.execute = async () => 0;
                    return p;
                };
            });

            const form = new FormData();
            form.set('schoolName', "St. Jude's Academy");
            form.set('adminFirstName', 'Meera');
            form.set('adminLastName', 'Nair');
            form.set('email', 'principal@stjudes.edu');
            form.set('domain', 'stjudes');
            form.set('password', 'StrongSchoolPass123!');

            const result = await setupSchoolWorkspace(form);

            expect(result).toEqual({
                success: true,
                tenantId: 'ten-stjudes-1',
                tenantCode: 'STJUDES',
            });

            const companyInsert = executedSql.find((q) => q.strings.includes('INSERT INTO companies'));
            expect(companyInsert?.values).toEqual([
                "St. Jude's Academy",
                'CORE',
                'ACTIVE',
                [...CORE_DEFAULT_MODULES],
                true,
            ]);

            const tenantInsert = executedSql.find((q) => q.strings.includes('INSERT INTO tenants'));
            expect(tenantInsert?.values).toEqual([
                'comp-stjudes-1',
                "St. Jude's Academy",
                'STJUDES', // UPPERCASE so loginActionV2 matches immediately!
                'stjudes.scholarmind.app',
                'principal@stjudes.edu',
                true, // Active immediately!
            ]);

            const userInsert = executedSql.find((q) => q.strings.includes('INSERT INTO users'));
            expect(userInsert?.values).toContain('SUPER_ADMIN');

            expect(mockSessionState.tenantCode).toBe('STJUDES');
            expect(mockSessionState.role).toBe('SUPER_ADMIN');
            expect(mockSessionState.subscriptionTier).toBe('CORE');
            expect(mockClientRelease).toHaveBeenCalledTimes(1);
        });
    });

    describe('Tenant user management & HQ platform immutability guards', () => {
        it('blocks tenant user admins from creating or updating users with singhaditya21@gmail.com', async () => {
            Object.assign(mockSessionState, {
                isLoggedIn: true,
                tenantId: 'ten-1',
                userId: 'admin-1',
                role: 'SUPER_ADMIN',
                mfaVerified: true,
            });

            const createRes = await createUser({
                email: 'singhaditya21@gmail.com',
                firstName: 'Test',
                lastName: 'Claim',
                role: 'TEACHER',
                password: 'ValidPassword123',
            });
            expect(createRes.success).toBe(false);
            expect(createRes.error).toMatch(/reserved for ScholarMind Platform Administration/i);

            const updateRes = await updateUser({
                userId: 'user-2',
                email: 'SINGHADITYA21@gmail.com',
                firstName: 'Test',
                lastName: 'Claim',
                role: 'TEACHER',
            });
            expect(updateRes.success).toBe(false);
            expect(updateRes.error).toMatch(/reserved for ScholarMind Platform Administration/i);
        });

        it('blocks suspending HQ tenant, downgrading ScholarMind HQ company, or assigning singhaditya21@gmail.com to a new tenant', async () => {
            mockRequireRole.mockResolvedValue({
                userId: 'owner-id-1',
                tenantId: 'hq-tenant-id',
                session: { role: 'PLATFORM_ADMIN', email: 'singhaditya21@gmail.com' },
            });

            mockSql.mockResolvedValueOnce([{ code: 'HQ' }]);
            const suspendRes = await toggleTenantStatusAction('hq-tenant-id', false);
            expect(suspendRes).toEqual({ error: 'ScholarMind HQ cannot be suspended.' });

            mockSql.mockResolvedValueOnce([{ isHq: true }]);
            const downgradeRes = await updateCompanySettingsAction('hq-company-id', {
                subscriptionTier: 'CORE',
                activeModules: ['FEES'],
                isActive: false,
            });
            expect(downgradeRes).toEqual({
                error: 'ScholarMind HQ must remain active on the ENTERPRISE tier.',
            });

            const tenantForm = new FormData();
            tenantForm.set('name', 'Oakridge');
            tenantForm.set('adminEmail', 'singhaditya21@gmail.com');
            tenantForm.set('adminFirstName', 'Aditya');
            tenantForm.set('adminLastName', 'Singh');
            const createTenantRes = await createTenantAction(tenantForm);
            expect(createTenantRes).toEqual({
                error: 'This email address is reserved for ScholarMind Platform Administration.',
            });
        });

        it('keeps every /hq page and server action strictly gated to PLATFORM_ADMIN only', () => {
            const hqDir = path.join(process.cwd(), 'src/app/hq');
            const walk = (dir: string): string[] =>
                fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
                    const full = path.join(dir, entry.name);
                    return entry.isDirectory() ? walk(full) : [full];
                });

            const guardedFiles = walk(hqDir).filter((f) =>
                /(?:page|actions)\.tsx?$/.test(f),
            );
            expect(guardedFiles.length).toBeGreaterThanOrEqual(10);

            for (const file of guardedFiles) {
                const src = fs.readFileSync(file, 'utf8');
                if (!src.includes('requireRole(')) continue;
                expect(src).not.toMatch(/requireRole\([^)]*SUPER_ADMIN/);
                expect(src).not.toMatch(/requireRole\([^)]*GROUP_EXECUTIVE/);
            }
        });
    });

    describe('Stripe subscription webhook activation alignment', () => {
        it('populates active_modules for the purchased tier and ensures campus tenants are marked active', async () => {
            mockPoolQuery.mockResolvedValue({ rows: [] });

            await handleStripeWebhookEvent({
                id: 'evt_sub_1',
                type: 'checkout.session.completed',
                created: 1700000000,
                livemode: false,
                data: {
                    object: {
                        id: 'cs_sub_1',
                        mode: 'subscription',
                        payment_status: 'paid',
                        client_reference_id: 'comp-stjudes-1',
                        subscription: 'sub_live_123',
                        metadata: {
                            companyId: 'comp-stjudes-1',
                            planType: 'AI_PRO',
                        },
                    },
                },
            } as never);

            expect(mockPoolQuery).toHaveBeenCalledTimes(2);
            const [companySql, companyParams] = mockPoolQuery.mock.calls[0] as [string, unknown[]];
            expect(companySql).toContain('active_modules = $3::text[]');
            expect(companyParams).toEqual([
                'sub_live_123',
                'AI_PRO',
                [...AI_PRO_DEFAULT_MODULES],
                'comp-stjudes-1',
            ]);

            const [tenantSql, tenantParams] = mockPoolQuery.mock.calls[1] as [string, unknown[]];
            expect(tenantSql).toContain('UPDATE tenants');
            expect(tenantSql).toContain('SET is_active = true');
            expect(tenantParams).toEqual(['comp-stjudes-1']);
        });
    });
});
