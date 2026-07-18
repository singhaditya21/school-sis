// Fee Cashflow Service — Production (Real DB)
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

function normalizeMonthWindow(months: number): number {
    if (!Number.isFinite(months)) return 12;
    return Math.max(1, Math.min(36, Math.floor(months)));
}

export const CashflowService = {
    async getMonthlyCashflow(tenantId: string, months: number = 12) {
        const windowMonths = normalizeMonthWindow(months);
        const rows = await db.execute(sql`
            WITH bounds AS (
                SELECT
                    (date_trunc('month', CURRENT_DATE)::date - ((${windowMonths}::int - 1) * interval '1 month'))::date AS start_month,
                    date_trunc('month', CURRENT_DATE)::date AS end_month
            ),
            month_series AS (
                SELECT generate_series(
                    (SELECT start_month FROM bounds),
                    (SELECT end_month FROM bounds),
                    interval '1 month'
                )::date AS month
            ),
            payment_rollup AS (
                SELECT date_trunc('month', p.paid_at)::date AS month, SUM(p.amount) AS collected
                FROM payments p
                CROSS JOIN bounds b
                WHERE p.tenant_id = ${tenantId}
                    AND p.status = 'COMPLETED'
                    AND p.paid_at >= b.start_month
                GROUP BY 1
            ),
            invoice_rollup AS (
                SELECT date_trunc('month', i.due_date)::date AS month, SUM(i.total_amount) AS expected
                FROM invoices i
                CROSS JOIN bounds b
                WHERE i.tenant_id = ${tenantId}
                    AND i.due_date >= b.start_month
                GROUP BY 1
            )
            SELECT
                ms.month,
                COALESCE(pr.collected, 0) AS collected,
                COALESCE(ir.expected, 0) AS expected
            FROM month_series ms
            LEFT JOIN payment_rollup pr ON pr.month = ms.month
            LEFT JOIN invoice_rollup ir ON ir.month = ms.month
            ORDER BY ms.month ASC
        `);
        return rows;
    },
    async getOutstandingSummary(tenantId: string) {
        const [s] = await db.execute(sql`
            SELECT
                COALESCE(SUM(total_amount), 0) AS "totalInvoiced",
                COALESCE(SUM(paid_amount), 0) AS "totalCollected",
                COALESCE(SUM(total_amount - paid_amount), 0) AS "totalOutstanding",
                COUNT(*) FILTER (WHERE status = 'OVERDUE') AS "overdueCount",
                COALESCE(SUM(total_amount - paid_amount) FILTER (WHERE status = 'OVERDUE'), 0) AS "overdueAmount"
            FROM invoices
            WHERE tenant_id = ${tenantId}
        `) as Array<{ totalInvoiced: number; totalCollected: number; totalOutstanding: number; overdueCount: number; overdueAmount: number }>;
        return { totalInvoiced: Number(s?.totalInvoiced||0), totalCollected: Number(s?.totalCollected||0), totalOutstanding: Number(s?.totalOutstanding||0), overdueCount: Number(s?.overdueCount||0), overdueAmount: Number(s?.overdueAmount||0), collectionRate: s?.totalInvoiced>0?Math.round(Number(s.totalCollected)/Number(s.totalInvoiced)*100):0 };
    },
    async getPaymentMethodBreakdown(tenantId: string) {
        const rows = await db.execute(sql`
            SELECT p.method, SUM(p.amount) AS total, COUNT(*) AS count
            FROM payments p
            WHERE p.tenant_id = ${tenantId}
                AND p.status = 'COMPLETED'
                AND p.paid_at >= date_trunc('month', CURRENT_DATE)
            GROUP BY p.method
            ORDER BY total DESC
        `);
        return rows;
    },
    async getGradeWiseCollection(tenantId: string) {
        const rows = await db.execute(sql`
            SELECT
                COALESCE(g.name, 'Unassigned') AS grade,
                COALESCE(SUM(i.total_amount), 0) AS expected,
                COALESCE(SUM(i.paid_amount), 0) AS collected,
                COALESCE(SUM(i.total_amount - i.paid_amount), 0) AS outstanding,
                COUNT(DISTINCT i.student_id) AS students
            FROM invoices i
            JOIN students s
                ON s.id = i.student_id
                AND s.tenant_id = i.tenant_id
            LEFT JOIN sections sec
                ON sec.id = s.section_id
                AND sec.tenant_id = s.tenant_id
            LEFT JOIN grades g
                ON g.id = sec.grade_id
                AND g.tenant_id = sec.tenant_id
            WHERE i.tenant_id = ${tenantId}
            GROUP BY g.name, g.display_order
            ORDER BY g.display_order NULLS LAST, g.name ASC
        `);
        return rows;
    },
};
