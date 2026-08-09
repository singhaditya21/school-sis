import React from 'react';
import { requireRole } from '@/lib/auth/middleware';
import { UserRole } from '@/lib/rbac/permissions';
import { pool } from '@/lib/db';
import TreasuryClient from './client-page';

export const metadata = {
    title: 'Treasury Overview | ScholarMind HQ',
};

export default async function TreasuryPage() {
    // This page aggregates across every tenant, so tenant administrators must
    // never reach the underlying global queries.
    await requireRole(UserRole.PLATFORM_ADMIN);

    // Payments currently have no canonical currency column. Reading the row as
    // JSON lets a future schema-provided currency be used without combining it
    // with other currencies; legacy rows remain explicitly UNSPECIFIED.
    const [
        { rows: methodAggregates },
        { rows: nodeAggregates },
        { rows: completedTotals },
        { rows: pendingTotals },
    ] = await Promise.all([
        pool.query(`
            SELECT
                p.method AS payment_method,
                COALESCE(NULLIF(UPPER(to_jsonb(p)->>'currency'), ''), 'UNSPECIFIED') AS currency,
                COALESCE(SUM(p.amount), 0)::text AS total_volume,
                COUNT(*)::int AS txn_count
            FROM payments p
            WHERE p.status = 'COMPLETED'
            GROUP BY p.method, 2
            ORDER BY 2, p.method
        `),
        pool.query(`
            SELECT
                t.name AS node_name,
                COALESCE(NULLIF(UPPER(to_jsonb(p)->>'currency'), ''), 'UNSPECIFIED') AS currency,
                COALESCE(SUM(p.amount), 0)::text AS total_volume,
                COUNT(*)::int AS txn_count
            FROM payments p
            JOIN tenants t ON p.tenant_id = t.id
            WHERE p.status = 'COMPLETED'
            GROUP BY t.id, t.name, 2
            ORDER BY SUM(p.amount) DESC
            LIMIT 10
        `),
        pool.query(`
            SELECT
                COALESCE(NULLIF(UPPER(to_jsonb(p)->>'currency'), ''), 'UNSPECIFIED') AS currency,
                COALESCE(SUM(p.amount), 0)::text AS total_volume
            FROM payments p
            WHERE p.status = 'COMPLETED'
            GROUP BY 1
            ORDER BY 1
        `),
        pool.query(`
            SELECT
                COALESCE(NULLIF(UPPER(to_jsonb(p)->>'currency'), ''), 'UNSPECIFIED') AS currency,
                COALESCE(SUM(p.amount), 0)::text AS total_volume
            FROM payments p
            WHERE p.status::text IN ('PENDING', 'PROCESSING')
            GROUP BY 1
            ORDER BY 1
        `),
    ]);

    return <TreasuryClient 
        methodData={methodAggregates} 
        nodeData={nodeAggregates}
        kpis={{ completed: completedTotals, pending: pendingTotals }}
    />;
}
