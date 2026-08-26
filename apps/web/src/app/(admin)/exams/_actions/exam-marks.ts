'use server';

/**
 * Exams cluster data access.
 *
 * Everything here reads or writes real rows in `exams`, `exam_schedules`,
 * `student_results` and `exam_result_hashes`. No surface in this cluster is
 * allowed to render a number that did not come out of one of these queries.
 *
 * Column names were checked against apps/web/drizzle/0000_init_baseline.sql:
 *   exam_schedules(exam_id, grade_id, subject_id, exam_date, start_time,
 *                  end_time, max_marks, passing_marks, room_number)  -- NO tenant_id
 *   student_results(tenant_id, exam_schedule_id, student_id, marks_obtained,
 *                   grade, remarks, is_absent, entered_by)
 *   exam_result_hashes(tenant_id, result_id, hash, locked_at, locked_by)
 *
 * `exam_schedules` has no tenant_id of its own, so every query joins it back to
 * `exams` (which does) — RLS cannot scope it on its own.
 */

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { saveMarks, addExamSchedule } from '@/lib/actions/exams';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string | undefined | null): value is string {
    return typeof value === 'string' && UUID_RE.test(value);
}

// ─── Types ───────────────────────────────────────────────────

export interface ExamOverviewItem {
    id: string;
    name: string;
    type: string;
    status: string;
    startDate: string;
    endDate: string;
    academicYearName: string;
    scheduleCount: number;
    resultCount: number;
    expectedCount: number;
}

export interface ExamScheduleRow {
    scheduleId: string;
    gradeId: string;
    gradeName: string;
    subjectId: string;
    subjectName: string;
    subjectCode: string;
    examDate: string;
    startTime: string;
    endTime: string;
    roomNumber: string | null;
    maxMarks: number;
    passingMarks: number;
    enteredCount: number;
    absentCount: number;
    lockedCount: number;
    studentCount: number;
}

export interface ExamHeader {
    id: string;
    name: string;
    type: string;
    status: string;
    startDate: string;
    endDate: string;
    description: string | null;
    academicYearName: string;
}

export interface MarksSheetStudent {
    studentId: string;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    rollNumber: number | null;
    sectionId: string | null;
    sectionName: string | null;
}

export interface MarkRecord {
    marksObtained: number | null;
    isAbsent: boolean;
    grade: string | null;
    remarks: string | null;
    locked: boolean;
}

export interface MarksSheetSubject {
    scheduleId: string;
    subjectName: string;
    subjectCode: string;
    examDate: string;
    maxMarks: number;
    passingMarks: number;
}

export interface MarksSheet {
    exam: ExamHeader;
    gradeId: string;
    gradeName: string;
    subjects: MarksSheetSubject[];
    students: MarksSheetStudent[];
    /** marks[scheduleId][studentId] — only present where a row actually exists. */
    marks: Record<string, Record<string, MarkRecord>>;
}

// ─── Shared loaders ──────────────────────────────────────────

async function loadExamHeader(tenantId: string, examId: string): Promise<ExamHeader | null> {
    const { rows } = await pool.query(
        `SELECT e.id,
                e.name,
                e.type,
                e.status,
                e.start_date AS "startDate",
                e.end_date   AS "endDate",
                e.description,
                ay.name      AS "academicYearName"
         FROM exams e
         INNER JOIN academic_years ay ON e.academic_year_id = ay.id AND ay.tenant_id = e.tenant_id
         WHERE e.id = $1 AND e.tenant_id = $2`,
        [examId, tenantId],
    );
    return rows[0] ?? null;
}

// ─── Exams index ─────────────────────────────────────────────

/**
 * One query for the exams index. Replaces the per-exam COUNT loop in
 * getExams() and additionally reports how many marks are expected, so the
 * list can show real progress instead of a bare schedule count.
 */
