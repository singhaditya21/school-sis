import React from 'react';
import { requireRole } from '@/lib/auth/middleware';
import { UserRole } from '@/lib/rbac/permissions';
import { db, setTenantContext } from '@/lib/db';
import { sql } from 'drizzle-orm';
import TreasuryClient from './client-page';

export const metadata = {
    title: 'Global Treasury Routing | ScholarMind HQ',
};

export default async function TreasuryPage() {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);
    await setTenantContext('platform');

    // Fetch Global Payment Trends by Method
    const methodAggregates = await db.execute(sql`
        SELECT 
            payment_method, 
            SUM(amount)::int as total_volume,
            COUNT(*)::int as txn_count
        FROM payments 
        WHERE status = 'COMPLETED'
        GROUP BY payment_method
    `);

    // Fetch Highest Grossing Nodes (Tenants)
    const nodeAggregates = await db.execute(sql`
        SELECT 
            t.name as node_name,
            SUM(p.amount)::int as total_volume
        FROM payments p
        JOIN tenants t ON p.tenant_id = t.id
        WHERE p.status = 'COMPLETED'
        GROUP BY t.id, t.name
        ORDER BY total_volume DESC
        LIMIT 10
    `);

    // Calculate Unreconciled / Pending Cashflow
    const pendingCashflow = await db.execute(sql`
        SELECT 
            SUM(amount)::int as pending_volume
        FROM payments 
        WHERE status = 'PENDING' OR status = 'PROCESSING'
    `);

    const totalVolume = (methodAggregates as any[]).reduce((a, b) => a + Number(b.total_volume), 0);
    const totalPending = Number((pendingCashflow as any)[0]?.pending_volume || 0);

    return <TreasuryClient 
        methodData={methodAggregates as any[]} 
        nodeData={nodeAggregates as any[]}
        kpis={{ totalVolume, totalPending }}
    />;
}
