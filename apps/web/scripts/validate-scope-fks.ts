/**
 * Stage 3 — validate the scope composite FKs.
 *
 * The Stage 3 migration adds every scope FK as NOT VALID: it enforces new writes
 * immediately but does not scan existing rows, so the migration stays fast and
 * takes no long lock. This marks those FKs (and the tenants→companies drift FK)
 * VALIDATED once the data is fully backfilled — a table-by-table VALIDATE, each
 * in its own transaction, taking only SHARE UPDATE EXCLUSIVE (no read/write
 * blocking), so it never validates the whole set inside one long transaction.
 *
 * Requires DDL privileges (constraint validation needs table ownership), so run
 * it with the same connection the migrations use, AFTER db:backfill:owners and
 * db:backfill:scope have completed. Idempotent — an already-validated constraint
 * is skipped.
 *
 *   pnpm --filter @school-sis/web exec tsx scripts/validate-scope-fks.ts
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
        // Every scope FK plus the tier drift FK, still NOT VALID (convalidated = false).
        const { rows } = await client.query<{ table_name: string; constraint_name: string }>(
            `SELECT rel.relname AS table_name, con.conname AS constraint_name
             FROM pg_constraint con
             JOIN pg_class rel ON rel.oid = con.conrelid
             JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
             WHERE nsp.nspname = 'public' AND con.contype = 'f' AND NOT con.convalidated
               AND (con.conname LIKE '%\\_scope\\_fk' OR con.conname = 'tenants_company_owner_fk')
             ORDER BY rel.relname`,
        );
        if (rows.length === 0) {
            console.log('Nothing to validate — every scope FK is already validated.');
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
             WHERE nsp.nspname = 'public' AND con.contype = 'f' AND NOT con.convalidated
               AND (con.conname LIKE '%\\_scope\\_fk' OR con.conname = 'tenants_company_owner_fk')`,
        );
        if (remaining[0].n !== '0') {
            throw new Error(`${remaining[0].n} scope FK(s) still unvalidated after the run.`);
        }
        console.log(`Validated ${done} constraint(s). Every scope FK now guarantees existing rows too.`);
    } finally {
        await client.end();
    }
}

main().catch((error) => {
    console.error('[validate-scope-fks] failed:', error instanceof Error ? error.message : error);
    process.exit(1);
});
