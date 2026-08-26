'use server';

import { pool } from '@/lib/db';

export interface ExecutiveFinancialMetrics {
  /** Rupees. Sum of billed invoices that are still expected to be collected. */
  totalExpectedFees: number;
  /** Rupees. Sum already received against those invoices. */
  totalCollectedFees: number;
  /** Rupees. Expected minus collected. */
  collectionDeficit: number;
  /** Rupees. Outstanding balance whose due date has already passed. */
  overdueBalance: number;
  /** Distinct students carrying a past-due balance. */
  defaulterCount: number;
}

/**
 * High-level fee position for the executive dashboard.
 *
 * Amounts are numeric(12,2) rupees in the database — NOT minor units — and are
 * returned in rupees. Do not divide by 100 at the call site.
 *
 * Overdue is derived from due_date and the outstanding balance rather than from
 * `status = 'OVERDUE'`, because nothing continuously re-stamps that status; a
 * status-based count silently under-reports whenever the job runner is behind.
 */
export async function getExecutiveFinancialMetrics(tenantId: string): Promise<ExecutiveFinancialMetrics> {
  const [totals, overdue] = await Promise.all([
    pool.query(
      `SELECT
         COALESCE(SUM(total_amount), 0) AS expected,
         COALESCE(SUM(paid_amount), 0)  AS collected
       FROM invoices
       WHERE tenant_id = $1
         AND status NOT IN ('CANCELLED', 'WAIVED', 'DRAFT')`,
      [tenantId],
    ),
    pool.query(
      `SELECT
         COALESCE(SUM(total_amount - paid_amount), 0) AS overdue_balance,
         COUNT(DISTINCT student_id)                   AS defaulter_count
       FROM invoices
       WHERE tenant_id = $1
         AND status NOT IN ('CANCELLED', 'WAIVED', 'DRAFT')
         AND due_date < CURRENT_DATE
         AND total_amount > paid_amount`,
      [tenantId],
    ),
  ]);

  const expected = Number(totals.rows[0].expected);
  const collected = Number(totals.rows[0].collected);

  return {
    totalExpectedFees: expected,
    totalCollectedFees: collected,
    collectionDeficit: expected - collected,
    overdueBalance: Number(overdue.rows[0].overdue_balance),
    defaulterCount: Number(overdue.rows[0].defaulter_count),
  };
}
