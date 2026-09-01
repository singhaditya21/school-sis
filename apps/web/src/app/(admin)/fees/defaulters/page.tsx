import { getDefaulterStats, getFeeAgeingBreakdown, getDefaulterList } from '@/lib/actions/fees';
import DefaulterDashboard from '@/components/fees/defaulter-dashboard';
import { requireAuth } from '@/lib/auth/middleware';
import { pool } from '@/lib/db';
import Link from 'next/link';

/**
 * For each defaulting student, the single invoice a clerk should open to take
 * money at the counter: the oldest still-payable overdue invoice.
 *
 * The predicate mirrors getDefaulterList() exactly — overdue is derived from
 * due_date, NOT from status = 'OVERDUE' (no row in this schema is ever written
 * with that status), so filtering the invoice list by status would show nothing.
 */
async function getOldestOverdueInvoiceByStudent(
    tenantId: string,
): Promise<Record<string, string>> {
    const todayStr = new Date().toISOString().split('T')[0];

    const { rows } = await pool.query(
        `
        SELECT DISTINCT ON (i.student_id)
            i.student_id AS "studentId",
            i.id AS "invoiceId"
        FROM invoices i
        WHERE i.tenant_id = $1
          AND i.due_date < $2
          AND i.status NOT IN ('PAID', 'CANCELLED', 'WAIVED')
        ORDER BY i.student_id, i.due_date ASC, i.created_at ASC
        `,
        [tenantId, todayStr],
    );

    const map: Record<string, string> = {};
    for (const row of rows) {
        map[row.studentId] = row.invoiceId;
    }
    return map;
}

export default async function DefaultersPage() {
    const { tenantId } = await requireAuth('fees:read');

    const [stats, ageing, defaulters, payableInvoiceIds] = await Promise.all([
        getDefaulterStats(),
        getFeeAgeingBreakdown(),
        getDefaulterList({ sortBy: 'amount', limit: 100 }),
        getOldestOverdueInvoiceByStudent(tenantId),
    ]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div />
                <Link href="/fees" className="text-primary hover:underline text-sm">
                    ← Back to Fees
                </Link>
            </div>
            <DefaulterDashboard
                initialStats={stats}
                initialAgeing={ageing}
                initialDefaulters={defaulters}
                payableInvoiceIds={payableInvoiceIds}
            />
        </div>
    );
}
