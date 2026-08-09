import {
    createGradingScheme,
    deleteGradingScheme,
    getGradingSchemes,
    updateGradingScheme,
} from '@/lib/actions/grading';
import { requireAuth } from '@/lib/auth/middleware';
import { pool } from '@/lib/db';
import { revalidatePath } from 'next/cache';

jest.mock('@/lib/db', () => ({
    pool: { connect: jest.fn(), query: jest.fn() },
}));

jest.mock('@/lib/auth/middleware', () => ({
    requireAuth: jest.fn(),
}));

jest.mock('next/cache', () => ({
    revalidatePath: jest.fn(),
}));

const TENANT_ID = '389b4bb5-56a9-46dc-a7c0-2fcf664f054b';
const OTHER_TENANT_ID = 'b66175fc-8dae-4124-8a28-b8fe06fe4d47';
const USER_ID = '1c1c3c14-28d5-422d-9c22-a313b65a237e';
const DEFAULT_SCALE_ID = '7485b6aa-ddd1-4a50-91ee-431997088044';
const TARGET_SCALE_ID = '4f4397bf-b71a-48a9-ac36-5543e6ee5169';
const ORIGINAL_UPDATED_AT = '2026-08-09T06:30:00.000Z';
const NEW_UPDATED_AT = '2026-08-09T07:00:00.000Z';

const thresholds = [
    { grade: 'A', minPercentage: 90, maxPercentage: 100, gradePoint: 4, remark: 'Excellent' },
    { grade: 'B', minPercentage: 0, maxPercentage: 90, gradePoint: 3, remark: 'Progressing' },
];

const createInput = {
    name: '2026 Academic Scale',
    type: 'GPA' as const,
    description: 'Approved scale for 2026.',
    isDefault: false,
    isActive: true,
    thresholds,
};

const updateInput = {
    ...createInput,
    id: TARGET_SCALE_ID,
    updatedAt: ORIGINAL_UPDATED_AT,
};

interface ScaleFixture {
    id: string;
    name: string;
    type: string;
    description: string | null;
    isDefault: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

function scaleFixture(overrides: Partial<ScaleFixture> = {}): ScaleFixture {
    return {
        id: TARGET_SCALE_ID,
        name: 'Existing scale',
        type: 'GPA',
        description: null,
        isDefault: false,
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date(ORIGINAL_UPDATED_AT),
        ...overrides,
    };
}

function rubricFixture(scaleId = TARGET_SCALE_ID) {
    return {
        id: 'c8d78763-54ce-4f5f-a563-83035d18cdbe',
        scaleId,
        label: 'A',
        minScore: '0',
        maxScore: '100',
        gpaValue: '4',
        remark: 'Existing',
        displayOrder: 0,
    };
}

function normalizedSql(statement: unknown): string {
    return String(statement).replace(/\s+/g, ' ').trim();
}

function isFinalScaleRead(sql: string): boolean {
    return sql.includes('FROM grading_scales') && !sql.includes('FOR UPDATE');
}

function isFinalRubricRead(sql: string): boolean {
    return sql.includes('FROM grading_rubrics rubric') && sql.includes('WHERE scale.tenant_id = $1');
}

describe('persisted grading actions', () => {
    const query = jest.fn();
    const release = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        (requireAuth as jest.Mock).mockResolvedValue({ tenantId: TENANT_ID, userId: USER_ID });
        (pool.connect as jest.Mock).mockResolvedValue({ query, release });
    });

    it('reads only grading schemes belonging to the authenticated tenant', async () => {
        (pool.query as jest.Mock).mockImplementation(async (statement: string) => {
            const sql = normalizedSql(statement);
            if (isFinalScaleRead(sql)) return { rows: [scaleFixture()] };
            if (isFinalRubricRead(sql)) return { rows: [rubricFixture()] };
            return { rows: [] };
        });

        const result = await getGradingSchemes();

        expect(requireAuth).toHaveBeenCalledWith('settings:read');
        expect(pool.query).toHaveBeenCalledTimes(2);
        expect((pool.query as jest.Mock).mock.calls.every(call => call[1][0] === TENANT_ID)).toBe(true);
        expect(result).toEqual([
            expect.objectContaining({ id: TARGET_SCALE_ID, thresholds: [expect.objectContaining({ grade: 'A' })] }),
        ]);
    });

