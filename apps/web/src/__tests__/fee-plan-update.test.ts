import { updateFeePlan } from '@/lib/actions/fees';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { revalidatePath } from 'next/cache';

jest.mock('@/lib/db', () => ({
    pool: { connect: jest.fn() },
}));

jest.mock('@/lib/auth/middleware', () => ({
    requireAuth: jest.fn(),
}));

jest.mock('next/cache', () => ({
    revalidatePath: jest.fn(),
}));

const TENANT_ID = '389b4bb5-56a9-46dc-a7c0-2fcf664f054b';
const USER_ID = '1c1c3c14-28d5-422d-9c22-a313b65a237e';
const PLAN_ID = '7485b6aa-ddd1-4a50-91ee-431997088044';
const ORIGINAL_UPDATED_AT = '2026-08-09T06:30:00.000Z';
const NEW_UPDATED_AT = '2026-08-09T07:00:00.000Z';

const updateInput = {
    id: PLAN_ID,
    name: '2026–27 Tuition',
    description: 'Approved annual tuition plan',
    isActive: true,
    updatedAt: ORIGINAL_UPDATED_AT,
};

function normalizedSql(statement: unknown): string {
    return String(statement).replace(/\s+/g, ' ').trim();
}

describe('updateFeePlan', () => {
    const query = jest.fn();
    const release = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        (requireAuth as jest.Mock).mockResolvedValue({ tenantId: TENANT_ID, userId: USER_ID });
        query.mockImplementation(async (statement: string) => {
            if (statement.includes('FROM fee_plans') && statement.includes('FOR UPDATE')) {
                return {
                    rows: [{
                        name: 'Old plan',
                        description: null,
                        isActive: false,
                        updatedAt: new Date(ORIGINAL_UPDATED_AT),
                    }],
                };
            }
            if (statement.includes('UPDATE fee_plans')) {
                return { rows: [{ updatedAt: new Date(NEW_UPDATED_AT) }] };
            }
            return { rows: [] };
        });
        (pool.connect as jest.Mock).mockResolvedValue({ query, release });
    });

    it('updates only the session tenant and commits an audit record atomically', async () => {
        const result = await updateFeePlan(updateInput);

        expect(requireAuth).toHaveBeenCalledWith('fees:write');
        expect(result).toEqual({ success: true, updatedAt: NEW_UPDATED_AT });

        const lockCall = query.mock.calls.find((call) => normalizedSql(call[0]).includes('FOR UPDATE'));
        expect(lockCall?.[1]).toEqual([PLAN_ID, TENANT_ID]);

        const updateCall = query.mock.calls.find((call) => normalizedSql(call[0]).includes('UPDATE fee_plans'));
        expect(updateCall?.[1]).toEqual([
            updateInput.name,
            updateInput.description,
            true,
            PLAN_ID,
            TENANT_ID,
        ]);

        const auditCall = query.mock.calls.find((call) => normalizedSql(call[0]).includes('INSERT INTO audit_logs'));
        expect(auditCall?.[1]).toEqual(expect.arrayContaining([TENANT_ID, USER_ID, PLAN_ID]));
        expect(query).toHaveBeenCalledWith('COMMIT');
        expect(query).not.toHaveBeenCalledWith('ROLLBACK');
        expect(revalidatePath).toHaveBeenCalledWith(`/fees/plans/${PLAN_ID}/edit`);
        expect(release).toHaveBeenCalledTimes(1);
    });

    it('rejects a stale editor without writing', async () => {
        query.mockImplementation(async (statement: string) => {
            if (statement.includes('FROM fee_plans') && statement.includes('FOR UPDATE')) {
                return {
                    rows: [{
                        name: 'Changed elsewhere',
                        description: null,
                        isActive: true,
                        updatedAt: new Date(NEW_UPDATED_AT),
                    }],
                };
            }
            return { rows: [] };
        });

        const result = await updateFeePlan(updateInput);

        expect(result).toEqual(expect.objectContaining({ success: false, code: 'CONFLICT' }));
        expect(query).toHaveBeenCalledWith('ROLLBACK');
        expect(query.mock.calls.some((call) => normalizedSql(call[0]).includes('UPDATE fee_plans'))).toBe(false);
        expect(query.mock.calls.some((call) => normalizedSql(call[0]).includes('INSERT INTO audit_logs'))).toBe(false);
        expect(revalidatePath).not.toHaveBeenCalled();
    });

    it('rejects malformed identifiers before opening a transaction', async () => {
        const result = await updateFeePlan({ ...updateInput, id: 'client-controlled-plan' });

        expect(result).toEqual(expect.objectContaining({ success: false, code: 'INVALID_INPUT' }));
        expect(pool.connect).not.toHaveBeenCalled();
        expect(query).not.toHaveBeenCalled();
    });
});
