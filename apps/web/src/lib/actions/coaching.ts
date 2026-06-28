'use server';

import { pool } from '@/lib/db';
import { getSession } from '@/lib/auth/session';

/**
 * Fetch all active batches for the current coaching institute.
 */
export async function getActiveBatchesAction() {
    const session = await getSession();
    if (!session.tenantId) throw new Error('Unauthorized');

    const { rows } = await pool.query(`
        SELECT 
            id, tenant_id as "tenantId", name, course_id as "courseId", 
            start_date as "startDate", end_date as "endDate", 
            capacity, is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt"
        FROM coaching_batches
        WHERE tenant_id = $1 AND is_active = true
        ORDER BY created_at DESC
    `, [session.tenantId]);

    return rows;
}

/**
 * Super lightweight analytics summary for the coaching dashboard
 * We simulate maxStudents and enrollments for the prototype UI
 */
export async function getCoachingDashboardSummaryAction() {
    const session = await getSession();
    if (!session.tenantId) throw new Error('Unauthorized');

    const activeBatchesRes = await pool.query(`
        SELECT count(*)
        FROM coaching_batches
        WHERE tenant_id = $1 AND is_active = true
    `, [session.tenantId]);

    const upcomingTestsRes = await pool.query(`
        SELECT count(*)
        FROM test_series
        WHERE tenant_id = $1 AND scheduled_at > CURRENT_DATE
    `, [session.tenantId]);

    return {
        activeBatches: parseInt(activeBatchesRes.rows[0].count, 10) || 0,
        upcomingTests: parseInt(upcomingTestsRes.rows[0].count, 10) || 0,
        liveDoubts: 14, // Mocked pending NLP insights integration
    };
}

/**
 * Fetch test series with their batch mappings
 */
export async function getTestSeriesAction() {
    const session = await getSession();
    if (!session.tenantId) throw new Error('Unauthorized');

    const testsRes = await pool.query(`
        SELECT 
            ts.id, 
            ts.test_name AS "testName", 
            ts.total_marks AS "totalMarks", 
            ts.scheduled_at AS "scheduledAt", 
            cb.name AS "batchName"
        FROM test_series ts
        LEFT JOIN coaching_batches cb ON ts.batch_id = cb.id
        WHERE ts.tenant_id = $1
        ORDER BY ts.scheduled_at DESC
    `, [session.tenantId]);
    return testsRes.rows;
}

