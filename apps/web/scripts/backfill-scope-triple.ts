/**
 * Stage 2 backfill — populate the owner/group/school triple on every scoped row.
 *
 * Stage 1 added the nullable columns; this fills them in from the hierarchy, so
 * Stage 3 can add the composite FK and Stage 4 can make them NOT NULL. Runs
 * out-of-band (operator-run maintenance, not a migration), in batches with a
 * commit per batch so it never holds a long lock or a giant transaction, and is
 * idempotent — every update is guarded on the target still being NULL.
 *
 * Three row classes, all derived from the live schema, not hand-typed:
 *   - DIRECT (has tenant_id + owner_id + group_id): group_id/owner_id come from
 *     the row's own tenant. Rows with a NULL tenant_id (platform/global rows)
 *     keep the whole triple NULL.
 *   - ai_token_logs (owner_id only; its existing company_id is the group tier):
 *     owner_id from the tenant, after asserting company_id already matches.
 *   - JOIN (has school_id, no tenant_id): the school is resolved through the
 *     same parent chain the table's RLS policy uses; group_id/owner_id follow.
 *     A join row whose parent is a global (tenant-less) metadata object stays
 *     NULL, which is correct.
 *
 * Prerequisite: the Stage 0 owner-tier backfill must have run (companies and
 * tenants must all have owner_id), or the direct backfill would copy NULLs.
 *
 *   pnpm --filter @school-sis/web exec tsx scripts/backfill-scope-triple.ts
 *   pnpm --filter @school-sis/web exec tsx scripts/backfill-scope-triple.ts --dry-run
 */

import { pool, runWithRlsBypass, RLS_BYPASS_JUSTIFICATIONS } from '@/lib/db';
import type { PoolClient } from 'pg';

const BATCH = 5000;
const DRY_RUN = process.argv.includes('--dry-run');

// Parent chain each join table uses to reach its tenant — lifted from the named
// join policies in tenant-rls.sql. `t` is the join table, `tn` the resolved tenant.
const JOIN_CHAINS: Record<string, string> = {
    grade_subjects: 'FROM grades g JOIN tenants tn ON tn.id = g.tenant_id WHERE g.id = t.grade_id',
    fee_components: 'FROM fee_plans fp JOIN tenants tn ON tn.id = fp.tenant_id WHERE fp.id = t.fee_plan_id',
    stops: 'FROM routes r JOIN tenants tn ON tn.id = r.tenant_id WHERE r.id = t.route_id',
    exam_schedules: 'FROM exams e JOIN tenants tn ON tn.id = e.tenant_id WHERE e.id = t.exam_id',
    metadata_values: 'FROM metadata_records mr JOIN tenants tn ON tn.id = mr.tenant_id WHERE mr.id = t.record_id',
    grading_rubrics: 'FROM grading_scales gs JOIN tenants tn ON tn.id = gs.tenant_id WHERE gs.id = t.scale_id',
    metadata_fields: 'FROM metadata_objects mo JOIN tenants tn ON tn.id = mo.tenant_id WHERE mo.id = t.object_id',
    metadata_layouts: 'FROM metadata_objects mo JOIN tenants tn ON tn.id = mo.tenant_id WHERE mo.id = t.object_id',
    field_permissions:
        'FROM metadata_fields mf JOIN metadata_objects mo ON mo.id = mf.object_id JOIN tenants tn ON tn.id = mo.tenant_id WHERE mf.id = t.field_id',
};

