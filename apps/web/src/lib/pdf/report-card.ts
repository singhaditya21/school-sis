import { pool } from '@/lib/db';
import { EMPTY, filenameSlug, formatPdfDate, orEmpty } from './format';
import {
    GOOD,
    MUTED,
    PdfBuilder,
    WARN,
    drawLetterhead,
    type TableColumn,
    type TableRow,
} from './layout';

/**
 * Report card PDF, generated in-process.
 *
 * The numbers mirror /exams/report-cards: a report card is nothing more than
 * the `student_results` rows that exist, laid out against the `exam_schedules`
 * for the student's grade. A subject with no saved result prints as "Not
 * entered", never as zero, and only exams with status PUBLISHED are read — a
 * draft mark sheet must never leave the building as a PDF.
 *
 * The route's `[termId]` segment accepts either a `terms` row (in which case
 * every published exam that starts inside the term is included) or a single
 * published exam id, because both identifiers are in circulation.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReportCardSchool = {
    name: string;
    addressLine: string;
    contactLine: string;
};

export type ReportCardStudentInfo = {
    id: string;
    fullName: string;
    admissionNumber: string;
    rollNumber: number | null;
    gradeId: string;
    gradeName: string | null;
    sectionId: string | null;
    sectionName: string | null;
};

export type ReportCardPeriod = {
    kind: 'TERM' | 'EXAM';
    id: string;
    name: string;
    academicYearName: string | null;
    startDate: Date | string | null;
    endDate: Date | string | null;
    /** Published exams covered by this period, in date order. */
    exams: { id: string; name: string; startDate: Date | string }[];
};

export type ReportCardSubjectRow = {
    scheduleId: string;
    examId: string;
    examName: string;
    subjectName: string;
    subjectCode: string | null;
    examDate: Date | string;
    maxMarks: number;
    passingMarks: number;
    /** null when no `student_results` row exists for this paper. */
    marksObtained: number | null;
    isAbsent: boolean;
    hasResult: boolean;
    grade: string | null;
    remarks: string | null;
};

export type ReportCardPdfData = {
    school: ReportCardSchool;
    student: ReportCardStudentInfo;
    period: ReportCardPeriod;
    subjects: ReportCardSubjectRow[];
    totals: {
        subjectsEntered: number;
        totalObtained: number;
        totalMax: number;
        percentage: number | null;
        subjectsPassed: number;
        subjectsFailed: number;
    };
    classRank: number | null;
    sectionRank: number | null;
    gradeStudentCount: number;
    sectionStudentCount: number;
};

type ScheduleRow = {
    scheduleId: string;
    examId: string;
    examName: string;
    subjectName: string;
    subjectCode: string | null;
    examDate: Date | string;
    maxMarks: string;
    passingMarks: string;
};

type ResultRow = {
    studentId: string;
    scheduleId: string;
    marksObtained: string | null;
    isAbsent: boolean;
    grade: string | null;
    remarks: string | null;
};

/** Standard competition ranking on percentage, highest first. Mirrors the page. */
function rankOf(
    entries: { id: string; percentage: number | null }[],
    targetId: string,
): number | null {
    const ranked = entries
        .filter((entry) => entry.percentage !== null)
        .sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0));

    let lastValue: number | null = null;
    let lastRank = 0;
    for (let index = 0; index < ranked.length; index += 1) {
        const value = ranked[index].percentage ?? 0;
        const rank = lastValue !== null && value === lastValue ? lastRank : index + 1;
        if (ranked[index].id === targetId) return rank;
        lastValue = value;
        lastRank = rank;
    }
    return null;
}

function totalsFor(
    marks: Map<string, ResultRow>,
    schedules: ScheduleRow[],
): ReportCardPdfData['totals'] {
    let totalObtained = 0;
    let totalMax = 0;
    let subjectsEntered = 0;
    let subjectsPassed = 0;
    let subjectsFailed = 0;

    for (const schedule of schedules) {
        const mark = marks.get(schedule.scheduleId);
        if (!mark) continue;
        subjectsEntered += 1;
        const maxMarks = Number(schedule.maxMarks);
        const passingMarks = Number(schedule.passingMarks);
        totalMax += maxMarks;
        const scored = mark.isAbsent ? 0 : Number(mark.marksObtained ?? 0);
        totalObtained += scored;
        if (!mark.isAbsent && scored >= passingMarks) subjectsPassed += 1;
        else subjectsFailed += 1;
    }

    return {
        subjectsEntered,
        totalObtained: Math.round(totalObtained * 100) / 100,
        totalMax: Math.round(totalMax * 100) / 100,
        percentage:
            subjectsEntered > 0 && totalMax > 0
                ? Math.round((totalObtained / totalMax) * 1000) / 10
                : null,
        subjectsPassed,
        subjectsFailed,
    };
}