export async function getExamOverview(): Promise<ExamOverviewItem[]> {
    const { tenantId } = await requireAuth('exams:read');

    const { rows } = await pool.query(
        `SELECT e.id,
                e.name,
                e.type,
                e.status,
                e.start_date AS "startDate",
                e.end_date   AS "endDate",
                ay.name      AS "academicYearName",
                (SELECT COUNT(*) FROM exam_schedules es WHERE es.exam_id = e.id) AS "scheduleCount",
                (SELECT COUNT(*)
                   FROM student_results sr
                   INNER JOIN exam_schedules es2 ON sr.exam_schedule_id = es2.id
                  WHERE es2.exam_id = e.id AND sr.tenant_id = e.tenant_id) AS "resultCount",
                (SELECT COALESCE(SUM((SELECT COUNT(*)
                                        FROM students st
                                       WHERE st.grade_id = es3.grade_id
                                         AND st.tenant_id = e.tenant_id
                                         AND st.status = 'ACTIVE')), 0)
                   FROM exam_schedules es3 WHERE es3.exam_id = e.id) AS "expectedCount"
         FROM exams e
         INNER JOIN academic_years ay ON e.academic_year_id = ay.id AND ay.tenant_id = e.tenant_id
         WHERE e.tenant_id = $1
         ORDER BY e.start_date DESC`,
        [tenantId],
    );

    return rows.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        status: r.status,
        startDate: r.startDate,
        endDate: r.endDate,
        academicYearName: r.academicYearName,
        scheduleCount: Number(r.scheduleCount),
        resultCount: Number(r.resultCount),
        expectedCount: Number(r.expectedCount),
    }));
}

// ─── Exam detail ─────────────────────────────────────────────

export async function getExamWithSchedules(
    examId: string,
): Promise<{ exam: ExamHeader; schedules: ExamScheduleRow[] } | null> {
    const { tenantId } = await requireAuth('exams:read');
    if (!isUuid(examId)) return null;

    const exam = await loadExamHeader(tenantId, examId);
    if (!exam) return null;

    const { rows } = await pool.query(
        `SELECT es.id          AS "scheduleId",
                g.id           AS "gradeId",
                g.name         AS "gradeName",
                sub.id         AS "subjectId",
                sub.name       AS "subjectName",
                sub.code       AS "subjectCode",
                es.exam_date   AS "examDate",
                es.start_time  AS "startTime",
                es.end_time    AS "endTime",
                es.room_number AS "roomNumber",
                es.max_marks   AS "maxMarks",
                es.passing_marks AS "passingMarks",
                (SELECT COUNT(*) FROM student_results sr
                  WHERE sr.exam_schedule_id = es.id AND sr.tenant_id = e.tenant_id) AS "enteredCount",
                (SELECT COUNT(*) FROM student_results sr
                  WHERE sr.exam_schedule_id = es.id AND sr.tenant_id = e.tenant_id AND sr.is_absent) AS "absentCount",
                (SELECT COUNT(*) FROM student_results sr
                   INNER JOIN exam_result_hashes erh ON erh.result_id = sr.id AND erh.tenant_id = sr.tenant_id
                  WHERE sr.exam_schedule_id = es.id AND sr.tenant_id = e.tenant_id) AS "lockedCount",
                (SELECT COUNT(*) FROM students st
                  WHERE st.grade_id = es.grade_id AND st.tenant_id = e.tenant_id AND st.status = 'ACTIVE') AS "studentCount"
         FROM exam_schedules es
         INNER JOIN exams e ON es.exam_id = e.id
         INNER JOIN grades g ON es.grade_id = g.id AND g.tenant_id = e.tenant_id
         INNER JOIN subjects sub ON es.subject_id = sub.id AND sub.tenant_id = e.tenant_id
         WHERE es.exam_id = $1 AND e.tenant_id = $2
         ORDER BY g.display_order ASC, es.exam_date ASC, sub.name ASC`,
        [examId, tenantId],
    );

    const schedules: ExamScheduleRow[] = rows.map((r) => ({
        scheduleId: r.scheduleId,
        gradeId: r.gradeId,
        gradeName: r.gradeName,
        subjectId: r.subjectId,
        subjectName: r.subjectName,
        subjectCode: r.subjectCode,
        examDate: r.examDate,
        startTime: r.startTime,
        endTime: r.endTime,
        roomNumber: r.roomNumber,
        maxMarks: Number(r.maxMarks),
        passingMarks: Number(r.passingMarks),
        enteredCount: Number(r.enteredCount),
        absentCount: Number(r.absentCount),
        lockedCount: Number(r.lockedCount),
        studentCount: Number(r.studentCount),
    }));

    return { exam, schedules };
}

// ─── Marks sheet ─────────────────────────────────────────────

/**
 * Everything the marks-entry screen needs for one exam × one grade:
 * the scheduled subjects, the active students of that grade, and whatever
 * marks have already been saved (with their verification lock state).
 */
