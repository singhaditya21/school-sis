'use server';

/**
 * Cashflow Forecast — Monthly projections based on outstanding invoices
 * and historical collection patterns.
 */

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

// ─── Types ───────────────────────────────────────────────────

export interface CashflowMonth {
    month: string;          // 'YYYY-MM'
    label: string;          // 'Mar 26'
    expectedInflow: number; // sum of invoice amounts due this month
    projectedCollection: number; // estimated based on historical collection rate
    invoiceCount: number;
}

export interface CashflowForecast {
    months: CashflowMonth[];
    historicalCollectionRate: number; // percentage
    totalExpected: number;
    totalProjected: number;
}

// ─── Get Cashflow Forecast ───────────────────────────────────

export async function getCashflowForecast(forwardMonths: number = 6): Promise<CashflowForecast> {
    const { tenantId } = await requireAuth('fees:read');

    // 1. Calculate historical collection rate (last 12 months)
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const twelveMonthsAgoStr = twelveMonthsAgo.toISOString().split('T')[0];

    const historicalQuery = `
        SELECT 
            SUM(total_amount) AS "totalBilled",
            SUM(paid_amount) AS "totalPaid"
        FROM invoices
        WHERE tenant_id = $1
          AND status != 'CANCELLED'
          AND created_at >= $2
    `;
    const historicalResult = await pool.query(historicalQuery, [tenantId, twelveMonthsAgoStr]);
    const historicalStats = historicalResult.rows[0];

    const totalBilled = Number(historicalStats?.totalBilled || 0);
    const totalPaid = Number(historicalStats?.totalPaid || 0);
    const historicalCollectionRate = totalBilled > 0
        ? Math.round((totalPaid / totalBilled) * 100)
        : 75; // default assumption if no history

    // 2. Get invoices grouped by due month for the forecast period
    const months: CashflowMonth[] = [];
    let totalExpected = 0;
    let totalProjected = 0;

    for (let i = 0; i < forwardMonths; i++) {
        const monthDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
        const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
        const monthLabel = monthDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

        const monthStart = monthDate.toISOString().split('T')[0];
        const monthEnd = nextMonthDate.toISOString().split('T')[0];

        // Get invoices due in this month (unpaid/partially paid)
        const monthQuery = `
            SELECT 
                COALESCE(SUM(CAST(total_amount AS numeric) - CAST(paid_amount AS numeric)), 0) AS "totalDue",
                COUNT(*) AS "invoiceCount"
            FROM invoices
            WHERE tenant_id = $1
              AND status != 'PAID'
              AND status != 'CANCELLED'
              AND status != 'WAIVED'
              AND due_date >= $2
              AND due_date <= $3
        `;
        const monthResult = await pool.query(monthQuery, [tenantId, monthStart, monthEnd]);
        const monthStats = monthResult.rows[0];

        const expected = Number(monthStats?.totalDue || 0);
        const projected = Math.round(expected * (historicalCollectionRate / 100));

        months.push({
            month: monthKey,
            label: monthLabel,
            expectedInflow: expected,
            projectedCollection: projected,
            invoiceCount: Number(monthStats?.invoiceCount || 0),
        });

        totalExpected += expected;
        totalProjected += projected;
    }

    return {
        months,
        historicalCollectionRate,
        totalExpected,
        totalProjected,
    };
}
