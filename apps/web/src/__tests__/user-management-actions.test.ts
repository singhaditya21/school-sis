import { hash } from 'bcryptjs';
import { getSession } from '@/lib/auth/session';
import { pool, runWithTenantContext } from '@/lib/db';
import {
    createUser,
    listUsers,
    resetUserPassword,
    setUserActive,
    updateUserProfile,
} from '@/lib/actions/users';

jest.mock('@/lib/auth/session', () => ({
    getSession: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
    pool: { query: jest.fn(), connect: jest.fn() },
    runWithTenantContext: jest.fn((_tenantId: string, operation: () => unknown) => operation()),
}));

jest.mock('bcryptjs', () => ({
    hash: jest.fn(async () => 'hashed-password'),
}));

const TENANT_ID = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '22222222-2222-4222-8222-222222222222';
const mutationClient = {
    query: jest.fn(),
    release: jest.fn(),
};

const teacherRow = {
    id: TARGET_ID,
    tenant_id: TENANT_ID,
    email: 'teacher@example.edu',
    first_name: 'Tara',
    last_name: 'Teacher',
    role: 'TEACHER',
    is_active: true,
    created_at: new Date('2026-08-01T00:00:00.000Z'),
    last_login_at: null,
};

function mockSession(role = 'SCHOOL_ADMIN', userId = ACTOR_ID) {
    (getSession as jest.Mock).mockResolvedValue({
        isLoggedIn: true,
        userId,
        tenantId: TENANT_ID,
        role,
        email: 'admin@example.edu',
    });
}

