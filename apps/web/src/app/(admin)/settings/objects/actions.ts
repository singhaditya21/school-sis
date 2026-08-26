'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

/**
 * Object Manager support queries.
 *
 * `metadata_fields` has no `tenant_id` of its own, so every read joins back to
 * `metadata_objects` — the tenant-owning parent — and repeats the same
 * visibility rule the object list uses (this tenant's objects, plus the shared
 * standard objects that have `tenant_id IS NULL`).
 */

export type ObjectFieldCounts = {
    /** metadata_objects.id → number of live fields. */
    total: Record<string, number>;
    /** metadata_objects.id → number of live custom fields. */
    custom: Record<string, number>;
};

export async function getObjectFieldCounts(): Promise<ObjectFieldCounts> {
    const { tenantId } = await requireAuth('settings:read');

    const { rows } = await pool.query(
        `SELECT f.object_id AS "objectId",
                COUNT(*)::int AS "total",
                COUNT(*) FILTER (WHERE COALESCE(f.is_custom, false))::int AS "custom"
           FROM metadata_fields f
           JOIN metadata_objects o ON o.id = f.object_id
          WHERE f.status <> 'ARCHIVED'
            AND o.status <> 'ARCHIVED'
            AND (
              o.tenant_id = $1
              OR (o.tenant_id IS NULL AND COALESCE(o.is_custom, false) = false)
            )
          GROUP BY f.object_id`,
        [tenantId],
    );

    const total: Record<string, number> = {};
    const custom: Record<string, number> = {};

    for (const row of rows as { objectId: string; total: number; custom: number }[]) {
        total[row.objectId] = row.total;
        custom[row.objectId] = row.custom;
    }

    return { total, custom };
}

/**
 * metadata_objects.id → number of EAV records this tenant holds.
 *
 * `metadata_records` carries its own `tenant_id`, but it is still joined back to
 * `metadata_objects` so a record can never be counted against an object that
 * belongs to another tenant.
 */
export async function getObjectRecordCounts(): Promise<Record<string, number>> {
    const { tenantId } = await requireAuth('settings:read');

    const { rows } = await pool.query(
        `SELECT r.object_id AS "objectId",
                COUNT(*)::int AS "records"
           FROM metadata_records r
           JOIN metadata_objects o ON o.id = r.object_id
          WHERE r.tenant_id = $1
            AND o.tenant_id = $1
            AND o.status <> 'ARCHIVED'
          GROUP BY r.object_id`,
        [tenantId],
    );

    const counts: Record<string, number> = {};
    for (const row of rows as { objectId: string; records: number }[]) {
        counts[row.objectId] = row.records;
    }
    return counts;
}
