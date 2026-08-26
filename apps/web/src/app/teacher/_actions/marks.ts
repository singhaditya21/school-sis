'use server';

import { randomUUID } from 'crypto';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { revalidatePath } from 'next/cache';

/**
 * Marks entry for the teacher's own classes.
 *
 * `exam_schedules` has no tenant_id of its own — it is scoped through
 * exams.tenant_id, so every query here joins back to `exams`.
 *
 * A schedule is (grade, subject). A teacher may touch it only when they
 * actually teach that subject to that grade, which the schema records in
 * timetable_entries. The students they may mark are narrowed the same way:
 * only pupils sitting in a section where this teacher teaches this subject —
 * not the whole grade.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when this teacher teaches es.subject_id to a section of es.grade_id. */
const TEACHES_SCHEDULE_SQL = `
    EXISTS (
        SELECT 1
        FROM timetable_entries te
        INNER JOIN sections sec ON sec.id = te.section_id
        WHERE te.teacher_id = $2
          AND te.tenant_id = $1
          AND te.subject_id = es.subject_id
          AND sec.grade_id = es.grade_id
    )
`;

export interface TeacherExamSchedule {
    scheduleId: string;
    examId: string;
    examName: string;
    examType: string;
    examStatus: string;
    gradeName: string;
    subjectName: string;
    examDate: string;
    startTime: string;
    endTime: string;
    maxMarks: string;
    passingMarks: string;
    roomNumber: string | null;
    /** How many of MY students already have a result row for this schedule. */
    enteredCount: number;
    /** How many of MY students sit this paper. */
    studentCount: number;
}

export async function getMyExamSchedules(): Promise<TeacherExamSchedule[]> {
    const { tenantId, userId } = await requireAuth('exams:read');

    const { rows } = await pool.query(
        `SELECT
            es.id AS "scheduleId",
            e.id AS "examId",
            e.name AS "examName",
            e.type AS "examType",
            e.status AS "examStatus",
            g.name AS "gradeName",
            sub.name AS "subjectName",
            es.exam_date::text AS "examDate",
            es.start_time AS "startTime",
            es.end_time AS "endTime",
            es.max_marks AS "maxMarks",
            es.passing_marks AS "passingMarks",
            es.room_number AS "roomNumber",
            (
                SELECT COUNT(*)::int
                FROM students st
                INNER JOIN sections sec ON sec.id = st.section_id
                WHERE st.tenant_id = $1
                  AND st.status = 'ACTIVE'
                  AND sec.grade_id = es.grade_id
                  AND EXISTS (
                      SELECT 1 FROM timetable_entries te
                      WHERE te.section_id = sec.id
                        AND te.teacher_id = $2
                        AND te.tenant_id = $1
                        AND te.subject_id = es.subject_id
                  )
            ) AS "studentCount",
            (
                SELECT COUNT(*)::int
                FROM student_results sr
                INNER JOIN students st ON st.id = sr.student_id
                INNER JOIN sections sec ON sec.id = st.section_id
                WHERE sr.exam_schedule_id = es.id
                  AND sr.tenant_id = $1
                  AND EXISTS (
                      SELECT 1 FROM timetable_entries te
                      WHERE te.section_id = sec.id
                        AND te.teacher_id = $2
                        AND te.tenant_id = $1
                        AND te.subject_id = es.subject_id
                  )
            ) AS "enteredCount"
         FROM exam_schedules es
         INNER JOIN exams e ON e.id = es.exam_id
         INNER JOIN grades g ON g.id = es.grade_id
         INNER JOIN subjects sub ON sub.id = es.subject_id
         WHERE e.tenant_id = $1
           AND ${TEACHES_SCHEDULE_SQL}
         ORDER BY es.exam_date DESC, g.display_order ASC, sub.name ASC`,
        [tenantId, userId]
    );

    return rows;
}

export interface MarksSheetHeader {
    scheduleId: string;
    examName: string;
    examType: string;
    examStatus: string;
    gradeName: string;
    subjectName: string;
    examDate: string;
    maxMarks: string;
    passingMarks: string;
}

