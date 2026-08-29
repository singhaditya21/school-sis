import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Stage 4 (NOT NULL) — phase 1: the scope-presence CHECK migration (0008).
 *
 * 0008 is the EXPAND half: it adds `<table>_scope_present` CHECK ... NOT VALID on
 * every table whose scope triple must never be null, so the release auto-applies it
 * (additive) and it stays reversible. Phase 2 (0009) does the destructive SET NOT
 * NULL + DROP CHECK, operator-applied. These pin the invariants that keep 0008 safe
 * to auto-deploy and correctly scoped.
 */
const migration = readFileSync(
    resolve(process.cwd(), 'drizzle/0008_stage4_scope_presence_checks.sql'),
    'utf8',
);
const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));

const constraintLines = migration
    .split('\n')
    .filter((line) => line.includes('ADD CONSTRAINT') && line.includes('CHECK'));

describe('tenancy stage 4 — scope-presence checks (0008, expand)', () => {
    it('is additive only — no SET NOT NULL / DROP / REVOKE (auto-deployable, reversible)', () => {
        // Strip comment lines so the header prose ("... DROP CONSTRAINT ...") is ignored.
        const sql = migration
            .split('\n')
            .filter((line) => !line.trimStart().startsWith('--'))
            .join('\n');
        expect(sql).not.toMatch(/\bSET NOT NULL\b/);
        expect(sql).not.toMatch(/\bDROP\b/);
        expect(sql).not.toMatch(/\bREVOKE\b/);
    });

    it('adds every presence CHECK as NOT VALID (no scan / long lock on add)', () => {
        expect(constraintLines.length).toBe(112);
        for (const line of constraintLines) {
            expect(line).toMatch(/ADD CONSTRAINT "[a-z_]+_scope_present" CHECK \(.*\) NOT VALID;/);
        }
    });

    it('covers the tier: companies(owner), tenants(owner+company), ai_token_logs(owner)', () => {
        expect(migration).toContain(
            'ALTER TABLE "companies" ADD CONSTRAINT "companies_scope_present" CHECK ("owner_id" IS NOT NULL) NOT VALID;',
        );
        expect(migration).toContain(
            'ALTER TABLE "tenants" ADD CONSTRAINT "tenants_scope_present" CHECK ("owner_id" IS NOT NULL AND "company_id" IS NOT NULL) NOT VALID;',
        );
        expect(migration).toContain(
            'ALTER TABLE "ai_token_logs" ADD CONSTRAINT "ai_token_logs_scope_present" CHECK ("owner_id" IS NOT NULL) NOT VALID;',
        );
    });

    it('checks owner_id + group_id together on a representative tenant-scoped table', () => {
        expect(migration).toContain(
            'ALTER TABLE "students" ADD CONSTRAINT "students_scope_present" CHECK ("owner_id" IS NOT NULL AND "group_id" IS NOT NULL) NOT VALID;',
        );
    });

    it('excludes nullable-tenant platform tables (tenant_id can legitimately be null)', () => {
        for (const t of ['background_jobs', 'bi_dashboards', 'observability_events', 'payment_provider_events']) {
            expect(migration).not.toContain(`ALTER TABLE "${t}"`);
        }
    });

    it('excludes the school_id-scoped join tables (deferred to the Stage 5 leaf rename)', () => {
        for (const t of ['grade_subjects', 'fee_components', 'field_permissions', 'stops', 'exam_schedules']) {
            expect(migration).not.toContain(`ALTER TABLE "${t}"`);
        }
    });

    it('excludes group_policies (group_id is already NOT NULL)', () => {
        expect(migration).not.toContain('ALTER TABLE "group_policies"');
    });

    it('ships the out-of-band validate step (db:validate:notnull)', () => {
        expect(pkg.scripts['db:validate:notnull']).toBe(
            'tsx --env-file-if-exists=.env.local scripts/validate-scope-presence.ts',
        );
    });
});
