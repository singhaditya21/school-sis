'use server';

/**
 * Report-card data.
 *
 * A report card here is nothing more than the `student_results` rows that exist
 * for a given exam, laid out per student against the `exam_schedules` for that
 * student's grade. Nothing is inferred: a subject with no saved result is shown
 * as "not entered", never as zero, and a class with no results at all returns an
 * empty payload so the page can say so plainly.
 */

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string | undefined | null): value is string {
    return typeof value === 'string' && UUID_RE.test(value);
}

export interface ReportCardExamOption {
    id: string;
    name: string;
    type: string;
    status: string;
    startDate: string;
    academicYearName: string;
    scheduleCount: number;
    resultCount: number;
}

export interface ReportCardClassOption {
    gradeId: string;
    gradeName: string;
    displayOrder: number;
    sectionId: string;
    sectionName: string;
    studentCount: number;
    resultCount: number;
}

export interface ReportCardSubject {
    scheduleId: string;
    subjectName: string;
    subjectCode: string;
    examDate: string;
    maxMarks: number;
    passingMarks: number;
}

export interface ReportCardSubjectMark {
    scheduleId: string;
    marksObtained: number | null;
    isAbsent: boolean;
    grade: string | null;
    remarks: string | null;
}

export interface ReportCardStudent {
    studentId: string;
    admissionNumber: string;
    fullName: string;
    rollNumber: number | null;
    sectionId: string | null;
    sectionName: string | null;
    /** keyed by scheduleId; absent key means no result row exists */
    subjectMarks: Record<string, ReportCardSubjectMark>;
    subjectsEntered: number;
    totalObtained: number;
    totalMax: number;
    percentage: number | null;
    subjectsPassed: number;
    subjectsFailed: number;
    classRank: number | null;
    sectionRank: number | null;
}

export interface ClassReportCards {
    examId: string;
    examName: string;
    examStatus: string;
    academicYearName: string;
    gradeId: string;
    gradeName: string;
    sectionId: string;
    sectionName: string;
    subjects: ReportCardSubject[];
    students: ReportCardStudent[];
    gradeStudentCount: number;
    statistics: {
        withResults: number;
        averagePercentage: number | null;
        highestPercentage: number | null;
        lowestPercentage: number | null;
        clearedAllSubjects: number;
    };
}

// ─── Pickers ─────────────────────────────────────────────────

