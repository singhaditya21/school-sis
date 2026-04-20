'use server';

import { db } from '@/lib/db';
import { invoices, payments } from '@/lib/db/schema/fees';
import { getSession } from '@/lib/auth/session';
import { eq, sql, sum } from 'drizzle-orm';

/**
 * Fetch Treasury Aggregations (Payment Orchestration)
 */
export async function getTreasurySummaryAction() {
    const session = await getSession();
    if (!session.tenantId) throw new Error('Unauthorized');

    // Aggregate total revenue collected
    const collectedQuery = await db
        .select({
            totalCollected: sum(payments.amount),
        })
        .from(payments)
        .where(
            eq(payments.tenantId, session.tenantId)
        );

    // Aggregate total overdue
    const overdueQuery = await db
        .select({
            totalOverdue: sum(invoices.totalAmount),
        })
        .from(invoices)
        .where(
            eq(invoices.status, 'OVERDUE')
        );

    // Aggregate total outstanding
    const outstandingQuery = await db
        .select({
            totalOutstanding: sum(invoices.totalAmount),
        })
        .from(invoices)
        .where(
            eq(invoices.status, 'PENDING')
        );

    return {
        totalCollected: collectedQuery[0]?.totalCollected || 0,
        totalOverdue: overdueQuery[0]?.totalOverdue || 0,
        totalOutstanding: outstandingQuery[0]?.totalOutstanding || 0,
    };
}
