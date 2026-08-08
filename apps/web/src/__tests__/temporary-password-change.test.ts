import fs from 'node:fs';
import path from 'node:path';
import { compare, hash } from 'bcryptjs';
import { getPasswordChangeSession } from '@/lib/auth/session';
import { pool, runWithTenantContext } from '@/lib/db';
import { changeTemporaryPassword } from '@/lib/actions/password';

jest.mock('@/lib/auth/session', () => ({
    getPasswordChangeSession: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
    pool: { connect: jest.fn() },
    runWithTenantContext: jest.fn((_tenantId: string, operation: () => unknown) => operation()),
}));

jest.mock('bcryptjs', () => ({
    compare: jest.fn(async () => true),
    hash: jest.fn(async () => 'new-password-hash'),
}));

const TENANT_ID = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('temporary-password replacement', () => {
    const client = {
        query: jest.fn(),
        release: jest.fn(),
    };
    const session = {
        isLoggedIn: true,
        userId: USER_ID,
        tenantId: TENANT_ID,
        role: 'TEACHER',
        email: 'teacher@example.edu',
        authVersion: 7,
        passwordChangeRequired: true,
        temporaryPasswordExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        mfaRequired: false,
        mfaVerified: false,
        save: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        session.authVersion = 7;
        session.passwordChangeRequired = true;
        session.temporaryPasswordExpiresAt = new Date(Date.now() + 60_000).toISOString();
        session.mfaRequired = false;
        session.mfaVerified = false;
        (compare as jest.Mock).mockResolvedValue(true);
        (hash as jest.Mock).mockResolvedValue('new-password-hash');
        (getPasswordChangeSession as jest.Mock).mockResolvedValue(session);
        (pool.connect as jest.Mock).mockResolvedValue(client);
        client.query.mockImplementation(async (sql: string) => {
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
            if (sql.includes('SELECT') && sql.includes('password_hash')) {
                return {
                    rows: [{
                        id: USER_ID,
                        email: 'teacher@example.edu',
                        role: 'TEACHER',
                        passwordHash: 'temporary-password-hash',
                        authVersion: 7,
                        isActive: true,
                        passwordChangeRequired: true,
                        temporaryPasswordExpiresAt: new Date(Date.now() + 60_000),
                    }],
                };
            }
            if (sql.includes('UPDATE users')) return { rows: [{ authVersion: 8 }] };
            return { rows: [] };
        });
    });

    it('atomically clears the forced-change state, rotates authVersion, and refreshes only this session', async () => {
        const result = await changeTemporaryPassword({
            currentPassword: 'temporary-password-value',
            newPassword: 'a-new-permanent-password',
            confirmPassword: 'a-new-permanent-password',
        });

        expect(result).toEqual({ success: true, redirectTo: '/dashboard' });
        expect(compare).toHaveBeenCalledWith('temporary-password-value', 'temporary-password-hash');
        expect(hash).toHaveBeenCalledWith('a-new-permanent-password', 12);
        expect(runWithTenantContext).toHaveBeenCalledWith(TENANT_ID, expect.any(Function));

        const updateCall = client.query.mock.calls.find(([sql]) => String(sql).includes('UPDATE users'));
        expect(updateCall?.[0]).toContain('password_change_required = FALSE');
        expect(updateCall?.[0]).toContain('temporary_password_expires_at = NULL');
        expect(updateCall?.[0]).toContain('auth_version = auth_version + 1');

        const auditCall = client.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO audit_logs'));
        expect(auditCall).toBeDefined();
        expect(JSON.stringify(auditCall)).not.toContain('temporary-password-value');
        expect(JSON.stringify(auditCall)).not.toContain('a-new-permanent-password');
        expect(session.authVersion).toBe(8);
        expect(session.passwordChangeRequired).toBe(false);
        expect(session.save).toHaveBeenCalledTimes(1);
        expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(expect.arrayContaining(['BEGIN', 'COMMIT']));
    });

    it('rolls back and keeps the restricted session when the temporary password is wrong', async () => {
        (compare as jest.Mock).mockResolvedValue(false);

        const result = await changeTemporaryPassword({
            currentPassword: 'incorrect-temporary-password',
            newPassword: 'a-new-permanent-password',
            confirmPassword: 'a-new-permanent-password',
        });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/incorrect/);
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(session.save).not.toHaveBeenCalled();
    });

    it('sends an MFA-required session to enrollment after the temporary password is replaced', async () => {
        session.mfaRequired = true;

        const result = await changeTemporaryPassword({
            currentPassword: 'temporary-password-value',
            newPassword: 'a-new-permanent-password',
            confirmPassword: 'a-new-permanent-password',
        });

        expect(result).toEqual({ success: true, redirectTo: '/mfa/enroll' });
        expect(session.authVersion).toBe(8);
        expect(session.passwordChangeRequired).toBe(false);
        expect(session.mfaVerified).toBe(false);
        expect(session.save).toHaveBeenCalledTimes(1);
    });

    it('has a reachable replacement page and keeps restricted sessions out of APIs and DB resolver context', () => {
        const page = fs.readFileSync(path.join(process.cwd(), 'src/app/change-password/page.tsx'), 'utf8');
        const middleware = fs.readFileSync(path.join(process.cwd(), 'src/middleware.ts'), 'utf8');
        const apiAuth = fs.readFileSync(path.join(process.cwd(), 'src/lib/auth/api.ts'), 'utf8');
        const instrumentation = fs.readFileSync(path.join(process.cwd(), 'src/instrumentation.ts'), 'utf8');
        const pageAccess = fs.readFileSync(path.join(process.cwd(), 'src/lib/auth/page-access.ts'), 'utf8');

        expect(page).toContain('changeTemporaryPassword');
        expect(middleware).toContain("pathname !== '/change-password'");
        expect(apiAuth).toContain('PASSWORD_CHANGE_REQUIRED');
        expect(instrumentation).toContain('session.passwordChangeRequired');
        expect(pageAccess).toContain("'/change-password'");
    });
});