export async function getReportCardExamOptions(): Promise<ReportCardExamOption[]> {
    const { tenantId } = await requireAuth('exams:read');

    const { rows } = await pool.query(
        `SELECT e.id,
                e.name,
                e.type,
                e.status,
                e.start_date AS "startDate",
                ay.name      AS "academicYearName",
                (SELECT COUNT(*) FROM exam_schedules es WHERE es.exam_id = e.id) AS "scheduleCount",
                (SELECT COUNT(*)
                   FROM student_results sr
                   INNER JOIN exam_schedules es2 ON sr.exam_schedule_id = es2.id
                  WHERE es2.exam_id = e.id AND sr.tenant_id = e.tenant_id) AS "resultCount"
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
        academicYearName: r.academicYearName,
        scheduleCount: Number(r.scheduleCount),
        resultCount: Number(r.resultCount),
    }));
}

/** Classes (grade × section) that this exam actually has papers for. */
export async function getReportCardClasses(examId: string): Promise<ReportCardClassOption[]> {
    const { tenantId } = await requireAuth('exams:read');
    if (!isUuid(examId)) return [];

    const { rows } = await pool.query(
        `SELECT g.id            AS "gradeId",
                g.name          AS "gradeName",
                g.display_order AS "displayOrder",
                sec.id          AS "sectionId",
                sec.name        AS "sectionName",
                (SELECT COUNT(*) FROM students st
                  WHERE st.section_id = sec.id AND st.tenant_id = e.tenant_id AND st.status = 'ACTIVE'
                ) AS "studentCount",
                (SELECT COUNT(*)
                   FROM student_results sr
                   INNER JOIN exam_schedules es2 ON sr.exam_schedule_id = es2.id
                   INNER JOIN students st2 ON sr.student_id = st2.id
                  WHERE es2.exam_id = e.id
                    AND sr.tenant_id = e.tenant_id
                    AND st2.section_id = sec.id
                ) AS "resultCount"
         FROM exams e
         INNER JOIN grades g ON g.tenant_id = e.tenant_id
         INNER JOIN sections sec ON sec.grade_id = g.id
                                AND sec.tenant_id = e.tenant_id
                                AND sec.academic_year_id = e.academic_year_id
         WHERE e.id = $1
           AND e.tenant_id = $2
           AND EXISTS (SELECT 1 FROM exam_schedules es WHERE es.exam_id = e.id AND es.grade_id = g.id)
         ORDER BY g.display_order ASC, sec.name ASC`,
        [examId, tenantId],
    );

    return rows.map((r) => ({
        gradeId: r.gradeId,
        gradeName: r.gradeName,
        displayOrder: Number(r.displayOrder),
        sectionId: r.sectionId,
        sectionName: r.sectionName,
        studentCount: Number(r.studentCount),
        resultCount: Number(r.resultCount),
    }));
}

/** The most recent exam that has at least one saved result for this section. */
export async function getDefaultExamForSection(sectionId: string): Promise<string | null> {
    const { tenantId } = await requireAuth('exams:read');
    if (!isUuid(sectionId)) return null;

    const { rows } = await pool.query(
        `SELECT e.id
         FROM exams e
         INNER JOIN exam_schedules es ON es.exam_id = e.id
         INNER JOIN student_results sr ON sr.exam_schedule_id = es.id AND sr.tenant_id = e.tenant_id
         INNER JOIN students st ON sr.student_id = st.id AND st.tenant_id = e.tenant_id
         WHERE e.tenant_id = $1 AND st.section_id = $2
         GROUP BY e.id, e.start_date
         ORDER BY e.start_date DESC
         LIMIT 1`,
        [tenantId, sectionId],
    );

    return rows[0]?.id ?? null;
}

// ─── The report cards themselves ─────────────────────────────

function rankBy(
    students: ReportCardStudent[],
    pick: (s: ReportCardStudent) => number | null,
    assign: (s: ReportCardStudent, rank: number) => void,
): void {
    const ranked = students
        .filter((s) => pick(s) !== null)
        .sort((a, b) => (pick(b) ?? 0) - (pick(a) ?? 0));

    let lastValue: number | null = null;
    let lastRank = 0;
    ranked.forEach((student, index) => {
        const value = pick(student) ?? 0;
        // Standard competition ranking: equal percentages share a rank.
        const rank = lastValue !== null && value === lastValue ? lastRank : index + 1;
        assign(student, rank);
        lastValue = value;
        lastRank = rank;
    });
}

export async function getClassReportCards(
    sectionId: string,
    examId: string,
): Promise<ClassReportCards | null> {
    const { tenantId } = await requireAuth('exams:read');
    if (!isUuid(sectionId) || !isUuid(examId)) return null;

    const contextRes = await pool.query(
        `SELECT e.id     AS "examId",
                e.name   AS "examName",
                e.status AS "examStatus",
                ay.name  AS "academicYearName",
                g.id     AS "gradeId",
                g.name   AS "gradeName",
                sec.id   AS "sectionId",
                sec.name AS "sectionName"
         FROM exams e
         INNER JOIN academic_years ay ON e.academic_year_id = ay.id AND ay.tenant_id = e.tenant_id
         INNER JOIN sections sec ON sec.id = $1 AND sec.tenant_id = e.tenant_id
         INNER JOIN grades g ON sec.grade_id = g.id AND g.tenant_id = e.tenant_id
         WHERE e.id = $2 AND e.tenant_id = $3`,
        [sectionId, examId, tenantId],
    );
    const context = contextRes.rows[0];
    if (!context) return null;

    const subjectsRes = await pool.query(
        `SELECT es.id            AS "scheduleId",
                sub.name         AS "subjectName",
                sub.code         AS "subjectCode",
                es.exam_date     AS "examDate",
                es.max_marks     AS "maxMarks",
                es.passing_marks AS "passingMarks"
         FROM exam_schedules es
         INNER JOIN exams e ON es.exam_id = e.id
         INNER JOIN subjects sub ON es.subject_id = sub.id AND sub.tenant_id = e.tenant_id
         WHERE es.exam_id = $1 AND es.grade_id = $2 AND e.tenant_id = $3
         ORDER BY es.exam_date ASC, sub.name ASC`,
        [examId, context.gradeId, tenantId],
    );

    const subjects: ReportCardSubject[] = subjectsRes.rows.map((r) => ({
        scheduleId: r.scheduleId,
        subjectName: r.subjectName,
        subjectCode: r.subjectCode,
        examDate: r.examDate,
        maxMarks: Number(r.maxMarks),
        passingMarks: Number(r.passingMarks),
    }));
    const subjectById = new Map(subjects.map((s) => [s.scheduleId, s]));

    // Whole grade, so class rank is a real class rank and not a section rank.
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
        [context.gradeId, tenantId],
    );

    const resultsRes = await pool.query(
        `SELECT sr.student_id       AS "studentId",
                sr.exam_schedule_id AS "scheduleId",
                sr.marks_obtained   AS "marksObtained",
                sr.is_absent        AS "isAbsent",
                sr.grade,
                sr.remarks
         FROM student_results sr
         INNER JOIN exam_schedules es ON sr.exam_schedule_id = es.id
         INNER JOIN exams e ON es.exam_id = e.id
         WHERE es.exam_id = $1 AND es.grade_id = $2 AND sr.tenant_id = $3 AND e.tenant_id = $3`,
        [examId, context.gradeId, tenantId],
    );

    const marksByStudent = new Map<string, Record<string, ReportCardSubjectMark>>();
    for (const row of resultsRes.rows) {
        const bucket = marksByStudent.get(row.studentId) ?? {};
        bucket[row.scheduleId] = {
            scheduleId: row.scheduleId,
            marksObtained: row.marksObtained === null ? null : Number(row.marksObtained),
            isAbsent: Boolean(row.isAbsent),
            grade: row.grade,
            remarks: row.remarks,
        };
        marksByStudent.set(row.studentId, bucket);
    }

    const gradeStudents: ReportCardStudent[] = studentsRes.rows.map((r) => {
        const subjectMarks = marksByStudent.get(r.studentId) ?? {};

        let totalObtained = 0;
        let totalMax = 0;
        let subjectsEntered = 0;
        let subjectsPassed = 0;
        let subjectsFailed = 0;

        for (const mark of Object.values(subjectMarks)) {
            const subject = subjectById.get(mark.scheduleId);
            if (!subject) continue;
            subjectsEntered += 1;
            totalMax += subject.maxMarks;
            const scored = mark.isAbsent ? 0 : (mark.marksObtained ?? 0);
            totalObtained += scored;
            if (!mark.isAbsent && scored >= subject.passingMarks) subjectsPassed += 1;
            else subjectsFailed += 1;
        }

        return {
            studentId: r.studentId,
            admissionNumber: r.admissionNumber,
            fullName: `${r.firstName} ${r.lastName}`.trim(),
            rollNumber: r.rollNumber === null ? null : Number(r.rollNumber),
            sectionId: r.sectionId,
            sectionName: r.sectionName,
            subjectMarks,
            subjectsEntered,
            totalObtained: Math.round(totalObtained * 100) / 100,
            totalMax: Math.round(totalMax * 100) / 100,
            percentage:
                subjectsEntered > 0 && totalMax > 0
                    ? Math.round((totalObtained / totalMax) * 1000) / 10
                    : null,
            subjectsPassed,
            subjectsFailed,
            classRank: null,
            sectionRank: null,
        };
    });

    rankBy(
        gradeStudents,
        (s) => s.percentage,
        (s, rank) => {
            s.classRank = rank;
        },
    );

    const sectionStudents = gradeStudents.filter((s) => s.sectionId === context.sectionId);
    rankBy(
        sectionStudents,
        (s) => s.percentage,
        (s, rank) => {
            s.sectionRank = rank;
        },
    );

    const scored = sectionStudents.filter((s) => s.percentage !== null);
    const percentages = scored.map((s) => s.percentage ?? 0);

    return {
        examId: context.examId,
        examName: context.examName,
        examStatus: context.examStatus,
        academicYearName: context.academicYearName,
        gradeId: context.gradeId,
        gradeName: context.gradeName,
        sectionId: context.sectionId,
        sectionName: context.sectionName,
        subjects,
        students: sectionStudents,
        gradeStudentCount: gradeStudents.length,
        statistics: {
            withResults: scored.length,
            averagePercentage:
                percentages.length > 0
                    ? Math.round((percentages.reduce((a, b) => a + b, 0) / percentages.length) * 10) / 10
                    : null,
            highestPercentage: percentages.length > 0 ? Math.max(...percentages) : null,
            lowestPercentage: percentages.length > 0 ? Math.min(...percentages) : null,
            clearedAllSubjects: scored.filter((s) => s.subjectsEntered > 0 && s.subjectsFailed === 0)
                .length,
        },
    };
}
