'use server';

import { pool } from '@/lib/db';
import { requireCapability } from '@/lib/capabilities/server';

/**
 * Fetch Treasury Aggregations (Payment Orchestration)
 */
export async function getTreasurySummaryAction() {
    const { tenantId } = await requireCapability('payments', 'treasury:read');

    // Aggregate total revenue collected
    const { rows: collectedQuery } = await pool.query(`
        SELECT sum(amount) AS "totalCollected"
        FROM payments
        WHERE tenant_id = $1
    `, [tenantId]);

    // Aggregate total overdue
    const { rows: overdueQuery } = await pool.query(`
        SELECT sum(total_amount) AS "totalOverdue"
        FROM invoices
        WHERE status = $1 AND tenant_id = $2
    `, ['OVERDUE', tenantId]);

    // Aggregate total outstanding
    const { rows: outstandingQuery } = await pool.query(`
        SELECT sum(total_amount) AS "totalOutstanding"
        FROM invoices
        WHERE status = $1 AND tenant_id = $2
    `, ['PENDING', tenantId]);

    return {
        totalCollected: collectedQuery[0]?.totalCollected || '0.00',
        totalOverdue: overdueQuery[0]?.totalOverdue || '0.00',
        totalOutstanding: outstandingQuery[0]?.totalOutstanding || '0.00',
    };
}

export async function getPaymentsLedgerAction(limit = 50) {
    const { tenantId } = await requireCapability('payments', 'payments:read');
    const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 50;

    const { rows: ledger } = await pool.query(`
        SELECT p.id, p.amount, p.method, p.status, p.paid_at AS "paidAt", p.transaction_id AS "transactionId", i.invoice_number AS "invoiceNumber"
        FROM payments p
        LEFT JOIN invoices i ON p.invoice_id = i.id
        WHERE p.tenant_id = $1
        ORDER BY p.paid_at DESC
        LIMIT $2
    `, [tenantId, safeLimit]);

    return ledger;
}

export async function getTreasuryExceptionsAction() {
    const { tenantId } = await requireCapability('payments', 'treasury:read');

    const { rows: exceptions } = await pool.query(`
        SELECT p.id, p.amount, p.method, p.status, p.paid_at AS "paidAt", p.transaction_id AS "transactionId",
               s.first_name || ' ' || s.last_name AS "studentName", s.admission_number AS "admissionNumber"
        FROM payments p
        JOIN invoices i ON i.id = p.invoice_id
        JOIN students s ON s.id = i.student_id
        WHERE p.tenant_id = $1 AND (s.admission_number IS NULL OR s.admission_number = '')
        ORDER BY p.paid_at DESC
        LIMIT 10
    `, [tenantId]);

    return exceptions;
}
