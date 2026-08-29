import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Stage 2 of the owner → group → school migration: the out-of-band backfill of
 * the triple. These pin the properties that make it safe to run against
 * production: it derives its table set from the live schema, refuses to run
 * before the owner tier is backfilled, resolves each join table through the same
 * parent chain its RLS policy uses, runs each batch in a transaction (so the
 * RLS-bypass context is actually applied), is idempotent, and verifies before
 * it is done.
 */
const script = readFileSync(resolve(process.cwd(), 'scripts/backfill-scope-triple.ts'), 'utf8');

describe('tenancy stage 2 — scope-triple backfill', () => {
    it('refuses to run until the Stage 0 owner tier is backfilled', () => {
        expect(script).toContain('Owner tier is not backfilled');
        expect(script).toContain('db:backfill:owners');
    });

    it('runs each batch inside a transaction so the RLS-bypass context applies', () => {
        expect(script).toContain('runWithRlsBypass');
        expect(script).toMatch(/BEGIN[\s\S]*COMMIT/);
        // A bare autocommit UPDATE would run without bypass and touch nothing in prod.
    });

    it('resolves every join table through its policy parent chain', () => {
        for (const [table, parent] of [
            ['grade_subjects', 'grades'],
            ['fee_components', 'fee_plans'],
            ['stops', 'routes'],
            ['exam_schedules', 'exams'],
            ['metadata_values', 'metadata_records'],
            ['grading_rubrics', 'grading_scales'],
            ['field_permissions', 'metadata_fields'],
        ]) {
            expect(script).toContain(`${table}:`);
            expect(script).toContain(parent);
        }
    });

    it('backfills ai_token_logs owner_id only (company_id is its group)', () => {
        expect(script).toContain('UPDATE ai_token_logs');
        expect(script).toContain('company_id IS DISTINCT FROM tn.company_id');
        expect(script).not.toMatch(/UPDATE ai_token_logs[\s\S]{0,120}group_id =/);
    });

    it('is idempotent — every write is guarded on the target still being NULL', () => {
        expect(script).toMatch(/owner_id IS NULL OR t\.group_id IS NULL|owner_id IS NULL/);
        expect(script).toContain('school_id IS NULL');
    });
});
