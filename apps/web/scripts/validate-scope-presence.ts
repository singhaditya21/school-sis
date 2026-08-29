/**
 * Stage 4 (NOT NULL, phase 1) — validate the scope-presence CHECK constraints.
 *
 * Migration 0008 adds every `<table>_scope_present` CHECK as NOT VALID: it enforces
 * new writes immediately but does not scan existing rows, so the migration stays fast
 * and takes only a brief lock. This marks those CHECKs VALIDATED once the Stage 2
 * backfill has filled the triple on every scoped row — a table-by-table VALIDATE,
 * each in its own transaction, taking only SHARE UPDATE EXCLUSIVE (no read/write
 * blocking), so it never validates the whole set inside one long transaction.
 *
 * A validated CHECK is what lets phase 2 (migration 0009) run SET NOT NULL without a
 * full-table scan (Postgres proves the column is non-null from the constraint), so
 * this MUST complete on the target before 0009 is applied.
 *
 * Requires DDL privileges (constraint validation needs table ownership), so run it
 * with the same connection the migrations use, AFTER db:backfill:owners and
 * db:backfill:scope have completed. Idempotent — an already-validated CHECK is
 * skipped. If a VALIDATE fails, a scoped row still has a null owner_id/group_id
 * (or, for the tier, company_id): re-run the Stage 2 backfill and investigate before
 * proceeding to 0009.
 *
 *   pnpm --filter @school-sis/web exec tsx scripts/validate-scope-presence.ts
 */

import pg from 'pg';

const connectionString =
    process.env.DIRECT_URL || process.env.DATABASE_URL || process.env.PLATFORM_DATABASE_URL;
if (!connectionString) {
    console.error('Set DIRECT_URL or DATABASE_URL to a connection with DDL privileges.');
    process.exit(1);
}

async function main(): Promise<void> {
    const client = new pg.Client({
        connectionString,
        ssl: /sslmode=disable/.test(connectionString!) ? false : undefined,
    });
    await client.connect();
    try {
        // Every scope-presence CHECK still NOT VALID (convalidated = false).
        const { rows } = await client.query<{ table_name: string; constraint_name: string }>(
            `SELECT rel.relname AS table_name, con.conname AS constraint_name
             FROM pg_constraint con
             JOIN pg_class rel ON rel.oid = con.conrelid
             JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
             WHERE nsp.nspname = 'public' AND con.contype = 'c' AND NOT con.convalidated
               AND con.conname LIKE '%\\_scope\\_present'
             ORDER BY rel.relname`,
        );
        if (rows.length === 0) {
            console.log('Nothing to validate — every scope-presence CHECK is already validated.');
            return;
        }
        console.log(`Validating ${rows.length} constraint(s)…`);
        let done = 0;
        for (const { table_name, constraint_name } of rows) {
            // Own transaction per constraint: non-blocking, and one slow table cannot
            // hold a lock across the whole set.
            await client.query('BEGIN');
            try {
                await client.query(
                    `ALTER TABLE public.${table_name} VALIDATE CONSTRAINT ${constraint_name}`,
                );
                await client.query('COMMIT');
                done += 1;
            } catch (error) {
                await client.query('ROLLBACK').catch(() => {});
                throw error;
            }
        }

        const { rows: remaining } = await client.query<{ n: string }>(
            `SELECT count(*)::text AS n FROM pg_constraint con
             JOIN pg_class rel ON rel.oid = con.conrelid
             JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
             WHERE nsp.nspname = 'public' AND con.contype = 'c' AND NOT con.convalidated
               AND con.conname LIKE '%\\_scope\\_present'`,
        );
        if (remaining[0].n !== '0') {
            throw new Error(`${remaining[0].n} scope-presence CHECK(s) still unvalidated after the run.`);
        }
        console.log(
            `Validated ${done} constraint(s). owner_id/group_id presence is now enforced for existing rows too.`,
        );
    } finally {
        await client.end();
    }
}

main().catch((error) => {
    console.error('[validate-scope-presence] failed:', error instanceof Error ? error.message : error);
    process.exit(1);
});
