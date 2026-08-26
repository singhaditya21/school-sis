import { cache } from 'react';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

/**
 * Data access for the student portal.
 *
 * Scope resolution mirrors the parent portal: the parent portal joins
 * `guardians.user_id = <session user>` to reach a student, and the student
 * portal joins `students.user_id = <session user>` — the same FK shape on the
 * students table itself. Every query is tenant-scoped AND pinned to the single
 * student row that the signed-in user resolves to, so a student can never read
 * another student's record.
 *
 * `students.user_id` is nullable and nothing in the product writes it yet, so
 * `resolveStudentSelf()` returning null is an expected state, not an error. The
 * pages render an honest "account not linked" panel in that case rather than
 * inventing a student.
 */

export interface StudentSelf {
    id: string;
    fullName: string;
    admissionNumber: string;
    rollNumber: number | null;
    status: string;
    gradeId: string;
    gradeName: string;
    sectionId: string;
    sectionName: string;
}

interface StudentSelfRow {
    id: string;
    fullName: string;
    admissionNumber: string;
    rollNumber: number | null;
    status: string;
    gradeId: string;
    gradeName: string;
    sectionId: string;
    sectionName: string;
}

/**
 * Resolve the signed-in STUDENT user to their own student record.
 * Returns null when the user account has not been linked to a student row.
 *
 * The permission check runs per call site; the lookup itself is request-cached
 * so the layout and the page beneath it share one query.
 */
export async function resolveStudentSelf(permission: string): Promise<StudentSelf | null> {
    const { tenantId, userId } = await requireAuth(permission);
    return loadStudentSelf(tenantId, userId);
}

const loadStudentSelf = cache(async (tenantId: string, userId: string): Promise<StudentSelf | null> => {
    const { rows } = await pool.query<StudentSelfRow>(
        `SELECT s.id,
                s.first_name || ' ' || s.last_name AS "fullName",
                s.admission_number                 AS "admissionNumber",
                s.roll_number                      AS "rollNumber",
                s.status,
                s.grade_id                         AS "gradeId",
                g.name                             AS "gradeName",
                s.section_id                       AS "sectionId",
                sec.name                           AS "sectionName"
           FROM students s
           JOIN grades g     ON g.id = s.grade_id     AND g.tenant_id = s.tenant_id
           JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = s.tenant_id
          WHERE s.tenant_id = $1
            AND s.user_id = $2
          LIMIT 1`,
        [tenantId, userId],
    );

    return rows[0] ?? null;
});

/** The tenant the signed-in user belongs to, alongside their student record. */
async function requireScope(permission: string): Promise<{ tenantId: string; student: StudentSelf } | null> {
    const { tenantId } = await requireAuth(permission);
    const student = await resolveStudentSelf(permission);
    if (!student) return null;
    return { tenantId, student };
}

export interface StudentAttendanceDay {
    date: string;
    status: string;
    remarks: string | null;
}

export interface StudentAttendanceMonth {
    records: StudentAttendanceDay[];
    present: number;
    absent: number;
    late: number;
    excused: number;
    halfDay: number;
    /** Days with a mark that counts as a working day (everything except HOLIDAY). */
    marked: number;
}

interface AttendanceRow {
    date: Date | string;
    status: string;
    remarks: string | null;
}

/**
 * Format a pg value as YYYY-MM-DD using LOCAL date parts, never `toISOString()`.
 *
 * node-postgres parses a `date` column into a JS Date at local midnight. In any
 * timezone east of UTC, `toISOString().slice(0, 10)` then reports the previous
 * day: a homework due_date of 2026-07-19 came back as "2026-07-18" under
 * Asia/Kolkata. Reading the local parts recovers the stored date exactly.
 */
