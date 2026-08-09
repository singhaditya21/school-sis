import { setupSchoolWorkspace } from '@/lib/actions/onboarding';
import { pool, runWithRlsBypass } from '@/lib/db';
import { consumeRateLimit } from '@/lib/auth/rate-limit';
import { establishSession } from '@/lib/auth/identity';
import { getIronSession } from 'iron-session';
import { hash } from 'bcryptjs';

jest.mock('@/lib/db', () => ({
    pool: { connect: jest.fn() },
    RLS_BYPASS_JUSTIFICATIONS: { TENANT_PROVISIONING: 'tenant provisioning' },
    runWithRlsBypass: jest.fn((_justification: string, callback: () => unknown) => callback()),
}));

jest.mock('@/lib/auth/rate-limit', () => ({
    consumeRateLimit: jest.fn(),
}));

jest.mock('@/lib/auth/identity', () => ({
    establishSession: jest.fn(),
}));

jest.mock('@/lib/auth/session', () => ({
    sessionOptions: { password: 'test-secret-with-at-least-32-characters', cookieName: 'test' },
}));

jest.mock('next/headers', () => ({
    cookies: jest.fn().mockResolvedValue({}),
}));

jest.mock('iron-session', () => ({
    getIronSession: jest.fn(),
}));

jest.mock('bcryptjs', () => ({
    hash: jest.fn(),
}));

const COMPANY_ID = '1781b53b-862f-4011-b8f5-696168d39492';
const TENANT_ID = '899b6bd0-fc45-45bc-8c7f-19de2c6782c7';
const USER_ID = '80848f29-8c96-46fa-85f7-4e147b1b4b67';

function validFormData(): FormData {
    const data = new FormData();
    data.set('schoolName', 'ScholarMind Pilot School');
    data.set('adminFirstName', 'Asha');
    data.set('adminLastName', 'Rao');
    data.set('email', 'asha@example.edu');
    data.set('domain', 'pilot-school');
    data.set('password', 'correct horse battery staple');
    return data;
}

function sqlText(call: unknown[]): string {
    return String(call[0]).replace(/\s+/g, ' ').trim();
}

describe('transactional workspace onboarding', () => {
    const session = { save: jest.fn() };
    const release = jest.fn();
    const query = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        (consumeRateLimit as jest.Mock).mockResolvedValue(null);
        (hash as jest.Mock).mockResolvedValue('hashed-password');
        (getIronSession as jest.Mock).mockResolvedValue(session);
        session.save.mockResolvedValue(undefined);

        query.mockImplementation(async (statement: string) => {
            if (statement.includes('FROM users WHERE lower(email)')) return { rowCount: 0, rows: [] };
            if (statement.includes('FROM tenants WHERE code')) return { rowCount: 0, rows: [] };
            if (statement.includes('INSERT INTO companies')) return { rowCount: 1, rows: [{ id: COMPANY_ID }] };
            if (statement.includes('INSERT INTO tenants')) return { rowCount: 1, rows: [{ id: TENANT_ID }] };
            if (statement.includes('INSERT INTO users')) {
                return {
                    rowCount: 1,
                    rows: [{
                        id: USER_ID,
                        email: 'asha@example.edu',
                        role: 'SCHOOL_ADMIN',
                        firstName: 'Asha',
                        lastName: 'Rao',
                    }],
                };
            }
            return { rowCount: 1, rows: [] };
        });
        (pool.connect as jest.Mock).mockResolvedValue({ query, release });
    });

    it('commits company, tenant, administrator, and audit records as one unit', async () => {
        const result = await setupSchoolWorkspace(validFormData());

        expect(runWithRlsBypass).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ success: true, tenantId: TENANT_ID, redirectTo: '/onboarding' });

        const statements = query.mock.calls.map(sqlText);
        expect(statements[0]).toBe('BEGIN');
        expect(statements.at(-1)).toBe('COMMIT');
        expect(statements).toEqual(expect.arrayContaining([
            expect.stringContaining('INSERT INTO companies'),
            expect.stringContaining('INSERT INTO tenants'),
            expect.stringContaining('INSERT INTO users'),
            expect.stringContaining('INSERT INTO audit_logs'),
        ]));

        const tenantInsert = query.mock.calls.find((call) => sqlText(call).includes('INSERT INTO tenants'));
        expect(sqlText(tenantInsert!)).toContain('company_id');
        expect(sqlText(tenantInsert!)).not.toContain('billing_status');
        expect(tenantInsert?.[1]).toEqual(expect.arrayContaining([COMPANY_ID, 'PILOT-SCHOOL']));

        expect(establishSession).toHaveBeenCalledWith(session, expect.objectContaining({
            userId: USER_ID,
            tenantId: TENANT_ID,
            companyId: COMPANY_ID,
            tenantCode: 'PILOT-SCHOOL',
            subscriptionTier: 'CORE',
            institutionType: 'K12',
        }));
        expect(session.save).toHaveBeenCalledTimes(1);
        expect(release).toHaveBeenCalledTimes(1);
    });

    it('rolls back all records and does not create a session when a write fails', async () => {
        query.mockImplementation(async (statement: string) => {
            if (statement.includes('FROM users WHERE lower(email)')) return { rowCount: 0, rows: [] };
            if (statement.includes('FROM tenants WHERE code')) return { rowCount: 0, rows: [] };
            if (statement.includes('INSERT INTO companies')) return { rows: [{ id: COMPANY_ID }] };
            if (statement.includes('INSERT INTO tenants')) return { rows: [{ id: TENANT_ID }] };
            if (statement.includes('INSERT INTO users')) throw new Error('database unavailable');
            return { rows: [] };
        });

        const result = await setupSchoolWorkspace(validFormData());

        expect(result).toEqual({
            error: 'Workspace creation failed before completion. No partial workspace was kept. Please try again.',
        });
        expect(query).toHaveBeenCalledWith('ROLLBACK');
        expect(query).not.toHaveBeenCalledWith('COMMIT');
        expect(establishSession).not.toHaveBeenCalled();
        expect(session.save).not.toHaveBeenCalled();
        expect(release).toHaveBeenCalledTimes(1);
    });

    it('reports a durable workspace if only session persistence fails', async () => {
        session.save.mockRejectedValue(new Error('cookie write failed'));

        const result = await setupSchoolWorkspace(validFormData());

        expect(result).toEqual({
            success: true,
            tenantId: TENANT_ID,
            redirectTo: '/login',
            notice: 'Workspace PILOT-SCHOOL was created. Sign in to continue setup.',
        });
        expect(query).toHaveBeenCalledWith('COMMIT');
        expect(query).not.toHaveBeenCalledWith('ROLLBACK');
    });
});