export interface MarksSheetRow {
    studentId: string;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    rollNumber: number | null;
    sectionName: string;
    marksObtained: string | null;
    grade: string | null;
    isAbsent: boolean;
    remarks: string | null;
    /** Once a result is hashed by the verification workflow it must not be re-typed here. */
    isLocked: boolean;
}

export async function getMyMarksSheetHeader(scheduleId: string): Promise<MarksSheetHeader | null> {
    if (!UUID_RE.test(scheduleId)) return null;
    const { tenantId, userId } = await requireAuth('exams:read');

    const { rows } = await pool.query(
        `SELECT
            es.id AS "scheduleId",
            e.name AS "examName",
            e.type AS "examType",
            e.status AS "examStatus",
            g.name AS "gradeName",
            sub.name AS "subjectName",
            es.exam_date::text AS "examDate",
            es.max_marks AS "maxMarks",
            es.passing_marks AS "passingMarks"
         FROM exam_schedules es
         INNER JOIN exams e ON e.id = es.exam_id
         INNER JOIN grades g ON g.id = es.grade_id
         INNER JOIN subjects sub ON sub.id = es.subject_id
         WHERE es.id = $3 AND e.tenant_id = $1 AND ${TEACHES_SCHEDULE_SQL}`,
        [tenantId, userId, scheduleId]
    );

    return rows[0] ?? null;
}

export async function getMyMarksSheetRows(scheduleId: string): Promise<MarksSheetRow[]> {
    if (!UUID_RE.test(scheduleId)) return [];
    const { tenantId, userId } = await requireAuth('exams:read');

    const { rows } = await pool.query(
        `SELECT
            st.id AS "studentId",
            st.admission_number AS "admissionNumber",
            st.first_name AS "firstName",
            st.last_name AS "lastName",
            st.roll_number AS "rollNumber",
            sec.name AS "sectionName",
            sr.marks_obtained AS "marksObtained",
            sr.grade,
            COALESCE(sr.is_absent, false) AS "isAbsent",
            sr.remarks,
            (erh.id IS NOT NULL) AS "isLocked"
         FROM exam_schedules es
         INNER JOIN exams e ON e.id = es.exam_id
         INNER JOIN sections sec ON sec.grade_id = es.grade_id AND sec.tenant_id = e.tenant_id
         INNER JOIN students st ON st.section_id = sec.id AND st.tenant_id = e.tenant_id AND st.status = 'ACTIVE'
         LEFT JOIN student_results sr
                ON sr.exam_schedule_id = es.id
               AND sr.student_id = st.id
               AND sr.tenant_id = e.tenant_id
         LEFT JOIN exam_result_hashes erh
                ON erh.result_id = sr.id
               AND erh.tenant_id = e.tenant_id
         WHERE es.id = $3
           AND e.tenant_id = $1
           -- Narrower than TEACHES_SCHEDULE_SQL on purpose: the roll is the sections
           -- where THIS teacher takes THIS subject, not the whole grade sitting the paper.
           AND EXISTS (
                SELECT 1 FROM timetable_entries te
                WHERE te.section_id = sec.id
                  AND te.teacher_id = $2
                  AND te.tenant_id = $1
                  AND te.subject_id = es.subject_id
           )
         ORDER BY sec.name ASC, st.roll_number ASC NULLS LAST, st.first_name ASC`,
        [tenantId, userId, scheduleId]
    );

    return rows;
}

export interface SaveMarksResult {
    success: boolean;
    error?: string;
    saved?: number;
}

/** Same absolute scale the admin marks sheet uses (lib/actions/exams.ts). */
function calculateGrade(percentage: number): string {
    if (percentage >= 90) return 'A+';
    if (percentage >= 80) return 'A';
    if (percentage >= 70) return 'B+';
    if (percentage >= 60) return 'B';
    if (percentage >= 50) return 'C';
    if (percentage >= 40) return 'D';
    return 'F';
}

