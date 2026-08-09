'use server';

import { pool } from '@/lib/db';
import { requireCapability } from '@/lib/capabilities/server';

/**
 * Fetch all active batches for the current coaching institute.
 */
export async function getActiveBatchesAction() {
    const { tenantId } = await requireCapability('coaching', 'quiz:read');

    const { rows } = await pool.query(`
        SELECT
            id, tenant_id AS "tenantId", name, target_exam AS "targetExam",
            start_date AS "startDate", end_date AS "endDate",
            is_active AS "isActive", created_at AS "createdAt"
        FROM coaching_batches
        WHERE tenant_id = $1 AND is_active = true
        ORDER BY created_at DESC
    `, [tenantId]);

    return rows;
}

/**
 * Database-backed summary for the coaching dashboard.
 */
export async function getCoachingDashboardSummaryAction() {
    const { tenantId } = await requireCapability('coaching', 'quiz:read');

    const activeBatchesRes = await pool.query(`
        SELECT count(*)
        FROM coaching_batches
        WHERE tenant_id = $1 AND is_active = true
    `, [tenantId]);

    const upcomingTestsRes = await pool.query(`
        SELECT count(*)
        FROM test_series
        WHERE tenant_id = $1 AND scheduled_at > CURRENT_DATE
    `, [tenantId]);

    return {
        activeBatches: parseInt(activeBatchesRes.rows[0].count, 10) || 0,
        upcomingTests: parseInt(upcomingTestsRes.rows[0].count, 10) || 0,
    };
}

/**
 * Fetch test series with their batch mappings
 */
export async function getTestSeriesAction() {
    const { tenantId } = await requireCapability('coaching', 'quiz:read');

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
    `, [tenantId]);
    return testsRes.rows;
}
