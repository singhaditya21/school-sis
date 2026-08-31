import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { gradingRubrics } from '@school-sis/api/src/db/generated/tables';

/**
 * Stage 1 of the owner → group → school migration: the nullable triple on every
 * scoped table. It must stay a pure, reversible EXPAND — columns only:
 *   - no NOT NULL (enforced in Stage 4) and no FK constraints (the Stage 3
 *     composite FK is strictly stronger, and 280 validating FKs in one migration
 *     would lock the tier tables);
 *   - the exception tables (ai_token_logs keeps its company_id group; the hq_*
 *     Decision-E tables) are not blanket-scoped;
 *   - it changes no RLS policy, so the catalog stays pinned at 184.
 */
const drizzleDir = resolve(process.cwd(), 'drizzle');
const migrationFile = readdirSync(drizzleDir).find((f) => f.includes('stage1_scope_triple'));
const migration = readFileSync(resolve(drizzleDir, migrationFile!), 'utf8');
const deployment = readFileSync(resolve(process.cwd(), 'scripts/deployment-migrations.ts'), 'utf8');

describe('tenancy stage 1 — scope triple', () => {
    it('is pure ADD COLUMN — no NOT NULL, no foreign keys', () => {
        expect(migration).toMatch(/ADD COLUMN "owner_id" uuid;/);
        expect(migration).not.toMatch(/ADD COLUMN "(owner|group|school)_id" uuid NOT NULL/);
        expect(migration).not.toContain('ADD CONSTRAINT');
    });

    it('adds owner_id broadly, group_id nearly as broadly, school_id only to join tables', () => {
        const count = (re: RegExp) => (migration.match(re) || []).length;
        const owner = count(/ADD COLUMN "owner_id"/g);
        const group = count(/ADD COLUMN "group_id"/g);
        const school = count(/ADD COLUMN "school_id"/g);
        expect(owner).toBeGreaterThan(group); // ai_token_logs gets owner but not group
        expect(group).toBeGreaterThan(school);
        expect(school).toBe(9);
    });

    it('exposes the owner/group/school scope columns on scoped tables', () => {
        // FK-free-ness is pinned by the "pure ADD COLUMN — no ADD CONSTRAINT" test
        // above; the pgTable source is gone, so column existence is now checked
        // against the generated schema (gradingRubrics carries the full triple).
        expect(gradingRubrics.ownerId).toBeDefined();
        expect(gradingRubrics.groupId).toBeDefined();
        expect(gradingRubrics.schoolId).toBeDefined();
    });

    it('does not scope ai_token_logs group or the hq_* exception tables', () => {
        // ai_token_logs uses company_id as its group tier — never a new group_id.
        expect(migration).not.toMatch(/ALTER TABLE "ai_token_logs" ADD COLUMN "group_id"/);
        for (const t of ['multi_campus_hierarchy', 'group_policies', 'hq_groups']) {
            expect(migration).not.toMatch(new RegExp(`ALTER TABLE "${t}" ADD COLUMN "owner_id"`));
        }
    });

    it('changes no RLS policy — catalog stays pinned at 184', () => {
        expect(deployment).toContain('EXPECTED_RLS_POLICY_COUNT = 184');
    });
});