/**
 * Tenant-scoped read. Returns null when the student, the period, or any
 * published exam within it does not exist for this tenant.
 */
export async function loadReportCardForPdf(
    studentId: string,
    periodId: string,
    tenantId: string,
): Promise<ReportCardPdfData | null> {
    if (!UUID_RE.test(studentId) || !UUID_RE.test(periodId) || !UUID_RE.test(tenantId)) {
        return null;
    }

    const studentRes = await pool.query(
        `SELECT st.id                AS "studentId",
                st.first_name        AS "firstName",
                st.last_name         AS "lastName",
                st.admission_number  AS "admissionNumber",
                st.roll_number       AS "rollNumber",
                st.grade_id          AS "gradeId",
                st.section_id        AS "sectionId",
                g.name               AS "gradeName",
                sec.name             AS "sectionName",
                ay.name              AS "sectionAcademicYear",
                t.name               AS "schoolName",
                t.address            AS "schoolAddress",
                t.city               AS "schoolCity",
                t.state              AS "schoolState",
                t.pincode            AS "schoolPincode",
                t.phone              AS "schoolPhone",
                t.email              AS "schoolEmail",
                t.affiliation_board  AS "affiliationBoard",
                t.udise_code         AS "udiseCode"
         FROM students st
         INNER JOIN tenants t ON t.id = st.tenant_id
         LEFT JOIN grades g ON g.id = st.grade_id AND g.tenant_id = st.tenant_id
         LEFT JOIN sections sec ON sec.id = st.section_id AND sec.tenant_id = st.tenant_id
         LEFT JOIN academic_years ay ON ay.id = sec.academic_year_id AND ay.tenant_id = st.tenant_id
         WHERE st.id = $1 AND st.tenant_id = $2`,
        [studentId, tenantId],
    );

    const studentRow = studentRes.rows[0];
    if (!studentRow) return null;

    const period = await resolvePeriod(periodId, tenantId, studentRow.sectionAcademicYear);
    if (!period || period.exams.length === 0) return null;

    const examIds = period.exams.map((exam) => exam.id);

    const schedulesRes = await pool.query<ScheduleRow>(
        `SELECT es.id            AS "scheduleId",
                e.id             AS "examId",
                e.name           AS "examName",
                sub.name         AS "subjectName",
                sub.code         AS "subjectCode",
                es.exam_date     AS "examDate",
                es.max_marks     AS "maxMarks",
                es.passing_marks AS "passingMarks"
         FROM exam_schedules es
         INNER JOIN exams e ON e.id = es.exam_id
         INNER JOIN subjects sub ON sub.id = es.subject_id AND sub.tenant_id = e.tenant_id
         WHERE es.exam_id = ANY($1::uuid[])
           AND es.grade_id = $2
           AND e.tenant_id = $3
           AND e.status = 'PUBLISHED'
         ORDER BY e.start_date ASC, es.exam_date ASC, sub.name ASC`,
        [examIds, studentRow.gradeId, tenantId],
    );
    const schedules = schedulesRes.rows;

    // The whole grade, so "class rank" really is a class rank and not a
    // section rank — exactly how the on-screen report card computes it.
    const peersRes = await pool.query<{ studentId: string; sectionId: string | null }>(
        `SELECT st.id         AS "studentId",
                st.section_id AS "sectionId"
         FROM students st
         WHERE st.grade_id = $1 AND st.tenant_id = $2 AND st.status = 'ACTIVE'`,
        [studentRow.gradeId, tenantId],
    );

    const resultsRes = await pool.query<ResultRow>(
        `SELECT sr.student_id       AS "studentId",
                sr.exam_schedule_id AS "scheduleId",
                sr.marks_obtained   AS "marksObtained",
                sr.is_absent        AS "isAbsent",
                sr.grade,
                sr.remarks
         FROM student_results sr
         INNER JOIN exam_schedules es ON es.id = sr.exam_schedule_id
         INNER JOIN exams e ON e.id = es.exam_id
         WHERE es.exam_id = ANY($1::uuid[])
           AND es.grade_id = $2
           AND sr.tenant_id = $3
           AND e.tenant_id = $3
           AND e.status = 'PUBLISHED'`,
        [examIds, studentRow.gradeId, tenantId],
    );

    const marksByStudent = new Map<string, Map<string, ResultRow>>();
    for (const row of resultsRes.rows) {
        const bucket = marksByStudent.get(row.studentId) ?? new Map<string, ResultRow>();
        bucket.set(row.scheduleId, row);
        marksByStudent.set(row.studentId, bucket);
    }

    const empty = new Map<string, ResultRow>();
    const gradeEntries = peersRes.rows.map((peer) => ({
        id: peer.studentId,
        sectionId: peer.sectionId,
        percentage: totalsFor(marksByStudent.get(peer.studentId) ?? empty, schedules).percentage,
    }));
    const sectionEntries = gradeEntries.filter(
        (entry) => studentRow.sectionId !== null && entry.sectionId === studentRow.sectionId,
    );

    const ownMarks = marksByStudent.get(studentId) ?? empty;

    const subjects: ReportCardSubjectRow[] = schedules.map((schedule) => {
        const mark = ownMarks.get(schedule.scheduleId);
        return {
            scheduleId: schedule.scheduleId,
            examId: schedule.examId,
            examName: schedule.examName,
            subjectName: schedule.subjectName,
            subjectCode: schedule.subjectCode,
            examDate: schedule.examDate,
            maxMarks: Number(schedule.maxMarks),
            passingMarks: Number(schedule.passingMarks),
            marksObtained:
                mark && mark.marksObtained !== null ? Number(mark.marksObtained) : null,
            isAbsent: Boolean(mark?.isAbsent),
            hasResult: Boolean(mark),
            grade: mark?.grade ?? null,
            remarks: mark?.remarks ?? null,
        };
    });

    return {
        school: {
            name: studentRow.schoolName,
            addressLine: [
                studentRow.schoolAddress,
                studentRow.schoolCity,
                studentRow.schoolState,
                studentRow.schoolPincode,
            ]
                .filter(Boolean)
                .join(', '),
            contactLine: [
                studentRow.schoolPhone ? `Phone: ${studentRow.schoolPhone}` : null,
                studentRow.schoolEmail ? `Email: ${studentRow.schoolEmail}` : null,
                studentRow.affiliationBoard ? `Board: ${studentRow.affiliationBoard}` : null,
                studentRow.udiseCode ? `UDISE: ${studentRow.udiseCode}` : null,
            ]
                .filter(Boolean)
                .join('  -  '),
        },
        student: {
            id: studentRow.studentId,
            fullName: `${studentRow.firstName} ${studentRow.lastName}`.trim(),
            admissionNumber: studentRow.admissionNumber,
            rollNumber: studentRow.rollNumber === null ? null : Number(studentRow.rollNumber),
            gradeId: studentRow.gradeId,
            gradeName: studentRow.gradeName,
            sectionId: studentRow.sectionId,
            sectionName: studentRow.sectionName,
        },
        period,
        subjects,
        totals: totalsFor(ownMarks, schedules),
        classRank: rankOf(gradeEntries, studentId),
        sectionRank: sectionEntries.length > 0 ? rankOf(sectionEntries, studentId) : null,
        gradeStudentCount: gradeEntries.length,
        sectionStudentCount: sectionEntries.length,
    };
}

