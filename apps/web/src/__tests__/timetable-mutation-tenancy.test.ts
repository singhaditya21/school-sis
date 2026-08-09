import { bulkCreateEntries, createTimetableEntry } from '@/lib/actions/timetable';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

jest.mock('@/lib/db', () => ({
    pool: { connect: jest.fn(), query: jest.fn() },
}));

jest.mock('@/lib/auth/middleware', () => ({
    requireAuth: jest.fn(),
}));

const TENANT_ID = '389b4bb5-56a9-46dc-a7c0-2fcf664f054b';
const SECTION_A = '7485b6aa-ddd1-4a50-91ee-431997088044';
const SECTION_OTHER_TENANT = '8d5d5b08-f558-4edb-94bb-d63c5db568ac';
const PERIOD_ID = '1c1c3c14-28d5-422d-9c22-a313b65a237e';
const PERIOD_OTHER_TENANT = 'e5f8c519-c99f-49ed-a790-80ff280c7bf4';
const SUBJECT_ID = '6ea6d2ab-09f1-4b45-ae11-8cba52baf762';
const SUBJECT_OTHER_TENANT = 'df20f120-4654-4437-9306-dd0c84efce4d';
const TEACHER_ID = 'ad61f2ac-99b3-48a4-87ab-e975e7fb50e1';
const TEACHER_OTHER_TENANT = '72528e61-4319-4802-a59b-5656a7add26d';

const entry = {
    sectionId: SECTION_A,
    periodId: PERIOD_ID,
    dayOfWeek: 'MONDAY',
    subjectId: SUBJECT_ID,
    teacherId: TEACHER_ID,
    roomNumber: '101',
};

function sql(statement: unknown): string {
    return String(statement).replace(/\s+/g, ' ').trim();
}

