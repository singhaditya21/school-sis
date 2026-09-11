"use server";

import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth/guards";
import { UserRole } from "@/lib/rbac/permissions";

const COACHING_ROLES = [
  UserRole.PLATFORM_ADMIN,
  UserRole.SUPER_ADMIN,
  UserRole.GROUP_EXECUTIVE,
  UserRole.SCHOOL_ADMIN,
  UserRole.PRINCIPAL,
  UserRole.REGISTRAR,
  UserRole.STUDENT_SUCCESS_COUNSELOR,
  UserRole.TEACHER,
] as const;

export type CoachingBatchSummary = {
  id: string;
  name: string;
  targetExam: string;
  startDate: string | Date;
  endDate: string | Date;
  participantCount: number;
  averageScorePercent: number | null;
  nextTestAt: string | Date | null;
};

export async function getActiveBatchesAction(): Promise<
  CoachingBatchSummary[]
> {
  const { tenantId } = await requireRole(...COACHING_ROLES);
  const rows = await sql<CoachingBatchSummary>`
    SELECT
            cb.id,
            cb.name,
            cb.target_exam AS "targetExam",
            cb.start_date AS "startDate",
            cb.end_date AS "endDate",
            COUNT(DISTINCT tsr.student_id)::int AS "participantCount",
            ROUND(AVG((tsr.marks_obtained::numeric / NULLIF(ts.total_marks, 0)) * 100), 1)::float8 AS "averageScorePercent",
            MIN(ts.scheduled_at) FILTER (WHERE ts.scheduled_at > NOW()) AS "nextTestAt"
         FROM coaching_batches cb
         LEFT JOIN test_series ts
           ON ts.batch_id = cb.id
          AND ts.tenant_id = cb.tenant_id
         LEFT JOIN test_series_results tsr
           ON tsr.test_id = ts.id
          AND tsr.tenant_id = cb.tenant_id
         WHERE cb.tenant_id = ${tenantId}
           AND cb.is_active = true
         GROUP BY cb.id, cb.name, cb.target_exam, cb.start_date, cb.end_date, cb.created_at
         ORDER BY cb.created_at DESC
  `;
  return rows;
}

export type CoachingDashboardSummary = {
  activeBatches: number;
  upcomingTests: number;
  assessedStudents: number;
  averageScorePercent: number | null;
};

export async function getCoachingDashboardSummaryAction(): Promise<CoachingDashboardSummary> {
  const { tenantId } = await requireRole(...COACHING_ROLES);
  const rows = await sql<{
    activeBatches: number;
    upcomingTests: number;
    assessedStudents: number;
    averageScorePercent: number | null;
  }>`
    SELECT
            (SELECT COUNT(*)::int FROM coaching_batches WHERE tenant_id = ${tenantId} AND is_active = true) AS "activeBatches",
            (SELECT COUNT(*)::int FROM test_series WHERE tenant_id = ${tenantId} AND scheduled_at > NOW()) AS "upcomingTests",
            (SELECT COUNT(DISTINCT student_id)::int FROM test_series_results WHERE tenant_id = ${tenantId}) AS "assessedStudents",
            (SELECT ROUND(AVG((tsr.marks_obtained::numeric / NULLIF(ts.total_marks, 0)) * 100), 1)::float8
               FROM test_series_results tsr
               JOIN test_series ts ON ts.id = tsr.test_id AND ts.tenant_id = tsr.tenant_id
              WHERE tsr.tenant_id = ${tenantId}) AS "averageScorePercent"
  `;

  return (
    rows[0] || {
      activeBatches: 0,
      upcomingTests: 0,
      assessedStudents: 0,
      averageScorePercent: null,
    }
  );
}

export async function getTestSeriesAction() {
  const { tenantId } = await requireRole(...COACHING_ROLES);
  const rows = await sql`
    SELECT
            ts.id,
            ts.test_name AS "testName",
            ts.total_marks AS "totalMarks",
            ts.scheduled_at AS "scheduledAt",
            cb.name AS "batchName",
            COUNT(tsr.id)::int AS "resultCount",
            ROUND(AVG((tsr.marks_obtained::numeric / NULLIF(ts.total_marks, 0)) * 100), 1)::float8 AS "averageScorePercent"
         FROM test_series ts
         JOIN coaching_batches cb
           ON cb.id = ts.batch_id
          AND cb.tenant_id = ts.tenant_id
         LEFT JOIN test_series_results tsr
           ON tsr.test_id = ts.id
          AND tsr.tenant_id = ts.tenant_id
         WHERE ts.tenant_id = ${tenantId}
         GROUP BY ts.id, ts.test_name, ts.total_marks, ts.scheduled_at, cb.name
         ORDER BY ts.scheduled_at DESC
  `;
  return rows;
}