async function columnsByTable(client: PoolClient): Promise<Map<string, Set<string>>> {
    const { rows } = await client.query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name FROM information_schema.columns
         WHERE table_schema = 'public'
           AND column_name IN ('tenant_id','owner_id','group_id','school_id','company_id')`,
    );
    const map = new Map<string, Set<string>>();
    for (const r of rows) {
        if (!map.has(r.table_name)) map.set(r.table_name, new Set());
        map.get(r.table_name)!.add(r.column_name);
    }
    return map;
}

async function assertPrerequisite(client: PoolClient): Promise<void> {
    const { rows } = await client.query<{ c: number; t: number }>(
        `SELECT (SELECT count(*)::int FROM companies WHERE owner_id IS NULL) AS c,
                (SELECT count(*)::int FROM tenants   WHERE owner_id IS NULL) AS t`,
    );
    if (rows[0].c !== 0 || rows[0].t !== 0) {
        throw new Error(
            `Owner tier is not backfilled (${rows[0].c} companies, ${rows[0].t} tenants without an owner). ` +
                `Run \`pnpm --filter @school-sis/web db:backfill:owners\` first.`,
        );
    }
    // ai_token_logs.company_id must already be the tenant's company (it is the group tier).
    const mismatch = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ai_token_logs a JOIN tenants tn ON tn.id = a.tenant_id
         WHERE a.tenant_id IS NOT NULL AND a.company_id IS DISTINCT FROM tn.company_id`,
    );
    if (mismatch.rows[0].n !== 0) {
        throw new Error(
            `${mismatch.rows[0].n} ai_token_logs rows have a company_id that is not their tenant's company; ` +
                `resolve before backfilling owner_id.`,
        );
    }
}

/**
 * A transaction. Needed for correctness, not just atomicity: the RLS-bypass
 * context is applied by the pool on BEGIN, so a bare autocommit query would run
 * without bypass and (in production, as a non-superuser) see nothing.
 */
async function inTxn<T>(client: PoolClient, fn: () => Promise<T>): Promise<T> {
    await client.query('BEGIN');
    try {
        const result = await fn();
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    }
}

/** Run a batched UPDATE to completion, one transaction (one commit) per batch. */
async function runBatched(client: PoolClient, label: string, sql: string): Promise<number> {
    let total = 0;
    for (;;) {
        const n = await inTxn(client, async () => (await client.query(sql)).rowCount ?? 0);
        total += n;
        if (n < BATCH) break;
    }
    if (total) console.log(`  ${label}: ${total}`);
    return total;
}

async function backfill(client: PoolClient, cols: Map<string, Set<string>>): Promise<void> {
    const has = (t: string, c: string) => cols.get(t)?.has(c) ?? false;
    const names = [...cols.keys()];

    const directTables = names
        .filter((t) => has(t, 'tenant_id') && has(t, 'owner_id') && has(t, 'group_id'))
        .sort();
    const joinTables = Object.keys(JOIN_CHAINS).filter((t) => has(t, 'school_id')).sort();

    console.log(`Direct: ${directTables.length} · join: ${joinTables.length} · ai_token_logs: 1`);

    // Interpolated table names are UNQUOTED (`UPDATE ${t}`, `FROM ${t}`) on purpose:
    // check-sql-prepare.mjs drops statements matching `(FROM|JOIN|UPDATE) ${` as
    // interpolated-identifier, but a quoted `"${t}"` would slip through as `"$1"`
    // and fail the audit as an undefined table. Every name here is a safe
    // lowercase identifier, so no quoting is needed.
    // DIRECT — group_id/owner_id from the row's own tenant; NULL-tenant rows untouched.
    for (const t of directTables) {
        await runBatched(
            client,
            t,
            `UPDATE ${t} AS t SET group_id = tn.company_id, owner_id = tn.owner_id
             FROM tenants tn
             WHERE t.tenant_id = tn.id AND t.tenant_id IS NOT NULL AND (t.owner_id IS NULL OR t.group_id IS NULL)
               AND t.id IN (SELECT id FROM ${t} WHERE tenant_id IS NOT NULL AND (owner_id IS NULL OR group_id IS NULL) LIMIT ${BATCH})`,
        );
    }

    // ai_token_logs — owner_id only.
    await runBatched(
        client,
        'ai_token_logs',
        `UPDATE ai_token_logs AS t SET owner_id = tn.owner_id
         FROM tenants tn
         WHERE t.tenant_id = tn.id AND t.tenant_id IS NOT NULL AND t.owner_id IS NULL
           AND t.id IN (SELECT id FROM ai_token_logs WHERE tenant_id IS NOT NULL AND owner_id IS NULL LIMIT ${BATCH})`,
    );

    // JOIN — school resolved through the policy's parent chain; group/owner follow.
    for (const t of joinTables) {
        const chain = JOIN_CHAINS[t];
        await runBatched(
            client,
            t,
            `UPDATE ${t} AS t SET school_id = tn.id, group_id = tn.company_id, owner_id = tn.owner_id
             ${chain}
               AND t.school_id IS NULL
               AND t.id IN (SELECT id FROM ${t} WHERE school_id IS NULL LIMIT ${BATCH})`,
        );
    }
}

