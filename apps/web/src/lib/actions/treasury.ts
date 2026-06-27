'use server';

import { pool } from '@/lib/db';
import { getSession } from '@/lib/auth/session';

/**
 * Fetch Treasury Aggregations (Payment Orchestration)
 */
export async function getTreasurySummaryAction() {
    const session = await getSession();
    if (!session.tenantId) throw new Error('Unauthorized');

    // Aggregate total revenue collected
    const { rows: collectedQuery } = await pool.query(`
        SELECT sum(amount) AS "totalCollected"
        FROM payments
        WHERE tenant_id = $1
    `, [session.tenantId]);

    // Aggregate total overdue
    const { rows: overdueQuery } = await pool.query(`
        SELECT sum(total_amount) AS "totalOverdue"
        FROM invoices
        WHERE status = $1
    `, ['OVERDUE']);

    // Aggregate total outstanding
    const { rows: outstandingQuery } = await pool.query(`
        SELECT sum(total_amount) AS "totalOutstanding"
        FROM invoices
        WHERE status = $1
    `, ['PENDING']);

    return {
        totalCollected: collectedQuery[0]?.totalCollected || 0,
        totalOverdue: overdueQuery[0]?.totalOverdue || 0,
        totalOutstanding: outstandingQuery[0]?.totalOutstanding || 0,
    };
}

export async function getPaymentsLedgerAction(limit = 50) {
    const session = await getSession();
    if (!session.tenantId) throw new Error('Unauthorized');

    const { rows: ledger } = await pool.query(`
        SELECT p.id, p.amount, p.method, p.status, p.paid_at AS "paidAt", p.transaction_id AS "transactionId", i.invoice_number AS "invoiceNumber"
        FROM payments p
        LEFT JOIN invoices i ON p.invoice_id = i.id
        WHERE p.tenant_id = $1
        ORDER BY p.paid_at DESC
        LIMIT $2
    `, [session.tenantId, limit]);

    return ledger;
}