/**
 * `[termId]` may be a real term or a single exam. Terms are tried first so that
 * an id collision (impossible in practice, but free to guard) resolves to the
 * broader document.
 */
async function resolvePeriod(
    periodId: string,
    tenantId: string,
    fallbackAcademicYear: string | null,
): Promise<ReportCardPeriod | null> {
    const termRes = await pool.query(
        `SELECT tm.id,
                tm.name,
                tm.start_date        AS "startDate",
                tm.end_date          AS "endDate",
                tm.academic_year_id  AS "academicYearId",
                ay.name              AS "academicYearName"
         FROM terms tm
         INNER JOIN academic_years ay ON ay.id = tm.academic_year_id AND ay.tenant_id = tm.tenant_id
         WHERE tm.id = $1 AND tm.tenant_id = $2`,
        [periodId, tenantId],
    );

    const term = termRes.rows[0];
    if (term) {
        const examsRes = await pool.query<{ id: string; name: string; startDate: Date | string }>(
            `SELECT e.id, e.name, e.start_date AS "startDate"
             FROM exams e
             WHERE e.tenant_id = $1
               AND e.academic_year_id = $2
               AND e.status = 'PUBLISHED'
               AND e.start_date >= $3
               AND e.start_date <= $4
             ORDER BY e.start_date ASC, e.name ASC`,
            [tenantId, term.academicYearId, term.startDate, term.endDate],
        );

        return {
            kind: 'TERM',
            id: term.id,
            name: term.name,
            academicYearName: term.academicYearName ?? fallbackAcademicYear,
            startDate: term.startDate,
            endDate: term.endDate,
            exams: examsRes.rows,
        };
    }

    const examRes = await pool.query(
        `SELECT e.id,
                e.name,
                e.start_date AS "startDate",
                e.end_date   AS "endDate",
                ay.name      AS "academicYearName"
         FROM exams e
         INNER JOIN academic_years ay ON ay.id = e.academic_year_id AND ay.tenant_id = e.tenant_id
         WHERE e.id = $1 AND e.tenant_id = $2 AND e.status = 'PUBLISHED'`,
        [periodId, tenantId],
    );

    const exam = examRes.rows[0];
    if (!exam) return null;

    return {
        kind: 'EXAM',
        id: exam.id,
        name: exam.name,
        academicYearName: exam.academicYearName ?? fallbackAcademicYear,
        startDate: exam.startDate,
        endDate: exam.endDate,
        exams: [{ id: exam.id, name: exam.name, startDate: exam.startDate }],
    };
}

