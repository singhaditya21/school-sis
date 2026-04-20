'use server';

import { db } from '@/lib/db';
import { coachingBatches, testSeries, testSeriesResults } from '@/lib/db/schema/coaching';
import { getSession } from '@/lib/auth/session';
import { eq, and, desc, sql } from 'drizzle-orm';

/**
 * Fetch all active batches for the current coaching institute.
 */
export async function getActiveBatchesAction() {
    const session = await getSession();
    if (!session.tenantId) throw new Error('Unauthorized');

    const batches = await db
        .select()
        .from(coachingBatches)
        .where(
            and(
                eq(coachingBatches.tenantId, session.tenantId),
                eq(coachingBatches.isActive, true)
            )
        )
        .orderBy(desc(coachingBatches.createdAt));

    return batches;
}

/**
 * Super lightweight analytics summary for the coaching dashboard
 * We simulate maxStudents and enrollments for the prototype UI
 */
export async function getCoachingDashboardSummaryAction() {
    const session = await getSession();
    if (!session.tenantId) throw new Error('Unauthorized');

    const activeBatchesCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(coachingBatches)
        .where(
            and(
                eq(coachingBatches.tenantId, session.tenantId),
                eq(coachingBatches.isActive, true)
            )
        );

    const upcomingTestsCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(testSeries)
        .where(
            and(
                eq(testSeries.tenantId, session.tenantId),
                sql`${testSeries.scheduledAt} > current_date`
            )
        );

    return {
        activeBatches: activeBatchesCount[0]?.count || 0,
        upcomingTests: upcomingTestsCount[0]?.count || 0,
        liveDoubts: 14, // Mocked pending NLP insights integration
    };
}
