import React from 'react';
import { requireRole } from '@/lib/auth/middleware';
import { UserRole } from '@/lib/rbac/permissions';
import { db, setTenantContext } from '@/lib/db';
import { marketingLeads } from '@/lib/db/schema/platform';
import { sql, count, sum } from 'drizzle-orm';
import LeadsClient from './client-page';

export const metadata = {
    title: 'Lead Pipeline | ScholarMind HQ',
};

export default async function LeadsPage() {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);
    await setTenantContext('platform');

    // Aggregate by Status
    const statusAggregates = await db.execute(sql`
        SELECT 
            status, 
            COUNT(*)::int as count,
            SUM(student_capacity)::int as capacity
        FROM marketing_leads 
        GROUP BY status
    `);

    // Get Raw Leads
    const leadsList = await db.execute(sql`
        SELECT 
            id, contact_name, contact_email, school_name, student_capacity, status, created_at
        FROM marketing_leads
        ORDER BY created_at DESC
        LIMIT 50
    `);

    // Pipeline Value (Assuming $15/student/year is avg MRR)
    const pipelineValue = (statusAggregates as any[])
        .filter(s => s.status !== 'CLOSED') // Don't count already closed revenue in pipeline
        .reduce((a, b) => a + (Number(b.capacity) * 15), 0);

    return <LeadsClient 
        statusData={statusAggregates as any[]} 
        leads={leadsList as any[]}
        kpis={{ pipelineValue }}
    />;
}