describe('native user-management actions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSession();
        (pool.connect as jest.Mock).mockResolvedValue(mutationClient);
    });

    it('lists only the active tenant and returns server-computed manageability', async () => {
        (pool.query as jest.Mock).mockResolvedValue({
            rows: [
                teacherRow,
                {
                    ...teacherRow,
                    id: ACTOR_ID,
                    email: 'admin@example.edu',
                    role: 'SCHOOL_ADMIN',
                },
            ],
        });

        const result = await listUsers();

        expect(result.success).toBe(true);
        expect(runWithTenantContext).toHaveBeenCalledWith(TENANT_ID, expect.any(Function));
        const [sql, values] = (pool.query as jest.Mock).mock.calls[0];
        expect(sql).toContain('WHERE tenant_id = $1');
        expect(values).toEqual([TENANT_ID]);
        expect(result.data?.users[0]).toMatchObject({ canManage: true, isCurrentUser: false });
        expect(result.data?.users[1]).toMatchObject({ canManage: false, isCurrentUser: true });
        expect(result.data?.assignableRoles).not.toEqual(expect.arrayContaining([
            'PLATFORM_ADMIN',
            'SUPER_ADMIN',
            'GROUP_EXECUTIVE',
            'SCHOOL_ADMIN',
        ]));
    });

    it.each(['PLATFORM_ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN', 'tenant_owner'])(
        'rejects privilege escalation or an unsupported create role: %s',
        async (role) => {
            const result = await createUser({
                email: 'new.user@example.edu',
                firstName: 'New',
                lastName: 'User',
                role,
                password: 'correct-horse-battery-staple',
            });

            expect(result.success).toBe(false);
            expect(pool.query).not.toHaveBeenCalled();
            expect(hash).not.toHaveBeenCalled();
        },
    );

    it('creates an allowed role with normalized fields inside the active tenant', async () => {
        mutationClient.query.mockImplementation(async (sql: string) => {
            if (sql.includes('SELECT 1')) return { rows: [], rowCount: 0 };
            if (sql.includes('INSERT INTO users')) return { rows: [teacherRow], rowCount: 1 };
            return { rows: [], rowCount: 0 };
        });

        const result = await createUser({
            email: ' Teacher@Example.EDU ',
            firstName: ' Tara ',
            lastName: ' Teacher ',
            role: 'teacher',
            password: 'correct-horse-battery-staple',
        });

        expect(result.success).toBe(true);
        expect(runWithTenantContext).toHaveBeenCalledWith(TENANT_ID, expect.any(Function));
        const [insertSql, insertValues] = mutationClient.query.mock.calls.find(
            ([sql]) => String(sql).includes('INSERT INTO users'),
        );
        expect(insertSql).toContain('password_change_required, temporary_password_expires_at');
        expect(insertValues).toEqual([
            TENANT_ID,
            'teacher@example.edu',
            'hashed-password',
            'Tara',
            'Teacher',
            'TEACHER',
            expect.any(Date),
        ]);
        const auditCall = mutationClient.query.mock.calls.find(
            ([sql]) => String(sql).includes('INSERT INTO audit_logs'),
        );
        expect(auditCall).toBeDefined();
        expect(JSON.stringify(auditCall)).not.toContain('correct-horse-battery-staple');
    });

    it('maps a concurrent tenant/email unique-index conflict to a stable user error', async () => {
        mutationClient.query.mockImplementation(async (sql: string) => {
            if (sql.includes('SELECT 1')) return { rows: [], rowCount: 0 };
            if (sql.includes('INSERT INTO users')) {
                throw Object.assign(new Error('duplicate key'), {
                    code: '23505',
                    constraint: 'users_tenant_email_lower_key',
                });
            }
            return { rows: [], rowCount: 0 };
        });

        const result = await createUser({
            email: 'Teacher@Example.EDU',
            firstName: 'Tara',
            lastName: 'Teacher',
            role: 'TEACHER',
            password: 'correct-horse-battery-staple',
        });

        expect(result).toEqual({ success: false, error: 'A user with that email already exists.' });
        expect(mutationClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('keeps Edit profile updates tenant-scoped and excludes role from the direct action', async () => {
        const bypass = await updateUserProfile({
            userId: TARGET_ID,
            email: 'teacher@example.edu',
            firstName: 'Tara',
            lastName: 'Teacher',
            role: 'SUPER_ADMIN',
        } as Parameters<typeof updateUserProfile>[0] & { role: string });

        expect(bypass.success).toBe(false);
        expect(pool.query).not.toHaveBeenCalled();

        mutationClient.query.mockImplementation(async (sql: string) => {
            if (sql.includes('SELECT id, email')) return { rows: [teacherRow], rowCount: 1 };
            if (sql.includes('SELECT 1')) return { rows: [], rowCount: 0 };
            if (sql.includes('UPDATE users')) {
                return { rows: [{ ...teacherRow, first_name: 'Talia' }], rowCount: 1 };
            }
            return { rows: [], rowCount: 0 };
        });

        const result = await updateUserProfile({
            userId: TARGET_ID,
            email: 'teacher@example.edu',
            firstName: 'Talia',
            lastName: 'Teacher',
        });

        expect(result.success).toBe(true);
        const [updateSql, updateValues] = mutationClient.query.mock.calls.find(
            ([sql]) => String(sql).includes('UPDATE users'),
        );
        expect(updateSql).toContain('tenant_id = $5');
        expect(updateSql).toContain('role = ANY($7::user_role[])');
        expect(updateSql).toContain('auth_version = auth_version + 1');
        expect(updateSql.slice(updateSql.indexOf('SET'), updateSql.indexOf('WHERE')))
            .not.toMatch(/\brole\s*=/);
        expect(updateValues[4]).toBe(TENANT_ID);
        expect(updateValues[6]).not.toEqual(expect.arrayContaining([
            'PLATFORM_ADMIN',
            'SUPER_ADMIN',
            'GROUP_EXECUTIVE',
            'SCHOOL_ADMIN',
        ]));
        expect(mutationClient.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO audit_logs')))
            .toBe(true);
    });

    it('blocks self-deactivation and self-password reset before database access', async () => {
        const deactivate = await setUserActive(ACTOR_ID, false);
        const reset = await resetUserPassword(ACTOR_ID);

        expect(deactivate).toEqual(expect.objectContaining({ success: false }));
        expect(reset).toEqual(expect.objectContaining({ success: false }));
        expect(deactivate.error).toMatch(/own account/);
        expect(reset.error).toMatch(/own password/);
        expect(pool.query).not.toHaveBeenCalled();
    });

    it('rechecks target privilege in the tenant-scoped status update', async () => {
        mutationClient.query.mockImplementation(async (sql: string) => {
            if (sql.includes('SELECT id, email')) return { rows: [teacherRow], rowCount: 1 };
            if (sql.includes('UPDATE users')) return { rows: [], rowCount: 0 };
            return { rows: [], rowCount: 0 };
        });

        const result = await setUserActive(TARGET_ID, false);

        expect(result.success).toBe(false);
        const [sql, values] = mutationClient.query.mock.calls.find(
            ([statement]) => String(statement).includes('UPDATE users'),
        );
        expect(sql).toContain('tenant_id = $3');
        expect(sql).toContain('role = ANY($4::user_role[])');
        expect(sql).toContain('auth_version = auth_version + 1');
        expect(values[2]).toBe(TENANT_ID);
        expect(values[3]).toContain('TEACHER');
        expect(values[3]).not.toContain('SCHOOL_ADMIN');
        expect(mutationClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('resets a password with expiry, revision revocation, and a redacted audit in one transaction', async () => {
        mutationClient.query.mockImplementation(async (sql: string) => {
            if (sql.includes('SELECT id, email')) return { rows: [teacherRow], rowCount: 1 };
            if (sql.includes('UPDATE users')) return { rows: [{ id: TARGET_ID, authVersion: 2 }], rowCount: 1 };
            return { rows: [], rowCount: 0 };
        });

        const result = await resetUserPassword(TARGET_ID);

        expect(result.success).toBe(true);
        const [updateSql, updateValues] = mutationClient.query.mock.calls.find(
            ([sql]) => String(sql).includes('UPDATE users'),
        );
        expect(updateSql).toContain('password_change_required = TRUE');
        expect(updateSql).toContain('temporary_password_expires_at = $2');
        expect(updateSql).toContain('auth_version = auth_version + 1');
        expect(updateValues[1]).toEqual(expect.any(Date));

        const auditCall = mutationClient.query.mock.calls.find(
            ([sql]) => String(sql).includes('INSERT INTO audit_logs'),
        );
        expect(auditCall).toBeDefined();
        expect(JSON.stringify(auditCall)).not.toContain(result.data?.temporaryPassword);
        expect(mutationClient.query.mock.calls.map(([sql]) => sql)).toEqual(
            expect.arrayContaining(['BEGIN', 'COMMIT']),
        );
    });
});
