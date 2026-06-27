import React from 'react';
import { requireRole } from '@/lib/auth/middleware';
import { UserRole } from '@/lib/rbac/permissions';
import { pool, } from '@/lib/db';
import LeadsClient from './client-page';

export const metadata = {
    title: 'Lead Pipeline | ScholarMind HQ',
};

export default async function LeadsPage() {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);
    await ('platform');

    // Aggregate by Status
    const { rows: statusAggregates } = await pool.query(`
        SELECT 
            status, 
            COUNT(*)::int as count,
            SUM(student_capacity)::int as capacity
        FROM marketing_leads 
        GROUP BY status
    `);

    // Get Raw Leads
    const { rows: leadsList } = await pool.query(`
        SELECT 
            id, contact_name AS "contactName", contact_email AS "contactEmail", school_name AS "schoolName", student_capacity AS "studentCapacity", status, created_at AS "createdAt"
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