export async function getMarksSheet(examId: string, gradeId: string): Promise<MarksSheet | null> {
    const { tenantId } = await requireAuth('exams:read');
    if (!isUuid(examId) || !isUuid(gradeId)) return null;

    const exam = await loadExamHeader(tenantId, examId);
    if (!exam) return null;

    const gradeRes = await pool.query(
        `SELECT id, name FROM grades WHERE id = $1 AND tenant_id = $2`,
        [gradeId, tenantId],
    );
    const grade = gradeRes.rows[0];
    if (!grade) return null;

    const subjectsRes = await pool.query(
        `SELECT es.id        AS "scheduleId",
                sub.name     AS "subjectName",
                sub.code     AS "subjectCode",
                es.exam_date AS "examDate",
                es.max_marks AS "maxMarks",
                es.passing_marks AS "passingMarks"
         FROM exam_schedules es
         INNER JOIN exams e ON es.exam_id = e.id
         INNER JOIN subjects sub ON es.subject_id = sub.id AND sub.tenant_id = e.tenant_id
         WHERE es.exam_id = $1 AND es.grade_id = $2 AND e.tenant_id = $3
         ORDER BY es.exam_date ASC, sub.name ASC`,
        [examId, gradeId, tenantId],
    );

    const subjects: MarksSheetSubject[] = subjectsRes.rows.map((r) => ({
        scheduleId: r.scheduleId,
        subjectName: r.subjectName,
        subjectCode: r.subjectCode,
        examDate: r.examDate,
        maxMarks: Number(r.maxMarks),
        passingMarks: Number(r.passingMarks),
    }));

    const studentsRes = await pool.query(
        `SELECT st.id               AS "studentId",
                st.admission_number AS "admissionNumber",
                st.first_name       AS "firstName",
                st.last_name        AS "lastName",
                st.roll_number      AS "rollNumber",
                st.section_id       AS "sectionId",
                sec.name            AS "sectionName"
         FROM students st
         LEFT JOIN sections sec ON st.section_id = sec.id AND sec.tenant_id = st.tenant_id
         WHERE st.grade_id = $1 AND st.tenant_id = $2 AND st.status = 'ACTIVE'
         ORDER BY sec.name ASC NULLS LAST, st.roll_number ASC NULLS LAST, st.first_name ASC`,
        [gradeId, tenantId],
    );

    const students: MarksSheetStudent[] = studentsRes.rows.map((r) => ({
        studentId: r.studentId,
        admissionNumber: r.admissionNumber,
        firstName: r.firstName,
        lastName: r.lastName,
        rollNumber: r.rollNumber === null ? null : Number(r.rollNumber),
        sectionId: r.sectionId,
        sectionName: r.sectionName,
    }));

    const marks = await loadMarksForGrade(tenantId, examId, gradeId);

    return {
        exam,
        gradeId: grade.id,
        gradeName: grade.name,
        subjects,
        students,
        marks,
    };
}

async function loadMarksForGrade(
    tenantId: string,
    examId: string,
    gradeId: string,
): Promise<Record<string, Record<string, MarkRecord>>> {
    const { rows } = await pool.query(
        `SELECT sr.exam_schedule_id AS "scheduleId",
                sr.student_id       AS "studentId",
                sr.marks_obtained   AS "marksObtained",
                sr.is_absent        AS "isAbsent",
                sr.grade,
                sr.remarks,
                (erh.id IS NOT NULL) AS "locked"
         FROM student_results sr
         INNER JOIN exam_schedules es ON sr.exam_schedule_id = es.id
         INNER JOIN exams e ON es.exam_id = e.id
         LEFT JOIN exam_result_hashes erh ON erh.result_id = sr.id AND erh.tenant_id = sr.tenant_id
         WHERE es.exam_id = $1 AND es.grade_id = $2 AND sr.tenant_id = $3 AND e.tenant_id = $3`,
        [examId, gradeId, tenantId],
    );

    const marks: Record<string, Record<string, MarkRecord>> = {};
    for (const r of rows) {
        if (!marks[r.scheduleId]) marks[r.scheduleId] = {};
        marks[r.scheduleId][r.studentId] = {
            marksObtained: r.marksObtained === null ? null : Number(r.marksObtained),
            isAbsent: Boolean(r.isAbsent),
            grade: r.grade,
            remarks: r.remarks,
            locked: Boolean(r.locked),
        };
    }
    return marks;
}

// ─── Saving marks ────────────────────────────────────────────

export interface SaveMarksEntry {
    studentId: string;
    /** null means "absent" or "not attempted"; never send NaN. */
    marksObtained: number | null;
    isAbsent: boolean;
}

export interface SaveMarksResult {
    success: boolean;
    error?: string;
    saved: number;
    cleared: number;
    skippedLocked: number;
}

