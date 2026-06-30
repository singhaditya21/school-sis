'use server';

import { pool } from '@/lib/db';

export interface ExecutiveFinancialMetrics {
  totalExpectedFees: number;
  totalCollectedFees: number;
  collectionDeficit: number;
  defaulterCount: number;
  thirtyDayRevenueForecast: number;
}

/**
 * Retrieves the high-level financial metrics for the Principal's "God-Mode" Dashboard.
 * Utilizes raw, highly-optimized parameterized SQL to aggregate tens of thousands of rows instantly.
 */
export async function getExecutiveFinancialMetrics(tenantId: string): Promise<ExecutiveFinancialMetrics> {
  // We use parallelized raw SQL execution to prevent database blocking on massive tables.
  const [feesRes, defaultersRes] = await Promise.all([
    pool.query(
      `SELECT 
         COALESCE(SUM(amount), 0) as expected,
         COALESCE(SUM(amount_paid), 0) as collected
       FROM invoices
       WHERE tenant_id = $1 AND status != 'CANCELLED'`,
      [tenantId]
    ),
    pool.query(
      `SELECT COUNT(DISTINCT student_id) as count
       FROM invoices
       WHERE tenant_id = $1 AND status = 'OVERDUE' AND due_date < CURRENT_DATE`,
      [tenantId]
    )
  ]);

  const expected = parseFloat(feesRes.rows[0].expected);
  const collected = parseFloat(feesRes.rows[0].collected);
  const deficit = expected - collected;
  const defaulterCount = parseInt(defaultersRes.rows[0].count, 10);

  // Simple heuristic: Predict we collect 80% of the remaining deficit in the next 30 days
  const thirtyDayRevenueForecast = deficit * 0.8;

  return {
    totalExpectedFees: expected,
    totalCollectedFees: collected,
    collectionDeficit: deficit,
    defaulterCount,
    thirtyDayRevenueForecast
  };
}