export async function saveMyMarks(input: {
    scheduleId: string;
    entries: { studentId: string; marksObtained: number | null; isAbsent: boolean }[];
}): Promise<SaveMarksResult> {
    const { tenantId, userId } = await requireAuth('exams:write');

    if (!UUID_RE.test(input.scheduleId)) {
        return { success: false, error: 'Invalid exam schedule.' };
    }
    if (input.entries.length === 0) {
        return { success: false, error: 'No marks were submitted.' };
    }

    const scheduleRes = await pool.query(
        `SELECT es.max_marks AS "maxMarks"
         FROM exam_schedules es
         INNER JOIN exams e ON e.id = es.exam_id
         WHERE es.id = $3 AND e.tenant_id = $1 AND ${TEACHES_SCHEDULE_SQL}`,
        [tenantId, userId, input.scheduleId]
    );
    if (scheduleRes.rows.length === 0) {
        return { success: false, error: 'That paper is not one you teach.' };
    }
    const maxMarks = Number(scheduleRes.rows[0].maxMarks);

    for (const entry of input.entries) {
        if (!UUID_RE.test(entry.studentId)) {
            return { success: false, error: 'Invalid student in submission.' };
        }
        if (entry.marksObtained !== null) {
            if (!Number.isFinite(entry.marksObtained) || entry.marksObtained < 0 || entry.marksObtained > maxMarks) {
                return { success: false, error: `Marks must be between 0 and ${maxMarks}.` };
            }
        }
    }

    // Only students this teacher actually teaches this subject to.
    const studentIds = Array.from(new Set(input.entries.map((e) => e.studentId)));
    const allowedRes = await pool.query(
        `SELECT st.id
         FROM exam_schedules es
         INNER JOIN exams e ON e.id = es.exam_id
         INNER JOIN sections sec ON sec.grade_id = es.grade_id AND sec.tenant_id = e.tenant_id
         INNER JOIN students st ON st.section_id = sec.id AND st.tenant_id = e.tenant_id
         WHERE es.id = $3
           AND e.tenant_id = $1
           AND st.id = ANY($4::uuid[])
           AND EXISTS (
                SELECT 1 FROM timetable_entries te
                WHERE te.section_id = sec.id
                  AND te.teacher_id = $2
                  AND te.tenant_id = $1
                  AND te.subject_id = es.subject_id
           )`,
        [tenantId, userId, input.scheduleId, studentIds]
    );
    if (allowedRes.rows.length !== studentIds.length) {
        return { success: false, error: 'Submission contained students outside your class.' };
    }

    let saved = 0;
    for (const entry of input.entries) {
        const percentage = entry.marksObtained !== null && maxMarks > 0
            ? (entry.marksObtained / maxMarks) * 100
            : 0;
        const grade = entry.isAbsent
            ? 'AB'
            : entry.marksObtained === null
                ? null
                : calculateGrade(percentage);

        const existing = await pool.query(
            `SELECT sr.id, (erh.id IS NOT NULL) AS locked
             FROM student_results sr
             LEFT JOIN exam_result_hashes erh ON erh.result_id = sr.id AND erh.tenant_id = sr.tenant_id
             WHERE sr.exam_schedule_id = $1 AND sr.student_id = $2 AND sr.tenant_id = $3`,
            [input.scheduleId, entry.studentId, tenantId]
        );

        if (existing.rows.length > 0) {
            // A locked (hashed) result is part of the verified record; skip it rather
            // than silently overwriting something a verifier already signed off.
            if (existing.rows[0].locked) continue;

            await pool.query(
                `UPDATE student_results
                 SET marks_obtained = $1, grade = $2, is_absent = $3, entered_by = $4, updated_at = NOW()
                 WHERE id = $5 AND tenant_id = $6`,
                [
                    entry.marksObtained !== null ? String(entry.marksObtained) : null,
                    grade,
                    entry.isAbsent,
                    userId,
                    existing.rows[0].id,
                    tenantId,
                ]
            );
        } else {
            await pool.query(
                `INSERT INTO student_results (id, tenant_id, exam_schedule_id, student_id, marks_obtained, grade, is_absent, entered_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    randomUUID(),
                    tenantId,
                    input.scheduleId,
                    entry.studentId,
                    entry.marksObtained !== null ? String(entry.marksObtained) : null,
                    grade,
                    entry.isAbsent,
                    userId,
                ]
            );
        }
        saved += 1;
    }

    revalidatePath('/teacher/gradebook');
    revalidatePath(`/teacher/gradebook/${input.scheduleId}`);

    return { success: true, saved };
}