    it('creates the first tenant scheme as the active default and audits it in one transaction', async () => {
        let createdScaleId = '';
        let insertedRubrics: unknown[] = [];

        query.mockImplementation(async (statement: string, params: unknown[] = []) => {
            const sql = normalizedSql(statement);
            if (sql.includes('FROM grading_scales') && sql.includes('FOR UPDATE')) return { rows: [] };
            if (sql.startsWith('INSERT INTO grading_scales')) {
                createdScaleId = String(params[0]);
                return { rows: [] };
            }
            if (sql.startsWith('INSERT INTO grading_rubrics')) {
                insertedRubrics = params;
                return { rows: [] };
            }
            if (isFinalScaleRead(sql)) {
                return {
                    rows: [scaleFixture({
                        id: createdScaleId,
                        name: createInput.name,
                        description: createInput.description,
                        isDefault: true,
                    })],
                };
            }
            if (isFinalRubricRead(sql)) return { rows: [] };
            return { rows: [] };
        });

        const result = await createGradingScheme({
            ...createInput,
            tenantId: OTHER_TENANT_ID,
            actorId: 'client-controlled-actor',
        });

        expect(requireAuth).toHaveBeenCalledWith('settings:write');
        expect(result).toEqual(expect.objectContaining({ success: true, selectedId: createdScaleId }));

        const scaleInsert = query.mock.calls.find(call => normalizedSql(call[0]).startsWith('INSERT INTO grading_scales'));
        expect(scaleInsert?.[1]).toEqual([
            createdScaleId,
            TENANT_ID,
            createInput.name,
            createInput.type,
            createInput.description,
            true,
            true,
        ]);
        expect(scaleInsert?.[1]).not.toContain(OTHER_TENANT_ID);
        expect(insertedRubrics).toHaveLength(16);

        const auditInsert = query.mock.calls.find(call => normalizedSql(call[0]).startsWith('INSERT INTO audit_logs'));
        expect(auditInsert?.[1]).toEqual(expect.arrayContaining([
            TENANT_ID,
            USER_ID,
            'CREATE',
            createdScaleId,
        ]));
        expect(query).toHaveBeenCalledWith('BEGIN');
        expect(query).toHaveBeenCalledWith('COMMIT');
        expect(query).not.toHaveBeenCalledWith('ROLLBACK');
        expect(revalidatePath).toHaveBeenCalledWith('/settings/grading');
        expect(release).toHaveBeenCalledTimes(1);
    });

    it('rejects a stale editor before changing rubrics, defaults, or audit history', async () => {
        query.mockImplementation(async (statement: string) => {
            const sql = normalizedSql(statement);
            if (sql.includes('FROM grading_scales') && sql.includes('FOR UPDATE')) {
                return { rows: [scaleFixture({ updatedAt: new Date(NEW_UPDATED_AT) })] };
            }
            return { rows: [] };
        });

        const result = await updateGradingScheme(updateInput);

        expect(result).toEqual(expect.objectContaining({ success: false, code: 'CONFLICT' }));
        expect(query).toHaveBeenCalledWith('ROLLBACK');
        expect(query.mock.calls.some(call => normalizedSql(call[0]).startsWith('UPDATE grading_scales'))).toBe(false);
        expect(query.mock.calls.some(call => normalizedSql(call[0]).startsWith('DELETE FROM grading_rubrics'))).toBe(false);
        expect(query.mock.calls.some(call => normalizedSql(call[0]).startsWith('INSERT INTO audit_logs'))).toBe(false);
        expect(revalidatePath).not.toHaveBeenCalled();
        expect(release).toHaveBeenCalledTimes(1);
    });