function toIsoDate(value: Date | string): string {
    if (!(value instanceof Date)) return String(value).slice(0, 10);
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Attendance for one calendar month, for the signed-in student only.
 * `month` is 1-12.
 */
export async function getMyAttendanceMonth(
    year: number,
    month: number,
): Promise<{ student: StudentSelf; attendance: StudentAttendanceMonth } | null> {
    const scope = await requireScope('attendance:read:own');
    if (!scope) return null;

    const { rows } = await pool.query<AttendanceRow>(
        `SELECT ar.date, ar.status, ar.remarks
           FROM attendance_records ar
          WHERE ar.tenant_id = $1
            AND ar.student_id = $2
            AND ar.date >= make_date($3::int, $4::int, 1)
            AND ar.date <  (make_date($3::int, $4::int, 1) + INTERVAL '1 month')
          ORDER BY ar.date`,
        [scope.tenantId, scope.student.id, year, month],
    );

    const records = rows.map((r) => ({
        date: toIsoDate(r.date),
        status: r.status,
        remarks: r.remarks,
    }));

    const count = (status: string) => records.filter((r) => r.status === status).length;

    return {
        student: scope.student,
        attendance: {
            records,
            present: count('PRESENT'),
            absent: count('ABSENT'),
            late: count('LATE'),
            excused: count('EXCUSED'),
            halfDay: count('HALF_DAY'),
            marked: records.filter((r) => r.status !== 'HOLIDAY').length,
        },
    };
}

export interface StudentResult {
    examId: string;
    examName: string;
    examType: string;
    examDate: string;
    subject: string;
    marksObtained: number | null;
    maxMarks: number;
    passingMarks: number;
    grade: string | null;
    remarks: string | null;
    isAbsent: boolean;
}

interface ResultRow {
    examId: string;
    examName: string;
    examType: string;
    examDate: Date | string;
    subject: string;
    marksObtained: string | null;
    maxMarks: string;
    passingMarks: string;
    grade: string | null;
    remarks: string | null;
    isAbsent: boolean;
}

/**
 * Published exam results for the signed-in student.
 *
 * Only exams whose lifecycle has reached PUBLISHED (or ARCHIVED afterwards) are
 * returned — marks still in DRAFT / MARKS_ENTRY / RESULT_REVIEW are not the
 * school's word yet and must not reach a student.
 *
 * `exam_schedules` carries no tenant_id of its own, so it is reached only
 * through `exams`, which does.
 */
export async function getMyResults(): Promise<{ student: StudentSelf; results: StudentResult[] } | null> {
    const scope = await requireScope('gradebook:read:own');
    if (!scope) return null;

    const { rows } = await pool.query<ResultRow>(
        `SELECT e.id            AS "examId",
                e.name          AS "examName",
                e.type::text    AS "examType",
                e.start_date    AS "examDate",
                sub.name        AS subject,
                sr.marks_obtained AS "marksObtained",
                es.max_marks      AS "maxMarks",
                es.passing_marks  AS "passingMarks",
                sr.grade,
                sr.remarks,
                sr.is_absent    AS "isAbsent"
           FROM student_results sr
           JOIN exam_schedules es ON es.id = sr.exam_schedule_id
           JOIN exams e           ON e.id = es.exam_id      AND e.tenant_id = sr.tenant_id
           JOIN subjects sub      ON sub.id = es.subject_id AND sub.tenant_id = sr.tenant_id
          WHERE sr.tenant_id = $1
            AND sr.student_id = $2
            AND e.status IN ('PUBLISHED', 'ARCHIVED')
          ORDER BY e.start_date DESC, sub.name`,
        [scope.tenantId, scope.student.id],
    );

    return {
        student: scope.student,
        results: rows.map((r) => ({
            examId: r.examId,
            examName: r.examName,
            examType: r.examType,
            examDate: toIsoDate(r.examDate),
            subject: r.subject,
            marksObtained: r.marksObtained === null ? null : Number(r.marksObtained),
            maxMarks: Number(r.maxMarks),
            passingMarks: Number(r.passingMarks),
            grade: r.grade,
            remarks: r.remarks,
            isAbsent: r.isAbsent,
        })),
    };
}

export interface StudentHomework {
    id: string;
    title: string;
    description: string | null;
    subject: string | null;
    dueDate: string;
    maxMarks: number | null;
    submittedAt: string | null;
    marks: number | null;
    feedback: string | null;
    gradedAt: string | null;
}

interface HomeworkRow {
    id: string;
    title: string;
    description: string | null;
    subject: string | null;
    dueDate: Date | string;
    maxMarks: number | null;
    submittedAt: Date | string | null;
    marks: number | null;
    feedback: string | null;
    gradedAt: Date | string | null;
}

/**
 * Homework assigned to the signed-in student, with their own submission (if any)
 * attached.
 *
 * `homework_assignments` targets a section, a whole grade (section_id NULL), or
 * the whole tenant (both NULL); all three are matched. The submission join is
 * pinned to this student, so another child's marks or feedback can never appear.
 */
export async function getMyHomework(): Promise<{ student: StudentSelf; homework: StudentHomework[] } | null> {
    const scope = await requireScope('homework:read:own');
    if (!scope) return null;

    const { rows } = await pool.query<HomeworkRow>(
        `SELECT ha.id,
                ha.title,
                ha.description,
                sub.name      AS subject,
                ha.due_date   AS "dueDate",
                ha.max_marks  AS "maxMarks",
                hs.submitted_at AS "submittedAt",
                hs.marks,
                hs.feedback,
                hs.graded_at  AS "gradedAt"
           FROM homework_assignments ha
           LEFT JOIN subjects sub ON sub.id = ha.subject_id AND sub.tenant_id = ha.tenant_id
           LEFT JOIN homework_submissions hs
                  ON hs.assignment_id = ha.id
                 AND hs.tenant_id = ha.tenant_id
                 AND hs.student_id = $2
          WHERE ha.tenant_id = $1
            AND (
                  ha.section_id = $3
               OR (ha.section_id IS NULL AND ha.grade_id = $4)
               OR (ha.section_id IS NULL AND ha.grade_id IS NULL)
            )
          ORDER BY ha.due_date DESC
          LIMIT 100`,
        [scope.tenantId, scope.student.id, scope.student.sectionId, scope.student.gradeId],
    );

    return {
        student: scope.student,
        homework: rows.map((r) => ({
            id: r.id,
            title: r.title,
            description: r.description,
            subject: r.subject,
            dueDate: toIsoDate(r.dueDate),
            maxMarks: r.maxMarks === null ? null : Number(r.maxMarks),
            submittedAt: r.submittedAt === null ? null : toIsoDate(r.submittedAt),
            marks: r.marks === null ? null : Number(r.marks),
            feedback: r.feedback,
            gradedAt: r.gradedAt === null ? null : toIsoDate(r.gradedAt),
        })),
    };
}

export interface StudentOverview {
    student: StudentSelf;
    /** Attendance across the whole record, not just the current month. */
    attendanceToDate: { present: number; marked: number; rate: number | null };
    publishedResultCount: number;
    homeworkDueSoon: number;
    homeworkOverdueUnsubmitted: number;
}

interface OverviewRow {
    present: number;
    marked: number;
}

export async function getMyOverview(): Promise<StudentOverview | null> {
    const scope = await requireScope('dashboard:read:own');
    if (!scope) return null;

    const { rows: attendanceRows } = await pool.query<OverviewRow>(
        `SELECT COUNT(*) FILTER (WHERE ar.status IN ('PRESENT', 'LATE', 'HALF_DAY'))::int AS present,
                COUNT(*) FILTER (WHERE ar.status <> 'HOLIDAY')::int                        AS marked
           FROM attendance_records ar
          WHERE ar.tenant_id = $1
            AND ar.student_id = $2`,
        [scope.tenantId, scope.student.id],
    );

    const { rows: resultRows } = await pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
           FROM student_results sr
           JOIN exam_schedules es ON es.id = sr.exam_schedule_id
           JOIN exams e           ON e.id = es.exam_id AND e.tenant_id = sr.tenant_id
          WHERE sr.tenant_id = $1
            AND sr.student_id = $2
            AND e.status IN ('PUBLISHED', 'ARCHIVED')`,
        [scope.tenantId, scope.student.id],
    );

    const { rows: homeworkRows } = await pool.query<{ dueSoon: number; overdue: number }>(
        `SELECT COUNT(*) FILTER (
                    WHERE ha.due_date >= CURRENT_DATE
                      AND ha.due_date <= CURRENT_DATE + 7
                      AND hs.id IS NULL
                )::int AS "dueSoon",
                COUNT(*) FILTER (
                    WHERE ha.due_date < CURRENT_DATE
                      AND hs.id IS NULL
                )::int AS overdue
           FROM homework_assignments ha
           LEFT JOIN homework_submissions hs
                  ON hs.assignment_id = ha.id
                 AND hs.tenant_id = ha.tenant_id
                 AND hs.student_id = $2
          WHERE ha.tenant_id = $1
            AND (
                  ha.section_id = $3
               OR (ha.section_id IS NULL AND ha.grade_id = $4)
               OR (ha.section_id IS NULL AND ha.grade_id IS NULL)
            )`,
        [scope.tenantId, scope.student.id, scope.student.sectionId, scope.student.gradeId],
    );

    const present = attendanceRows[0]?.present ?? 0;
    const marked = attendanceRows[0]?.marked ?? 0;

    return {
        student: scope.student,
        attendanceToDate: {
            present,
            marked,
            rate: marked > 0 ? Math.round((present / marked) * 100) : null,
        },
        publishedResultCount: resultRows[0]?.count ?? 0,
        homeworkDueSoon: homeworkRows[0]?.dueSoon ?? 0,
        homeworkOverdueUnsubmitted: homeworkRows[0]?.overdue ?? 0,
    };
}
