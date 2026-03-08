'use server';

/**
 * Cashflow Forecast — Monthly projections based on outstanding invoices
 * and historical collection patterns.
 */

import { db } from '@/lib/db';
import { invoices, payments } from '@/lib/db/schema';
import { eq, and, sum, count, ne, gte, lte, sql } from 'drizzle-orm';
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

    const [historicalStats] = await db
        .select({
            totalBilled: sum(invoices.totalAmount),
            totalPaid: sum(invoices.paidAmount),
        })
        .from(invoices)
        .where(and(
            eq(invoices.tenantId, tenantId),
            ne(invoices.status, 'CANCELLED'),
            gte(invoices.createdAt, new Date(twelveMonthsAgoStr)),
        ));

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
        const [monthStats] = await db
            .select({
                totalDue: sql<string>`COALESCE(SUM(CAST(${invoices.totalAmount} AS numeric) - CAST(${invoices.paidAmount} AS numeric)), 0)`,
                invoiceCount: count(),
            })
            .from(invoices)
            .where(and(
                eq(invoices.tenantId, tenantId),
                ne(invoices.status, 'PAID'),
                ne(invoices.status, 'CANCELLED'),
                ne(invoices.status, 'WAIVED'),
                gte(invoices.dueDate, monthStart),
                lte(invoices.dueDate, monthEnd),
            ));

        const expected = Number(monthStats?.totalDue || 0);
        const projected = Math.round(expected * (historicalCollectionRate / 100));

        months.push({
            month: monthKey,
            label: monthLabel,
            expectedInflow: expected,
            projectedCollection: projected,
            invoiceCount: monthStats?.invoiceCount || 0,
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