/**
 * Writes marks for one exam schedule.
 *
 * Validates against the schedule's own max_marks, refuses to touch results that
 * have already been locked by verification (exam_result_hashes), and delegates
 * the upsert + grade calculation to saveMarks() in lib/actions/exams.ts.
 * An entry that is neither absent nor carries a number clears any previously
 * saved result for that student, so blanking a field really blanks it.
 *
 * The result is deliberately FLAT — union narrowing does not survive the
 * 'use server' boundary.
 */
export async function saveScheduleMarks(
    examScheduleId: string,
    entries: SaveMarksEntry[],
): Promise<SaveMarksResult> {
    const empty = { saved: 0, cleared: 0, skippedLocked: 0 };
    try {
        const { tenantId } = await requireAuth('exams:write');

        if (!isUuid(examScheduleId)) {
            return { success: false, error: 'Invalid exam schedule.', ...empty };
        }
        if (!Array.isArray(entries) || entries.length === 0) {
            return { success: false, error: 'Nothing to save.', ...empty };
        }

        const scheduleRes = await pool.query(
            `SELECT es.id, es.grade_id AS "gradeId", es.max_marks AS "maxMarks"
             FROM exam_schedules es
             INNER JOIN exams e ON es.exam_id = e.id
             WHERE es.id = $1 AND e.tenant_id = $2`,
            [examScheduleId, tenantId],
        );
        const schedule = scheduleRes.rows[0];
        if (!schedule) {
            return { success: false, error: 'Exam schedule not found.', ...empty };
        }
        const maxMarks = Number(schedule.maxMarks);

        for (const entry of entries) {
            if (!isUuid(entry.studentId)) {
                return { success: false, error: 'Invalid student reference.', ...empty };
            }
            if (!entry.isAbsent && entry.marksObtained !== null) {
                if (!Number.isFinite(entry.marksObtained)) {
                    return { success: false, error: 'Marks must be a number.', ...empty };
                }
                if (entry.marksObtained < 0 || entry.marksObtained > maxMarks) {
                    return {
                        success: false,
                        error: `Marks must be between 0 and ${maxMarks}.`,
                        ...empty,
                    };
                }
            }
        }

        // Students must belong to this tenant AND to the grade this schedule is for.
        const studentIds = Array.from(new Set(entries.map((e) => e.studentId)));
        const eligibleRes = await pool.query(
            `SELECT id FROM students
             WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND grade_id = $3`,
            [studentIds, tenantId, schedule.gradeId],
        );
        const eligible = new Set<string>(eligibleRes.rows.map((r) => r.id));
        if (eligible.size !== studentIds.length) {
            return {
                success: false,
                error: 'One or more students do not belong to this class.',
                ...empty,
            };
        }

        // Results already locked by verification are immutable.
        const lockedRes = await pool.query(
            `SELECT sr.student_id AS "studentId"
             FROM student_results sr
             INNER JOIN exam_result_hashes erh ON erh.result_id = sr.id AND erh.tenant_id = sr.tenant_id
             WHERE sr.exam_schedule_id = $1 AND sr.tenant_id = $2`,
            [examScheduleId, tenantId],
        );
        const locked = new Set<string>(lockedRes.rows.map((r) => r.studentId));

        const writable = entries.filter((e) => !locked.has(e.studentId));
        const skippedLocked = entries.length - writable.length;

        if (writable.length === 0) {
            return {
                success: false,
                error: 'Every result in this list is locked by verification and cannot be changed.',
                saved: 0,
                cleared: 0,
                skippedLocked,
            };
        }

        const toWrite = writable.filter((e) => e.isAbsent || e.marksObtained !== null);
        const toClear = writable.filter((e) => !e.isAbsent && e.marksObtained === null);

        if (toWrite.length > 0) {
            // saveMarks() overwrites `remarks` with whatever it is handed, so
            // carry the stored remark forward rather than silently blanking it.
            const remarksRes = await pool.query(
                `SELECT student_id AS "studentId", remarks
                 FROM student_results
                 WHERE exam_schedule_id = $1 AND tenant_id = $2 AND remarks IS NOT NULL`,
                [examScheduleId, tenantId],
            );
            const remarksByStudent = new Map<string, string>(
                remarksRes.rows.map((r) => [r.studentId, r.remarks]),
            );

            await saveMarks(
                examScheduleId,
                toWrite.map((e) => ({
                    studentId: e.studentId,
                    marksObtained: e.isAbsent ? null : e.marksObtained,
                    isAbsent: e.isAbsent,
                    remarks: remarksByStudent.get(e.studentId),
                })),
            );
        }

        let cleared = 0;
        if (toClear.length > 0) {
            const clearRes = await pool.query(
                `DELETE FROM student_results sr
                 WHERE sr.exam_schedule_id = $1
                   AND sr.tenant_id = $2
                   AND sr.student_id = ANY($3::uuid[])
                   AND NOT EXISTS (
                       SELECT 1 FROM exam_result_hashes erh
                       WHERE erh.result_id = sr.id AND erh.tenant_id = sr.tenant_id
                   )`,
                [examScheduleId, tenantId, toClear.map((e) => e.studentId)],
            );
            cleared = clearRes.rowCount ?? 0;
        }

        return { success: true, saved: toWrite.length, cleared, skippedLocked };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to save marks.';
        return { success: false, error: message, ...empty };
    }
}