    it('atomically replaces the tenant default and records both audited changes', async () => {
        const oldDefault = scaleFixture({
            id: DEFAULT_SCALE_ID,
            name: 'Old default',
            isDefault: true,
            createdAt: new Date('2025-01-01T00:00:00.000Z'),
        });
        const target = scaleFixture();

        query.mockImplementation(async (statement: string) => {
            const sql = normalizedSql(statement);
            if (sql.includes('FROM grading_scales') && sql.includes('FOR UPDATE')) {
                return { rows: [oldDefault, target] };
            }
            if (sql.includes('WHERE rubric.scale_id = $1')) return { rows: [rubricFixture()] };
            if (sql.startsWith('UPDATE grading_scales') && sql.includes('RETURNING updated_at')) {
                return { rows: [{ updatedAt: new Date(NEW_UPDATED_AT) }] };
            }
            if (isFinalScaleRead(sql)) {
                return {
                    rows: [
                        { ...oldDefault, isDefault: false, updatedAt: new Date(NEW_UPDATED_AT) },
                        { ...target, isDefault: true, updatedAt: new Date(NEW_UPDATED_AT) },
                    ],
                };
            }
            if (isFinalRubricRead(sql)) return { rows: [rubricFixture()] };
            return { rows: [] };
        });

        const result = await updateGradingScheme({ ...updateInput, isDefault: true });

        expect(result).toEqual(expect.objectContaining({ success: true, selectedId: TARGET_SCALE_ID }));
        const demotion = query.mock.calls.find(call => (
            normalizedSql(call[0]).startsWith('UPDATE grading_scales')
            && normalizedSql(call[0]).includes('id <> $2')
        ));
        expect(demotion?.[1]).toEqual([TENANT_ID, TARGET_SCALE_ID]);

        const targetUpdate = query.mock.calls.find(call => (
            normalizedSql(call[0]).startsWith('UPDATE grading_scales')
            && normalizedSql(call[0]).includes('RETURNING updated_at')
        ));
        expect(targetUpdate?.[1]).toEqual(expect.arrayContaining([true, TARGET_SCALE_ID, TENANT_ID]));

        const auditCalls = query.mock.calls.filter(call => normalizedSql(call[0]).startsWith('INSERT INTO audit_logs'));
        expect(auditCalls).toHaveLength(2);
        expect(auditCalls.every(call => call[1].includes(TENANT_ID) && call[1].includes(USER_ID))).toBe(true);
        expect(query).toHaveBeenCalledWith('COMMIT');
        expect(query).not.toHaveBeenCalledWith('ROLLBACK');
    });

    it('promotes an active replacement before completing deletion of the current default', async () => {
        const currentDefault = scaleFixture({ id: DEFAULT_SCALE_ID, isDefault: true });
        const replacement = scaleFixture({ id: TARGET_SCALE_ID, name: 'Replacement' });

        query.mockImplementation(async (statement: string) => {
            const sql = normalizedSql(statement);
            if (sql.includes('FROM grading_scales') && sql.includes('FOR UPDATE')) {
                return { rows: [currentDefault, replacement] };
            }
            if (sql.includes('WHERE rubric.scale_id = $1')) {
                return { rows: [rubricFixture(DEFAULT_SCALE_ID)] };
            }
            if (sql.startsWith('UPDATE grading_scales') && sql.includes('RETURNING updated_at')) {
                return { rows: [{ updatedAt: new Date(NEW_UPDATED_AT) }] };
            }
            if (isFinalScaleRead(sql)) {
                return { rows: [{ ...replacement, isDefault: true, updatedAt: new Date(NEW_UPDATED_AT) }] };
            }
            if (isFinalRubricRead(sql)) return { rows: [rubricFixture()] };
            return { rows: [] };
        });

        const result = await deleteGradingScheme({
            id: DEFAULT_SCALE_ID,
            updatedAt: ORIGINAL_UPDATED_AT,
        });

        expect(result).toEqual(expect.objectContaining({ success: true, selectedId: TARGET_SCALE_ID }));
        expect(query.mock.calls.some(call => (
            normalizedSql(call[0]).startsWith('DELETE FROM grading_scales')
            && call[1][1] === TENANT_ID
        ))).toBe(true);
        expect(query.mock.calls.some(call => (
            normalizedSql(call[0]).startsWith('UPDATE grading_scales')
            && call[1][0] === TARGET_SCALE_ID
            && call[1][1] === TENANT_ID
        ))).toBe(true);
        expect(query).toHaveBeenCalledWith('COMMIT');
    });

    it('rejects malformed configuration before opening a transaction', async () => {
        const result = await createGradingScheme({
            ...createInput,
            thresholds: [
                { ...thresholds[0], minPercentage: 91 },
                thresholds[1],
            ],
        });

        expect(result).toEqual(expect.objectContaining({ success: false, code: 'INVALID_INPUT' }));
        expect(pool.connect).not.toHaveBeenCalled();
        expect(query).not.toHaveBeenCalled();
    });
});
