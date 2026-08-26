import React from 'react';
import { requireRole } from '@/lib/auth/middleware';
import { UserRole } from '@/lib/rbac/permissions';
import { pool } from '@/lib/db';
import TreasuryClient, { type CampusFinanceRow, type MethodRow, type MonthRow } from './client-page';

export const metadata = {
    title: 'Cross-Campus Finance | ScholarMind HQ',
};

/**
 * Cross-campus finance rollup.
 *
 * Every figure on this page comes from the fee ledger (invoices) and the cash
 * ledger (payments). Amounts are numeric(12,2) in RUPEES and are rendered with
 * formatCurrency — never divided or re-scaled.
 *
 * Campuses are joined to their HQ group through multi_campus_hierarchy so an
 * executive can roll the numbers up by group region. Tenants with no hierarchy
 * row are reported as unassigned rather than being silently dropped.
 */
export default async function TreasuryPage() {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);

    const { rows: campusRows } = await pool.query(
        `SELECT
            t.id,
            t.name,
            t.code,
            t.is_active AS "isActive",
            COALESCE(c.subscription_tier::text, 'CORE') AS tier,
            g.id   AS "groupId",
            g.name AS "groupName",
            mch.region      AS "groupRegion",
            mch.campus_type AS "campusType",
            COALESCE(inv.billed, 0)::float8       AS billed,
            COALESCE(inv.collected, 0)::float8    AS collected,
            COALESCE(inv.overdue, 0)::float8      AS overdue,
            COALESCE(st.active_students, 0)::int  AS "activeStudents",
            COALESCE(cash.cash90, 0)::float8      AS "cash90d"
         FROM tenants t
         LEFT JOIN companies c ON c.id = t.company_id
         LEFT JOIN multi_campus_hierarchy mch ON mch.tenant_id = t.id
         LEFT JOIN hq_groups g ON g.id = mch.group_id
         LEFT JOIN LATERAL (
            SELECT
                SUM(i.total_amount) AS billed,
                SUM(i.paid_amount)  AS collected,
                SUM(
                    CASE
                        WHEN i.status NOT IN ('PAID', 'CANCELLED', 'WAIVED')
                             AND i.due_date < CURRENT_DATE
                        THEN i.total_amount - i.paid_amount
                        ELSE 0
                    END
                ) AS overdue
            FROM invoices i
            WHERE i.tenant_id = t.id
         ) inv ON TRUE
         LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS active_students
            FROM students s
            WHERE s.tenant_id = t.id AND s.status = 'ACTIVE'
         ) st ON TRUE
         LEFT JOIN LATERAL (
            SELECT SUM(p.amount) AS cash90
            FROM payments p
            WHERE p.tenant_id = t.id
              AND p.status = 'COMPLETED'
              AND p.paid_at >= NOW() - INTERVAL '90 days'
         ) cash ON TRUE
         ORDER BY inv.billed DESC NULLS LAST, t.name ASC`
    );

    const { rows: methodRows } = await pool.query(
        `SELECT
            p.method::text AS method,
            SUM(p.amount)::float8 AS volume,
            COUNT(*)::int AS "txnCount"
         FROM payments p
         WHERE p.status = 'COMPLETED'
         GROUP BY p.method
         ORDER BY volume DESC`
    );

    const { rows: monthRows } = await pool.query(
        `SELECT
            to_char(date_trunc('month', p.paid_at), 'YYYY-MM') AS month,
            SUM(p.amount)::float8 AS collected
         FROM payments p
         WHERE p.status = 'COMPLETED'
           AND p.paid_at >= date_trunc('month', NOW()) - INTERVAL '11 months'
         GROUP BY 1
         ORDER BY 1`
    );

    const { rows: pendingRows } = await pool.query(
        `SELECT COALESCE(SUM(p.amount), 0)::float8 AS pending
         FROM payments p
         WHERE p.status = 'PENDING'`
    );

    const campuses = campusRows as CampusFinanceRow[];

    return (
        <TreasuryClient
            campuses={campuses}
            methods={methodRows as MethodRow[]}
            months={monthRows as MonthRow[]}
            pendingCash={Number(pendingRows[0]?.pending ?? 0)}
        />
    );
}
