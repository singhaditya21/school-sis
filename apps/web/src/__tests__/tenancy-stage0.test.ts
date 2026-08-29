import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Stage 0 of the owner → group → school migration: the owners tier.
 *
 * These pin the invariants that make Stage 0 a safe, reversible expand step, so a
 * later edit cannot quietly turn it into something that locks out or breaks the
 * live RLS system:
 *   - owner_id is added NULLABLE (a NOT NULL add would fail the backfill and trip
 *     the destructive-migration gate);
 *   - owners has FORCE RLS and an explicit parent-scoped policy (it has no
 *     tenant_id, so the discovery loop never reaches it);
 *   - the backfill adopts orphan schools by company, which is what makes the
 *     owner → company → tenant visibility chain resolve for them.
 * The catalog count/SHA, matrix classification and policy coverage are enforced
 * live by deployment-migrations + the CI scripts; these guard the source shape.
 */
const migration = readFileSync(resolve(process.cwd(), 'drizzle/0005_owners_tier.sql'), 'utf8');
const rls = readFileSync(
    resolve(process.cwd(), '../../packages/api/src/db/migrations/tenant-rls.sql'),
    'utf8',
);
const deployment = readFileSync(resolve(process.cwd(), 'scripts/deployment-migrations.ts'), 'utf8');
const backfill = readFileSync(resolve(process.cwd(), 'scripts/backfill-owners.ts'), 'utf8');

describe('tenancy stage 0 — owners tier', () => {
    it('adds owner_id as NULLABLE on companies and tenants (expand, not enforce)', () => {
        expect(migration).toContain('ALTER TABLE "companies" ADD COLUMN "owner_id" uuid;');
        expect(migration).toContain('ALTER TABLE "tenants" ADD COLUMN "owner_id" uuid;');
        // No NOT NULL on the new columns at this stage.
        expect(migration).not.toMatch(/ADD COLUMN "owner_id" uuid NOT NULL/);
    });

    it('creates the owners table with restrict-on-delete FKs', () => {
        expect(migration).toContain('CREATE TABLE "owners"');
        expect(migration).toMatch(/companies_owner_id_owners_id_fk[\s\S]*ON DELETE restrict ON UPDATE cascade/);
        expect(migration).toMatch(/tenants_owner_id_owners_id_fk[\s\S]*ON DELETE restrict ON UPDATE cascade/);
    });

    it('gives owners FORCE RLS and the four parent-scoped policies', () => {
        expect(rls).toContain('ALTER TABLE public.owners FORCE ROW LEVEL SECURITY');
        for (const cmd of ['select', 'insert', 'update', 'delete']) {
            expect(rls).toContain(`CREATE POLICY owners_tenant_isolation_${cmd} ON public.owners`);
        }
        // Visibility resolves owner → company → tenant, keyed off companies.owner_id.
        expect(rls).toMatch(/WHERE c\.owner_id = owners\.id[\s\S]*current_tenant_id\(\)/);
    });

    it('pins the RLS catalog count to include the four new owners policies', () => {
        expect(deployment).toContain('EXPECTED_RLS_POLICY_COUNT = 184');
        expect(deployment).toContain('owners_tenant_isolation_select');
    });

    it('backfill adopts orphan schools by company, not owner alone', () => {
        // Setting owner_id without company_id would leave orphans invisible to the
        // owner policy, which walks companies → tenants.
        expect(backfill).toContain('SET company_id = $1');
        expect(backfill).toContain('LEGACY-UNASSIGNED');
    });
});