async function verify(client: PoolClient, cols: Map<string, Set<string>>): Promise<void> {
    const has = (t: string, c: string) => cols.get(t)?.has(c) ?? false;
    const names = [...cols.keys()];
    const directTables = names.filter((t) => has(t, 'tenant_id') && has(t, 'owner_id') && has(t, 'group_id'));
    const joinTables = Object.keys(JOIN_CHAINS).filter((t) => has(t, 'school_id'));

    let problems = 0;

    // DIRECT + ai: no tenant-scoped row left without owner/group.
    for (const t of directTables) {
        const { rows } = await client.query<{ n: number }>(
            `SELECT count(*)::int AS n FROM ${t} WHERE tenant_id IS NOT NULL AND (owner_id IS NULL OR group_id IS NULL)`,
        );
        if (rows[0].n) { console.error(`  UNFILLED ${t}: ${rows[0].n}`); problems += rows[0].n; }
    }
    const ai = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ai_token_logs WHERE tenant_id IS NOT NULL AND owner_id IS NULL`,
    );
    if (ai.rows[0].n) { console.error(`  UNFILLED ai_token_logs: ${ai.rows[0].n}`); problems += ai.rows[0].n; }

    // JOIN: every row whose parent resolves to a tenant got a school_id.
    for (const t of joinTables) {
        const chain = JOIN_CHAINS[t];
        const { rows } = await client.query<{ n: number }>(
            `SELECT count(*)::int AS n FROM ${t} AS t WHERE t.school_id IS NULL AND EXISTS (SELECT 1 ${chain})`,
        );
        if (rows[0].n) { console.error(`  UNFILLED (resolvable) ${t}: ${rows[0].n}`); problems += rows[0].n; }
    }

    // Denormalisation correctness on the direct tables: the copied ids must match the tenant.
    for (const t of directTables) {
        const { rows } = await client.query<{ n: number }>(
            `SELECT count(*)::int AS n FROM ${t} x JOIN tenants tn ON tn.id = x.tenant_id
             WHERE x.tenant_id IS NOT NULL AND (x.group_id IS DISTINCT FROM tn.company_id OR x.owner_id IS DISTINCT FROM tn.owner_id)`,
        );
        if (rows[0].n) { console.error(`  MISMATCH ${t}: ${rows[0].n}`); problems += rows[0].n; }
    }

    if (problems) throw new Error(`Backfill verification found ${problems} problem row(s).`);
    console.log('Verified: every tenant-scoped row carries a correct, consistent triple.');
}

async function main(): Promise<void> {
    await runWithRlsBypass(RLS_BYPASS_JUSTIFICATIONS.TENANT_PROVISIONING, async () => {
        const client = await pool.connect();
        try {
            const cols = await inTxn(client, () => columnsByTable(client));
            await inTxn(client, () => assertPrerequisite(client));
            if (DRY_RUN) {
                const names = [...cols.keys()];
                const direct = names.filter((t) => (cols.get(t)?.has('tenant_id') && cols.get(t)?.has('group_id')));
                console.log(`--dry-run: would backfill ${direct.length} direct tables, 9 join tables, ai_token_logs.`);
                return;
            }
            await backfill(client, cols);
            await inTxn(client, () => verify(client, cols));
        } finally {
            client.release();
        }
    });
    await pool.end();
}

main().catch((error) => {
    console.error('[backfill-scope-triple] failed:', error instanceof Error ? error.message : error);
    process.exit(1);
});