// ─── Scheduling papers ───────────────────────────────────────

export interface SchedulePicklists {
    grades: { id: string; name: string; studentCount: number }[];
    subjects: { id: string; name: string; code: string }[];
}

export async function getSchedulePicklists(): Promise<SchedulePicklists> {
    const { tenantId } = await requireAuth('exams:read');

    const gradesRes = await pool.query(
        `SELECT g.id,
                g.name,
                (SELECT COUNT(*) FROM students st
                  WHERE st.grade_id = g.id AND st.tenant_id = g.tenant_id AND st.status = 'ACTIVE'
                ) AS "studentCount"
         FROM grades g
         WHERE g.tenant_id = $1
         ORDER BY g.display_order ASC`,
        [tenantId],
    );

    const subjectsRes = await pool.query(
        `SELECT id, name, code FROM subjects WHERE tenant_id = $1 ORDER BY name ASC`,
        [tenantId],
    );

    return {
        grades: gradesRes.rows.map((r) => ({
            id: r.id,
            name: r.name,
            studentCount: Number(r.studentCount),
        })),
        subjects: subjectsRes.rows.map((r) => ({ id: r.id, name: r.name, code: r.code })),
    };
}

export interface AddExamPaperInput {
    examId: string;
    gradeId: string;
    subjectId: string;
    examDate: string;
    startTime: string;
    endTime: string;
    maxMarks: number;
    passingMarks: number;
    roomNumber?: string;
}

export interface AddExamPaperResult {
    success: boolean;
    error?: string;
}

/**
 * Adds one class × subject paper to an exam. Wraps addExamSchedule() so the
 * result stays FLAT for the client component, and rejects the duplicates the
 * schema has no unique constraint for.
 */
export async function addExamPaper(input: AddExamPaperInput): Promise<AddExamPaperResult> {
    try {
        const { tenantId } = await requireAuth('exams:write');

        if (!isUuid(input.examId) || !isUuid(input.gradeId) || !isUuid(input.subjectId)) {
            return { success: false, error: 'Pick a class and a subject.' };
        }
        if (!input.examDate || !input.startTime || !input.endTime) {
            return { success: false, error: 'Date, start time and end time are required.' };
        }
        if (input.endTime <= input.startTime) {
            return { success: false, error: 'End time must be after the start time.' };
        }
        if (!Number.isFinite(input.maxMarks) || input.maxMarks <= 0) {
            return { success: false, error: 'Max marks must be greater than zero.' };
        }
        if (
            !Number.isFinite(input.passingMarks) ||
            input.passingMarks < 0 ||
            input.passingMarks > input.maxMarks
        ) {
            return { success: false, error: 'Passing marks must be between 0 and max marks.' };
        }

        const dupRes = await pool.query(
            `SELECT es.id
             FROM exam_schedules es
             INNER JOIN exams e ON es.exam_id = e.id
             WHERE es.exam_id = $1 AND es.grade_id = $2 AND es.subject_id = $3 AND e.tenant_id = $4`,
            [input.examId, input.gradeId, input.subjectId, tenantId],
        );
        if (dupRes.rows.length > 0) {
            return { success: false, error: 'That class already has a paper for this subject.' };
        }

        await addExamSchedule({
            examId: input.examId,
            gradeId: input.gradeId,
            subjectId: input.subjectId,
            examDate: input.examDate,
            startTime: input.startTime,
            endTime: input.endTime,
            maxMarks: input.maxMarks,
            passingMarks: input.passingMarks,
            roomNumber: input.roomNumber?.trim() || undefined,
        });

        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to add the paper.';
        return { success: false, error: message };
    }
}