describe('timetable mutation tenant boundaries', () => {
    const query = jest.fn();
    const release = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        (requireAuth as jest.Mock).mockResolvedValue({ tenantId: TENANT_ID });
        (pool.connect as jest.Mock).mockResolvedValue({ query, release });

        query.mockImplementation(async (statement: string) => {
            const text = sql(statement);
            if (text.includes('FROM sections') && text.includes('ANY($2::uuid[])')) {
                return { rows: [{ id: SECTION_A }] };
            }
            if (text.includes('FROM periods') && text.includes('ANY($2::uuid[])')) {
                return { rows: [{ id: PERIOD_ID, isBreak: 0 }] };
            }
            if (text.includes('FROM subjects') && text.includes('ANY($2::uuid[])')) {
                return { rows: [{ id: SUBJECT_ID }] };
            }
            if (text.includes('FROM users') && text.includes('ANY($2::uuid[])')) {
                return { rows: [{ id: TEACHER_ID }] };
            }
            return { rows: [] };
        });
    });

    it.each([
        ['sectionId', 'FROM sections', SECTION_OTHER_TENANT],
        ['periodId', 'FROM periods', PERIOD_OTHER_TENANT],
        ['subjectId', 'FROM subjects', SUBJECT_OTHER_TENANT],
        ['teacherId', 'FROM users', TEACHER_OTHER_TENANT],
    ] as const)(
        'rejects a cross-tenant %s before a single entry can be inserted',
        async (field, missingReferenceQuery, otherTenantId) => {
            query.mockImplementation(async (statement: string) => {
                const text = sql(statement);
                if (text.includes(missingReferenceQuery) && text.includes('ANY($2::uuid[])')) {
                    return { rows: [] };
                }
                if (text.includes('FROM periods') && text.includes('ANY($2::uuid[])')) {
                    return { rows: [{ id: PERIOD_ID, isBreak: 0 }] };
                }
                if (text.includes('FROM subjects') && text.includes('ANY($2::uuid[])')) {
                    return { rows: [{ id: SUBJECT_ID }] };
                }
                if (text.includes('FROM users') && text.includes('ANY($2::uuid[])')) {
                    return { rows: [{ id: TEACHER_ID }] };
                }
                return { rows: [] };
            });

            const result = await createTimetableEntry({ ...entry, [field]: otherTenantId });

            expect(result).toEqual({
                success: false,
                code: 'INVALID_REFERENCE',
                error: 'One or more timetable references are unavailable for this school.',
                conflicts: [],
            });
            expect(query).toHaveBeenCalledWith('ROLLBACK');
            expect(query.mock.calls.some((call) => sql(call[0]).startsWith('INSERT INTO timetable_entries'))).toBe(false);
            expect(query).not.toHaveBeenCalledWith('COMMIT');
            expect(release).toHaveBeenCalledTimes(1);
        },
    );

    it('rejects an entire bulk import when one row uses a cross-tenant identifier', async () => {
        const result = await bulkCreateEntries([
            entry,
            { ...entry, sectionId: SECTION_OTHER_TENANT, dayOfWeek: 'TUESDAY' },
        ]);

        expect(result).toEqual({
            success: false,
            inserted: 0,
            skipped: 2,
            conflicts: [],
            code: 'INVALID_REFERENCE',
            error: 'One or more timetable references are unavailable for this school.',
        });
        const sectionLookup = query.mock.calls.find((call) => (
            sql(call[0]).includes('FROM sections') && sql(call[0]).includes('ANY($2::uuid[])')
        ));
        expect(sectionLookup?.[1]).toEqual([TENANT_ID, [SECTION_A, SECTION_OTHER_TENANT]]);
        expect(query.mock.calls.some((call) => sql(call[0]).startsWith('INSERT INTO timetable_entries'))).toBe(false);
        expect(query).toHaveBeenCalledWith('ROLLBACK');
        expect(query).not.toHaveBeenCalledWith('COMMIT');
    });

    it('rolls back every valid bulk row if the durable insert fails', async () => {
        query.mockImplementation(async (statement: string) => {
            const text = sql(statement);
            if (text.includes('FROM sections') && text.includes('ANY($2::uuid[])')) {
                return { rows: [{ id: SECTION_A }] };
            }
            if (text.includes('FROM periods') && text.includes('ANY($2::uuid[])')) {
                return { rows: [{ id: PERIOD_ID, isBreak: 0 }] };
            }
            if (text.includes('FROM subjects') && text.includes('ANY($2::uuid[])')) {
                return { rows: [{ id: SUBJECT_ID }] };
            }
            if (text.includes('FROM users') && text.includes('ANY($2::uuid[])')) {
                return { rows: [{ id: TEACHER_ID }] };
            }
            if (text.startsWith('INSERT INTO timetable_entries')) {
                throw new Error('database unavailable');
            }
            return { rows: [] };
        });

        await expect(bulkCreateEntries([entry])).rejects.toThrow('database unavailable');

        expect(query).toHaveBeenCalledWith('ROLLBACK');
        expect(query).not.toHaveBeenCalledWith('COMMIT');
        expect(release).toHaveBeenCalledTimes(1);
    });

    it('detects duplicate section, teacher, and room slots inside one bulk payload', async () => {
        const result = await bulkCreateEntries([entry, { ...entry }]);

        expect(result).toEqual(expect.objectContaining({
            success: false,
            inserted: 1,
            skipped: 1,
        }));
        expect(result.conflicts.map((conflict) => conflict.type)).toEqual([
            'SECTION_ALREADY_SCHEDULED',
            'TEACHER_DOUBLE_BOOKED',
            'ROOM_DOUBLE_BOOKED',
        ]);
        expect(query.mock.calls.filter((call) => sql(call[0]).startsWith('INSERT INTO timetable_entries'))).toHaveLength(1);
        expect(query).toHaveBeenCalledWith('COMMIT');
        expect(query).not.toHaveBeenCalledWith('ROLLBACK');
    });
});
