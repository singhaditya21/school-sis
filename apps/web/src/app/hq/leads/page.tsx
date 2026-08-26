import React from 'react';
import { requireRole } from '@/lib/auth/middleware';
import { UserRole } from '@/lib/rbac/permissions';
import { pool } from '@/lib/db';
import LeadsClient, { type Lead, type StatusAggregate } from './client-page';

export const metadata = {
    title: 'Lead Pipeline | ScholarMind HQ',
};

export default async function LeadsPage() {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);

    const { rows: statusRows } = await pool.query(
        `SELECT
            status,
            COUNT(*)::int AS count,
            COALESCE(SUM(student_capacity), 0)::int AS capacity
         FROM marketing_leads
         GROUP BY status`
    );

    const { rows: leadRows } = await pool.query(
        `SELECT
            id,
            contact_name  AS "contactName",
            contact_email AS "contactEmail",
            school_name   AS "schoolName",
            student_capacity AS "studentCapacity",
            pain_points   AS "painPoints",
            status,
            created_at    AS "createdAt"
         FROM marketing_leads
         ORDER BY created_at DESC
         LIMIT 100`
    );

    return (
        <LeadsClient
            statusData={statusRows as StatusAggregate[]}
            leads={leadRows as Lead[]}
        />
    );
}
