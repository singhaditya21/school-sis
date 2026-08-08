import { NextResponse } from 'next/server';
import { pool, runWithTenantContext } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth/api';
import { logger, requestContextFrom } from '@/lib/observability/logger';
import { renderReportCardPdf, type ReportCardSubject } from '@/lib/pdf/native';
import { isValidTenantId } from '@/lib/tenant/isolation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TENANT_WIDE_REPORT_ROLES = new Set([
  'PLATFORM_ADMIN',
  'SUPER_ADMIN',
  'SCHOOL_ADMIN',
  'PRINCIPAL',
  'REGISTRAR',
  'STUDENT_SUCCESS_COUNSELOR',
]);

type StudentRow = {
  schoolName: string;
  studentName: string;
  admissionNumber: string;
  gradeName: string;
  sectionName: string;
};

type ResultRow = ReportCardSubject & {
  examId: string;
  examName: string;
  academicYear: string;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ studentId: string; termId: string }> },
) {
  const { studentId, termId } = await params;
  const auth = await requireApiAuth();
  if (auth.ok === false) return auth.response;
  if (!isValidTenantId(studentId) || (termId !== 'current' && !isValidTenantId(termId))) {
    return NextResponse.json({ error: 'Invalid report-card identifier.' }, { status: 400 });
  }

  try {
    const report = await runWithTenantContext(auth.context.tenantId, async () => {
      const studentResult = await pool.query<StudentRow>(
        `SELECT t.name AS "schoolName",
                CONCAT_WS(' ', s.first_name, s.last_name) AS "studentName",
                s.admission_number AS "admissionNumber",
                g.name AS "gradeName",
                sec.name AS "sectionName"
         FROM students s
         JOIN tenants t ON t.id = s.tenant_id
         JOIN grades g ON g.id = s.grade_id AND g.tenant_id = s.tenant_id
         JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = s.tenant_id
         WHERE s.tenant_id = $1
           AND s.id = $2
           AND (
             $3::boolean
             OR (
               $5::boolean
               AND (
                 sec.class_teacher_id = $4
                 OR EXISTS (
                   SELECT 1
                   FROM timetable_entries entry
                   WHERE entry.tenant_id = s.tenant_id
                     AND entry.section_id = s.section_id
                     AND entry.teacher_id = $4
                 )
               )
             )
             OR s.user_id = $4
             OR EXISTS (
               SELECT 1 FROM guardians guardian
               WHERE guardian.tenant_id = s.tenant_id
                 AND guardian.student_id = s.id
                 AND guardian.user_id = $4
             )
           )
         LIMIT 1`,
        [
          auth.context.tenantId,
          studentId,
          TENANT_WIDE_REPORT_ROLES.has(auth.context.role),
          auth.context.userId,
          auth.context.role === 'TEACHER',
        ],
      );
      const student = studentResult.rows[0];
      if (!student) return null;

      const { rows } = await pool.query<ResultRow>(
        `WITH requested_term AS (
           SELECT term.academic_year_id, term.start_date, term.end_date
           FROM terms term
           WHERE term.tenant_id = $1
             AND term.id::text = $3
         ),
         selected_exam AS (
           SELECT e.id, e.name, ay.name AS academic_year
           FROM exams e
           JOIN academic_years ay ON ay.id = e.academic_year_id AND ay.tenant_id = e.tenant_id
           WHERE e.tenant_id = $1
             AND e.status = 'PUBLISHED'
             AND (
               $3 = 'current'
               OR EXISTS (
                 SELECT 1
                 FROM requested_term term
                 WHERE term.academic_year_id = e.academic_year_id
                   AND e.start_date >= term.start_date
                   AND e.end_date <= term.end_date
               )
             )
             AND EXISTS (
               SELECT 1
               FROM exam_schedules schedule
               JOIN student_results result
                 ON result.exam_schedule_id = schedule.id
                AND result.tenant_id = e.tenant_id
               WHERE schedule.exam_id = e.id AND result.student_id = $2
             )
           ORDER BY e.end_date DESC, e.created_at DESC
           LIMIT 1
         )
         SELECT selected_exam.id AS "examId",
                selected_exam.name AS "examName",
                selected_exam.academic_year AS "academicYear",
                subject.name AS subject,
                result.marks_obtained AS "marksObtained",
                schedule.max_marks AS "maxMarks",
                result.grade,
                result.is_absent AS absent
         FROM selected_exam
         JOIN exam_schedules schedule ON schedule.exam_id = selected_exam.id
         JOIN subjects subject ON subject.id = schedule.subject_id AND subject.tenant_id = $1
         JOIN student_results result
           ON result.exam_schedule_id = schedule.id
          AND result.student_id = $2
          AND result.tenant_id = $1
         ORDER BY subject.name ASC`,
        [auth.context.tenantId, studentId, termId],
      );
      if (rows.length === 0) return null;
      return { student, results: rows };
    });

    if (!report) {
      return NextResponse.json({ error: 'Published report card not found.' }, { status: 404 });
    }

    const first = report.results[0];
    const pdf = renderReportCardPdf({
      ...report.student,
      examName: first.examName,
      academicYear: first.academicYear,
      subjects: report.results.map(({ subject, marksObtained, maxMarks, grade, absent }) => ({
        subject,
        marksObtained,
        maxMarks,
        grade,
        absent,
      })),
    });
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="report-card-${studentId}.pdf"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    logger.error('report_card.pdf_generation_failed', 'Native report-card PDF generation failed', {
      ...requestContextFrom(request),
      tenantId: auth.context.tenantId,
      actorUserId: auth.context.userId,
      entityType: 'student',
      entityId: studentId,
      metadata: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json({ error: 'Failed to generate report-card PDF.' }, { status: 500 });
  }
}