export function reportCardPdfFilename(data: ReportCardPdfData): string {
    const who = filenameSlug(data.student.admissionNumber, data.student.id);
    const when = filenameSlug(data.period.name, data.period.id);
    return `report-card-${who}-${when}.pdf`;
}

function marksCell(subject: ReportCardSubjectRow): string {
    if (!subject.hasResult) return 'Not entered';
    if (subject.isAbsent) return 'Absent';
    if (subject.marksObtained === null) return 'Not entered';
    return String(subject.marksObtained);
}

function resultCell(subject: ReportCardSubjectRow): string {
    if (!subject.hasResult) return EMPTY;
    // Absent is a recorded outcome, not a missing one, so it is stated in the
    // result column too rather than left blank next to a blank mark.
    if (subject.isAbsent) return 'Absent';
    if (subject.marksObtained === null) return EMPTY;
    return subject.marksObtained >= subject.passingMarks ? 'Pass' : 'Fail';
}

export function renderReportCardPdf(data: ReportCardPdfData): Uint8Array {
    const { school, student, period, subjects, totals } = data;
    const multiExam = period.exams.length > 1;

    const builder = new PdfBuilder(
        `Report Card - ${student.fullName} - ${period.name}`,
        `Report card for ${student.fullName}, ${period.name}`,
    );

    drawLetterhead(builder, school);
    builder.text('REPORT CARD', { size: 12, bold: true, align: 'center', gap: 2 });
    builder.text(
        [period.name, period.academicYearName ? `Academic Year ${period.academicYearName}` : null]
            .filter(Boolean)
            .join('  -  '),
        { size: 9, color: MUTED, align: 'center', gap: 10 },
    );

    builder.fieldGrid(
        [
            { label: 'Student', value: orEmpty(student.fullName) },
            { label: 'Admission No.', value: orEmpty(student.admissionNumber) },
            {
                label: 'Class',
                value: orEmpty([student.gradeName, student.sectionName].filter(Boolean).join(' - ')),
            },
            {
                label: 'Roll No.',
                value: student.rollNumber === null ? EMPTY : String(student.rollNumber),
            },
        ],
        2,
    );

    builder.space(4);

    if (subjects.length === 0) {
        builder.banner(
            'No papers are scheduled for this class in the selected period, so no marks can be shown.',
        );
    } else {
        const columns: TableColumn[] = multiExam
            ? [
                { header: 'Subject', width: 0.28 },
                { header: 'Exam', width: 0.2 },
                { header: 'Date', width: 0.13 },
                { header: 'Max', width: 0.09, align: 'right' },
                { header: 'Obtained', width: 0.12, align: 'right' },
                { header: 'Grade', width: 0.09, align: 'center' },
                { header: 'Result', width: 0.09, align: 'center' },
            ]
            : [
                { header: 'Subject', width: 0.34 },
                { header: 'Date', width: 0.16 },
                { header: 'Max', width: 0.11, align: 'right' },
                { header: 'Passing', width: 0.11, align: 'right' },
                { header: 'Obtained', width: 0.13, align: 'right' },
                { header: 'Grade', width: 0.08, align: 'center' },
                { header: 'Result', width: 0.07, align: 'center' },
            ];

        const rows: TableRow[] = subjects.map((subject) => {
            const subjectLabel = subject.subjectCode
                ? `${subject.subjectName} (${subject.subjectCode})`
                : subject.subjectName;

            const cells = multiExam
                ? [
                    subjectLabel,
                    subject.examName,
                    formatPdfDate(subject.examDate),
                    String(subject.maxMarks),
                    marksCell(subject),
                    orEmpty(subject.grade),
                    resultCell(subject),
                ]
                : [
                    subjectLabel,
                    formatPdfDate(subject.examDate),
                    String(subject.maxMarks),
                    String(subject.passingMarks),
                    marksCell(subject),
                    orEmpty(subject.grade),
                    resultCell(subject),
                ];

            return { cells, note: subject.remarks ? `Remark: ${subject.remarks}` : undefined };
        });

        const totalRow: TableRow = {
            cells: multiExam
                ? [
                    'Total',
                    '',
                    '',
                    String(totals.totalMax),
                    String(totals.totalObtained),
                    '',
                    '',
                ]
                : [
                    'Total',
                    '',
                    String(totals.totalMax),
                    '',
                    String(totals.totalObtained),
                    '',
                    '',
                ],
            emphasis: true,
            band: true,
        };

        builder.table(columns, totals.subjectsEntered > 0 ? [...rows, totalRow] : rows);
    }

    builder.space(10);
    builder.sectionLabel('Summary');
    builder.fieldGrid(
        [
            {
                label: 'Subjects with results',
                value: `${totals.subjectsEntered} of ${subjects.length}`,
            },
            {
                label: 'Marks obtained',
                value:
                    totals.subjectsEntered > 0
                        ? `${totals.totalObtained} / ${totals.totalMax}`
                        : EMPTY,
            },
            {
                label: 'Percentage',
                value: totals.percentage === null ? EMPTY : `${totals.percentage}%`,
            },
            {
                label: 'Passed / Failed',
                value:
                    totals.subjectsEntered > 0
                        ? `${totals.subjectsPassed} / ${totals.subjectsFailed}`
                        : EMPTY,
            },
            {
                label: 'Class rank',
                value:
                    data.classRank === null
                        ? EMPTY
                        : `${data.classRank} of ${data.gradeStudentCount}`,
            },
            {
                label: 'Section rank',
                value:
                    data.sectionRank === null
                        ? EMPTY
                        : `${data.sectionRank} of ${data.sectionStudentCount}`,
            },
        ],
        3,
    );

    if (totals.subjectsEntered === 0 && subjects.length > 0) {
        builder.text(
            'No marks have been entered for this student in the selected period. Blank subjects are not counted as zero.',
            { size: 9, bold: true, color: WARN, gap: 4 },
        );
    } else if (totals.subjectsEntered > 0 && totals.subjectsFailed === 0) {
        builder.text('All subjects with entered results have been cleared.', {
            size: 9,
            bold: true,
            color: GOOD,
            gap: 4,
        });
    }

    if (multiExam) {
        builder.text(
            `Covers ${period.exams.length} published exams: ${period.exams.map((exam) => exam.name).join(', ')}.`,
            { size: 8, color: MUTED, gap: 4 },
        );
    }

    builder.signature(
        school.name,
        'This is a computer-generated report card covering published results only. Subjects shown as "Not entered" have no result on record and are excluded from totals.',
    );

    return builder.finish(`${school.name} - Report Card - ${student.fullName}`);
}
