/**
 * Stage 0 backfill — populate the new owner tier.
 *
 * The owner → group → school migration adds an `owners` table and a nullable
 * `owner_id` to `companies` and `tenants`. This script fills that column in for
 * every existing row, so a later stage can make it NOT NULL:
 *
 *   1. Orphan schools — any `tenants.company_id IS NULL` — are pointed at a
 *      single `LEGACY-UNASSIGNED` company. This is load-bearing: the owners RLS
 *      policy resolves visibility through `companies → tenants` (keyed on
 *      `companies.owner_id`), so a school with no company would never see its
 *      owner. Setting company_id, not just owner_id, is what makes the chain
 *      resolve. (Decision A.)
 *   2. One owner is created per company and linked via `companies.owner_id`.
 *      (Decision B — preserves today's billing/isolation boundaries exactly.)
 *   3. Each school's `owner_id` is copied down from its company's owner.
 *
 * Idempotent: every write is guarded so a re-run is a no-op. It asserts zero
 * null-owner rows remain before committing, and rolls back otherwise. The
 * volume here is the group/school tiers only (small), so it runs in one
 * transaction rather than batched — the heavy per-row backfill of the ~140
 * scoped data tables is a later stage.
 *
 * Run against a database whose migrations are already applied (0000..0005):
 *
 *   pnpm --filter @school-sis/web exec tsx scripts/backfill-owners.ts
 *   pnpm --filter @school-sis/web exec tsx scripts/backfill-owners.ts --dry-run
 */

import { pool, runWithRlsBypass, RLS_BYPASS_JUSTIFICATIONS } from '@/lib/db';
import type { PoolClient } from 'pg';

const LEGACY_COMPANY_NAME = 'LEGACY-UNASSIGNED';

const DRY_RUN = process.argv.includes('--dry-run');

interface Counts {
    orphanTenants: number;
    companiesWithoutOwner: number;
    tenantsWithoutOwner: number;
}

async function readCounts(client: PoolClient): Promise<Counts> {
    const { rows } = await client.query<{
        orphan_tenants: number;
        companies_without_owner: number;
        tenants_without_owner: number;
    }>(
        `SELECT
             (SELECT count(*)::int FROM tenants   WHERE company_id IS NULL) AS orphan_tenants,
             (SELECT count(*)::int FROM companies WHERE owner_id  IS NULL) AS companies_without_owner,
             (SELECT count(*)::int FROM tenants   WHERE owner_id  IS NULL) AS tenants_without_owner`,
    );
    return {
        orphanTenants: rows[0].orphan_tenants,
        companiesWithoutOwner: rows[0].companies_without_owner,
        tenantsWithoutOwner: rows[0].tenants_without_owner,
    };
}

/** Point orphan schools at a single LEGACY-UNASSIGNED company. Returns rows moved. */
async function adoptOrphanTenants(client: PoolClient): Promise<number> {
    const { rows: orphan } = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM tenants WHERE company_id IS NULL`,
    );
    if (orphan[0].n === 0) return 0;

    const existing = await client.query<{ id: string }>(
        `SELECT id FROM companies WHERE name = $1 ORDER BY created_at LIMIT 1`,
        [LEGACY_COMPANY_NAME],
    );
    const legacyCompanyId =
        existing.rows[0]?.id ??
        (
            await client.query<{ id: string }>(
                `INSERT INTO companies (name) VALUES ($1) RETURNING id`,
                [LEGACY_COMPANY_NAME],
            )
        ).rows[0].id;

    const moved = await client.query(
        `UPDATE tenants SET company_id = $1, updated_at = NOW() WHERE company_id IS NULL`,
        [legacyCompanyId],
    );
    return moved.rowCount ?? 0;
}

/** Create one owner per company that lacks one; link it. Returns owners created. */
async function createOwnerPerCompany(client: PoolClient): Promise<number> {
    const { rows: needing } = await client.query<{ id: string; name: string }>(
        `SELECT id, name FROM companies WHERE owner_id IS NULL ORDER BY created_at`,
    );
    for (const company of needing) {
        const owner = await client.query<{ id: string }>(
            `INSERT INTO owners (name) VALUES ($1) RETURNING id`,
            [company.name],
        );
        await client.query(
            `UPDATE companies SET owner_id = $1, updated_at = NOW() WHERE id = $2`,
            [owner.rows[0].id, company.id],
        );
    }
    return needing.length;
}

/** Copy each company's owner down onto its schools. Returns rows updated. */
async function propagateOwnerToTenants(client: PoolClient): Promise<number> {
    const updated = await client.query(
        `UPDATE tenants t
            SET owner_id = c.owner_id, updated_at = NOW()
           FROM companies c
          WHERE t.company_id = c.id
            AND c.owner_id IS NOT NULL
            AND t.owner_id IS DISTINCT FROM c.owner_id`,
    );
    return updated.rowCount ?? 0;
}

async function main(): Promise<void> {
    await runWithRlsBypass(RLS_BYPASS_JUSTIFICATIONS.TENANT_PROVISIONING, async () => {
        const client = await pool.connect();
        try {
            const before = await readCounts(client);
            console.log(
                `Before: ${before.orphanTenants} orphan schools, ` +
                    `${before.companiesWithoutOwner} companies without an owner, ` +
                    `${before.tenantsWithoutOwner} schools without an owner.`,
            );

            if (DRY_RUN) {
                console.log('--dry-run: no changes written.');
                return;
            }

            await client.query('BEGIN');
            const adopted = await adoptOrphanTenants(client);
            const ownersCreated = await createOwnerPerCompany(client);
            const tenantsLinked = await propagateOwnerToTenants(client);

            const after = await readCounts(client);
            if (
                after.orphanTenants !== 0 ||
                after.companiesWithoutOwner !== 0 ||
                after.tenantsWithoutOwner !== 0
            ) {
                await client.query('ROLLBACK');
                throw new Error(
                    `Backfill did not fully resolve the owner tier ` +
                        `(orphan=${after.orphanTenants}, companies=${after.companiesWithoutOwner}, ` +
                        `tenants=${after.tenantsWithoutOwner}); rolled back.`,
                );
            }
            await client.query('COMMIT');

            console.log(
                `Backfilled: adopted ${adopted} orphan school(s), created ${ownersCreated} owner(s), ` +
                    `linked ${tenantsLinked} school(s). Every company and school now has an owner.`,
            );
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    });
    await pool.end();
}

main().catch((error) => {
    console.error('[backfill-owners] failed:', error instanceof Error ? error.message : error);
    process.exit(1);
});
