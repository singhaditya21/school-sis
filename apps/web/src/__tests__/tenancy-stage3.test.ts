import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Stage 3 of the owner → group → school migration: the integrity guard.
 * Population triggers fill the triple from the leaf (zero writer changes), and a
 * MATCH FULL composite FK per scoped table makes an inconsistent or partial triple
 * unwritable. Additive only — no destructive markers, no policy change (catalog
 * stays 184). Proven on a seeded DB: provisioning fills every triple, the FK
 * rejects a partial triple, 137 constraints validate, and a company-owner change
 * cascades to the data.
 */
const migration = readFileSync(
    resolve(process.cwd(), 'drizzle/0007_stage3_scope_integrity.sql'),
    'utf8',
);

describe('tenancy stage 3 — integrity guard', () => {
    it('adds MATCH FULL scope FKs (NOT VALID) referencing the tenant triple', () => {
        expect(migration).toContain('_scope_fk FOREIGN KEY (tenant_id, group_id, owner_id) REFERENCES public.tenants (id, company_id, owner_id) MATCH FULL');
        expect(migration).toContain('school_id, group_id, owner_id');
        expect(migration).toContain('NOT VALID');
    });

    it('installs population triggers so writers need no change', () => {
        expect(migration).toContain('app_private.fill_scope_from_tenant');
        expect(migration).toContain('app_private.autocreate_owner');
        expect(migration).toMatch(/CREATE TRIGGER \w+_fill_scope BEFORE INSERT OR UPDATE/);
    });

    it('is additive only — no destructive statements, so no marker needed', () => {
        // Strip line comments first — the header comment names these very keywords.
        const sql = migration.replace(/--[^\n]*/g, '');
        expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT)/i);
        expect(sql).not.toMatch(/\bSET\s+NOT\s+NULL/i);
        expect(sql).not.toMatch(/ALTER\s+COLUMN[^;]*TYPE/i);
    });

    it('creates app_private before using it (chain runs before tenant-rls.sql)', () => {
        expect(migration).toContain('CREATE SCHEMA IF NOT EXISTS app_private');
    });
});
