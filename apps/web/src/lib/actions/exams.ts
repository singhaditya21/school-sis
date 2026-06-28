'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { randomUUID, createHash } from 'crypto';
import { redirect } from 'next/navigation';

export interface ExamListItem {
    id: string;
    name: string;
    type: string;
    startDate: string;
    endDate: string;
    description: string | null;
    academicYearName: string;
    scheduleCount: number;
}

export interface ExamScheduleItem {
    id: string;
    gradeName: string;
    subjectName: string;
    examDate: string;
    startTime: string;
    endTime: string;
    maxMarks: string;
    passingMarks: string;
    roomNumber: string | null;
    resultCount: number;
}

export async function getExams(): Promise<ExamListItem[]> {
    const { tenantId } = await requireAuth('exams:read');

    const { rows } = await pool.query(`
        SELECT 
            e.id, 
            e.name, 
            e.type, 
            e.start_date AS "startDate", 
            e.end_date AS "endDate", 
            e.description, 
            ay.name AS "academicYearName"
        FROM exams e
        INNER JOIN academic_years ay ON e.academic_year_id = ay.id
        WHERE e.tenant_id = $1
        ORDER BY e.start_date DESC
    `, [tenantId]);

    const result: ExamListItem[] = [];
    for (const exam of rows) {
        const schedCountRes = await pool.query(`
            SELECT COUNT(*) AS count
            FROM exam_schedules
            WHERE exam_id = $1
        `, [exam.id]);

        result.push({ ...exam, scheduleCount: parseInt(schedCountRes.rows[0].count, 10) });
    }

    return result;
}

export async function getExamSchedules(examId: string): Promise<ExamScheduleItem[]> {
    const { tenantId } = await requireAuth('exams:read');

    const { rows } = await pool.query(`
        SELECT 
            es.id,
            g.name AS "gradeName",
            s.name AS "subjectName",
            es.exam_date AS "examDate",
            es.start_time AS "startTime",
            es.end_time AS "endTime",
            es.max_marks AS "maxMarks",
            es.passing_marks AS "passingMarks",
            es.room_number AS "roomNumber"
        FROM exam_schedules es
        INNER JOIN exams e ON es.exam_id = e.id
        INNER JOIN grades g ON es.grade_id = g.id
        INNER JOIN subjects s ON es.subject_id = s.id
        WHERE es.exam_id = $1 AND e.tenant_id = $2
        ORDER BY es.exam_date ASC, g.display_order ASC
    `, [examId, tenantId]);

    const result: ExamScheduleItem[] = [];
    for (const sched of rows) {
        const resultCountRes = await pool.query(`
            SELECT COUNT(*) AS count
            FROM student_results
            WHERE exam_schedule_id = $1
        `, [sched.id]);

        result.push({ ...sched, resultCount: parseInt(resultCountRes.rows[0].count, 10) });
    }

    return result;
}

export async function getExamResults(examScheduleId: string) {
    const { tenantId } = await requireAuth('exams:read');

    const { rows } = await pool.query(`
        SELECT 
            sr.id,
            s.first_name AS "studentFirstName",
            s.last_name AS "studentLastName",
            s.admission_number AS "admissionNumber",
            sr.marks_obtained AS "marksObtained",
            sr.grade,
            sr.remarks,
            sr.is_absent AS "isAbsent"
        FROM student_results sr
        INNER JOIN students s ON sr.student_id = s.id
        WHERE sr.exam_schedule_id = $1 AND sr.tenant_id = $2
        ORDER BY s.first_name ASC
    `, [examScheduleId, tenantId]);

    return rows;
}

// ─── Create Exam ─────────────────────────────────────────────

export async function createExam(formData: FormData): Promise<void> {
    const { tenantId } = await requireAuth('exams:write');

    const name = formData.get('name') as string;
    const type = formData.get('type') as string;
    const academicYearId = formData.get('academicYearId') as string;
    const startDate = formData.get('startDate') as string;
    const endDate = formData.get('endDate') as string;
    const description = formData.get('description') as string | null;

    if (!name || !type || !academicYearId || !startDate || !endDate) {
        throw new Error('Missing required fields');
    }

    const examId = randomUUID();
    await pool.query(`
        INSERT INTO exams (
            id, tenant_id, academic_year_id, name, type, start_date, end_date, description
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [examId, tenantId, academicYearId, name, type, startDate, endDate, description]);

    redirect(`/exams/${examId}`);
}

// ─── Add Exam Schedule ───────────────────────────────────────

export async function addExamSchedule(data: {
    examId: string;
    gradeId: string;
    subjectId: string;
    examDate: string;
    startTime: string;
    endTime: string;
    maxMarks: number;
    passingMarks: number;
    roomNumber?: string;
}) {
    const { tenantId } = await requireAuth('exams:write');

    // Verify exam belongs to tenant
    const examCheck = await pool.query(
        `SELECT id FROM exams WHERE id = $1 AND tenant_id = $2`,
        [data.examId, tenantId]
    );
    if (examCheck.rows.length === 0) {
        throw new Error('Exam not found or unauthorized');
    }

    // Verify grade belongs to tenant
    const gradeCheck = await pool.query(
        `SELECT id FROM grades WHERE id = $1 AND tenant_id = $2`,
        [data.gradeId, tenantId]
    );
    if (gradeCheck.rows.length === 0) {
        throw new Error('Grade not found or unauthorized');
    }

    // Verify subject belongs to tenant
    const subjectCheck = await pool.query(
        `SELECT id FROM subjects WHERE id = $1 AND tenant_id = $2`,
        [data.subjectId, tenantId]
    );
    if (subjectCheck.rows.length === 0) {
        throw new Error('Subject not found or unauthorized');
    }

    await pool.query(`
        INSERT INTO exam_schedules (
            id, exam_id, grade_id, subject_id, exam_date, start_time, end_time, max_marks, passing_marks, room_number
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
        randomUUID(),
        data.examId,
        data.gradeId,
        data.subjectId,
        data.examDate,
        data.startTime,
        data.endTime,
        String(data.maxMarks),
        String(data.passingMarks),
        data.roomNumber || null
    ]);

    return { success: true };
}

// ─── Save Marks ──────────────────────────────────────────────

function calculateGrade(percentage: number): string {
    if (percentage >= 90) return 'A+';
    if (percentage >= 80) return 'A';
    if (percentage >= 70) return 'B+';
    if (percentage >= 60) return 'B';
    if (percentage >= 50) return 'C';
    if (percentage >= 40) return 'D';
    return 'F';
}

export async function saveMarks(
    examScheduleId: string,
    marks: { studentId: string; marksObtained: number | null; isAbsent: boolean; remarks?: string }[],
) {
    const { tenantId, userId } = await requireAuth('exams:write');

    // Verify schedule belongs to tenant via its exam
    const scheduleRes = await pool.query(`
        SELECT es.max_marks AS "maxMarks"
        FROM exam_schedules es
        INNER JOIN exams e ON es.exam_id = e.id
        WHERE es.id = $1 AND e.tenant_id = $2
    `, [examScheduleId, tenantId]);
    
    const schedule = scheduleRes.rows[0];
    if (!schedule) {
        throw new Error('Exam schedule not found or unauthorized');
    }
    const maxMarks = Number(schedule?.maxMarks || 100);

    for (const entry of marks) {
        const percentage = entry.marksObtained !== null ? (entry.marksObtained / maxMarks) * 100 : 0;
        const grade = entry.isAbsent ? 'AB' : calculateGrade(percentage);

        // Check if result already exists
        const existingRes = await pool.query(`
            SELECT id
            FROM student_results
            WHERE exam_schedule_id = $1 AND student_id = $2 AND tenant_id = $3
        `, [examScheduleId, entry.studentId, tenantId]);

        const existing = existingRes.rows[0];

        if (existing) {
            await pool.query(`
                UPDATE student_results
                SET marks_obtained = $1,
                    grade = $2,
                    is_absent = $3,
                    remarks = $4,
                    entered_by = $5,
                    updated_at = NOW()
                WHERE id = $6 AND tenant_id = $7
            `, [
                entry.marksObtained !== null ? String(entry.marksObtained) : null,
                grade,
                entry.isAbsent,
                entry.remarks || null,
                userId,
                existing.id,
                tenantId
            ]);
        } else {
            await pool.query(`
                INSERT INTO student_results (
                    id, tenant_id, exam_schedule_id, student_id, marks_obtained, grade, is_absent, remarks, entered_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
                randomUUID(),
                tenantId,
                examScheduleId,
                entry.studentId,
                entry.marksObtained !== null ? String(entry.marksObtained) : null,
                grade,
                entry.isAbsent,
                entry.remarks || null,
                userId
            ]);
        }
    }

    return { success: true };
}

// ─── Exam Analytics ──────────────────────────────────────────

export interface ExamAnalytics {
    examName: string;
    totalStudents: number;
    appeared: number;
    passed: number;
    failed: number;
    passRate: number;
    classAverage: number;
    topScore: number;
    subjectBreakdown: {
        subjectName: string;
        gradeName: string;
        average: number;
        passRate: number;
        topMarks: number;
        maxMarks: number;
    }[];
}

export async function getExamAnalytics(examId: string): Promise<ExamAnalytics | null> {
    const { tenantId } = await requireAuth('exams:read');

    const examRes = await pool.query(`
        SELECT name
        FROM exams
        WHERE id = $1 AND tenant_id = $2
    `, [examId, tenantId]);

    const exam = examRes.rows[0];
    if (!exam) return null;

    const schedulesRes = await pool.query(`
        SELECT 
            es.id,
            g.name AS "gradeName",
            s.name AS "subjectName",
            es.max_marks AS "maxMarks",
            es.passing_marks AS "passingMarks"
        FROM exam_schedules es
        INNER JOIN grades g ON es.grade_id = g.id
        INNER JOIN subjects s ON es.subject_id = s.id
        WHERE es.exam_id = $1
    `, [examId]);
    
    const schedules = schedulesRes.rows;

    let totalStudents = 0;
    let appeared = 0;
    let passed = 0;
    let allMarks: number[] = [];
    const subjectBreakdown: ExamAnalytics['subjectBreakdown'] = [];

    for (const sched of schedules) {
        const resultsRes = await pool.query(`
            SELECT 
                marks_obtained AS "marksObtained",
                is_absent AS "isAbsent"
            FROM student_results
            WHERE exam_schedule_id = $1
        `, [sched.id]);
        
        const results = resultsRes.rows;

        totalStudents += results.length;
        const schedAppeared = results.filter(r => !r.isAbsent);
        appeared += schedAppeared.length;

        const marks = schedAppeared
            .filter(r => r.marksObtained !== null)
            .map(r => Number(r.marksObtained));

        const passingMarks = Number(sched.passingMarks);
        const schedPassed = marks.filter(m => m >= passingMarks).length;
        passed += schedPassed;

        allMarks = [...allMarks, ...marks];

        const maxMarks = Number(sched.maxMarks);
        subjectBreakdown.push({
            subjectName: sched.subjectName,
            gradeName: sched.gradeName,
            average: marks.length > 0 ? Math.round(marks.reduce((s, m) => s + m, 0) / marks.length * 10) / 10 : 0,
            passRate: schedAppeared.length > 0 ? Math.round((schedPassed / schedAppeared.length) * 100) : 0,
            topMarks: marks.length > 0 ? Math.max(...marks) : 0,
            maxMarks,
        });
    }

    const failed = appeared - passed;

    return {
        examName: exam.name,
        totalStudents,
        appeared,
        passed,
        failed,
        passRate: appeared > 0 ? Math.round((passed / appeared) * 100) : 0,
        classAverage: allMarks.length > 0 ? Math.round(allMarks.reduce((s, m) => s + m, 0) / allMarks.length * 10) / 10 : 0,
        topScore: allMarks.length > 0 ? Math.max(...allMarks) : 0,
        subjectBreakdown,
    };
}

export async function getAdvancedGradebook(subjectId: string, gradeId: string) {
    let auth;
    try {
        auth = await requireAuth('exams:read');
    } catch {
        auth = await requireAuth('gradebook:read');
    }
    const { tenantId } = auth;

    // Verify grade belongs to tenant
    const gradeCheck = await pool.query(
        `SELECT id FROM grades WHERE id = $1 AND tenant_id = $2`,
        [gradeId, tenantId]
    );
    if (gradeCheck.rows.length === 0) {
        throw new Error('Grade not found or unauthorized');
    }

    // Verify subject belongs to tenant
    const subjectCheck = await pool.query(
        `SELECT id FROM subjects WHERE id = $1 AND tenant_id = $2`,
        [subjectId, tenantId]
    );
    if (subjectCheck.rows.length === 0) {
        throw new Error('Subject not found or unauthorized');
    }

    // 1. Get all students in the grade
    const classStudentsRes = await pool.query(`
        SELECT 
            id,
            first_name AS "firstName",
            last_name AS "lastName",
            admission_number AS "admissionNumber"
        FROM students
        WHERE grade_id = $1 AND tenant_id = $2
    `, [gradeId, tenantId]);
    const classStudents = classStudentsRes.rows;

    // 2. Get all exam schedules for this subject and grade
    const schedulesRes = await pool.query(`
        SELECT 
            es.id,
            e.name AS "examName",
            e.type AS "examType",
            es.max_marks AS "maxMarks"
        FROM exam_schedules es
        INNER JOIN exams e ON es.exam_id = e.id
        WHERE es.subject_id = $1 AND es.grade_id = $2 AND e.tenant_id = $3
    `, [subjectId, gradeId, tenantId]);
    const schedules = schedulesRes.rows;

    // 3. Get all results for these schedules
    const resultsByStudent: Record<string, Record<string, number>> = {};
    for (const s of classStudents) {
        resultsByStudent[s.id] = {};
    }

    for (const sched of schedules) {
        const schedResultsRes = await pool.query(`
            SELECT 
                student_id AS "studentId",
                marks_obtained AS "marksObtained"
            FROM student_results
            WHERE exam_schedule_id = $1 AND tenant_id = $2
        `, [sched.id, tenantId]);
        
        for (const r of schedResultsRes.rows) {
            if (resultsByStudent[r.studentId]) {
                resultsByStudent[r.studentId][sched.id] = Number(r.marksObtained || 0);
            }
        }
    }

    // 4. Compute totals, average, standard deviation
    const rows = classStudents.map(student => {
        let total = 0;
        const examScores: Record<string, number> = {};
        for (const sched of schedules) {
            const score = resultsByStudent[student.id]?.[sched.id] || 0;
            examScores[sched.examType] = score; // Map by examType for simplicity in UI
            total += score;
        }
        return {
            student,
            examScores,
            total,
            absoluteGrade: calculateGrade((total / (schedules.reduce((acc, s) => acc + Number(s.maxMarks), 0) || 100)) * 100),
            zScore: 0,
            relativeGrade: '',
        };
    });

    const totals = rows.map(r => r.total);
    const average = totals.length > 0 ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
    const variance = totals.length > 0 ? totals.reduce((a, b) => a + Math.pow(b - average, 2), 0) / totals.length : 0;
    const stdDev = Math.sqrt(variance);

    for (const row of rows) {
        row.zScore = stdDev > 0 ? Math.round(((row.total - average) / stdDev) * 100) / 100 : 0;
        row.relativeGrade = getRelativeGrade(row.zScore);
    }

    return {
        schedules,
        rows,
        stats: {
            average: Math.round(average * 10) / 10,
            stdDev: Math.round(stdDev * 10) / 10,
            highest: totals.length > 0 ? Math.max(...totals) : 0,
            failing: rows.filter(r => r.absoluteGrade === 'F' || r.absoluteGrade === 'D').length,
        }
    };
}

function getRelativeGrade(z: number): string {
    if (z >= 1.5) return 'A+';
    if (z >= 0.5) return 'A';
    if (z >= -0.5) return 'B';
    if (z >= -1.5) return 'C';
    return 'D';
}

// ─── Exam Verification & Compliance ──────────────────────────

export async function getPendingVerifications() {
    const { tenantId } = await requireAuth('exams:read');
    
    const { rows } = await pool.query(`
        SELECT 
            sr.id AS "markId",
            s.first_name || ' ' || s.last_name AS "studentName",
            sub.name AS "subject",
            sr.marks_obtained AS "marksObtained",
            es.max_marks AS "maxMarks",
            u.first_name || ' ' || u.last_name AS "enteredBy",
            sr.created_at AS "enteredAt"
        FROM student_results sr
        INNER JOIN students s ON sr.student_id = s.id
        INNER JOIN exam_schedules es ON sr.exam_schedule_id = es.id
        INNER JOIN subjects sub ON es.subject_id = sub.id
        LEFT JOIN users u ON sr.entered_by = u.id
        LEFT JOIN exam_result_hashes erh ON sr.id = erh.result_id
        WHERE sr.tenant_id = $1 AND erh.id IS NULL
        ORDER BY sr.created_at ASC
    `, [tenantId]);
    
    // Convert Dates to strings for Client Component
    return rows.map(r => ({
        ...r,
        enteredAt: r.enteredAt ? new Date(r.enteredAt).toISOString().split('T')[0] : null
    }));
}

export async function getVerificationStats() {
    const { tenantId } = await requireAuth('exams:read');
    
    const pendingRes = await pool.query(`
        SELECT COUNT(*) as count 
        FROM student_results sr
        LEFT JOIN exam_result_hashes erh ON sr.id = erh.result_id
        WHERE sr.tenant_id = $1 AND erh.id IS NULL
    `, [tenantId]);
    
    const verifiedRes = await pool.query(`
        SELECT COUNT(*) as count 
        FROM exam_result_hashes
        WHERE tenant_id = $1
    `, [tenantId]);
    
    return {
        pending: parseInt(pendingRes.rows[0].count, 10),
        verified: parseInt(verifiedRes.rows[0].count, 10),
        rejected: 0 // Mocked since we don't track rejections formally yet
    };
}

export async function verifyExamResults(resultIds: string[]) {
    const { tenantId, userId } = await requireAuth('exams:write');
    
    for (const resultId of resultIds) {
        const res = await pool.query(`
            SELECT * FROM student_results WHERE id = $1 AND tenant_id = $2
        `, [resultId, tenantId]);
        
        const result = res.rows[0];
        if (!result) continue;
        
        const payload = JSON.stringify({
            studentId: result.student_id,
            examScheduleId: result.exam_schedule_id,
            marksObtained: result.marks_obtained,
            grade: result.grade,
            isAbsent: result.is_absent
        });
        const hash = createHash('sha256').update(payload).digest('hex');
        
        await pool.query(`
            INSERT INTO exam_result_hashes (
                id, tenant_id, result_id, hash, locked_at, locked_by
            ) VALUES ($1, $2, $3, $4, NOW(), $5)
        `, [randomUUID(), tenantId, resultId, hash, userId]);
    }
    
    return { success: true };
}

export async function rejectExamResults(resultIds: string[]) {
    const { tenantId } = await requireAuth('exams:write');
    // For now we just delete rejected results to force re-entry
    for (const resultId of resultIds) {
        await pool.query(`
            DELETE FROM student_results WHERE id = $1 AND tenant_id = $2
        `, [resultId, tenantId]);
    }
    return { success: true };
}

export async function getProctoringLogs() {
    const { tenantId } = await requireAuth('exams:read');
    
    const { rows } = await pool.query(`
        SELECT 
            epl.id,
            s.first_name || ' ' || s.last_name AS "studentName",
            e.name AS "examName",
            sub.name AS "subject",
            epl.flag_type AS "flagType",
            epl.description,
            epl.timestamp
        FROM exam_proctoring_logs epl
        INNER JOIN students s ON epl.student_id = s.id
        INNER JOIN exam_schedules es ON epl.exam_schedule_id = es.id
        INNER JOIN exams e ON es.exam_id = e.id
        INNER JOIN subjects sub ON es.subject_id = sub.id
        WHERE epl.tenant_id = $1
        ORDER BY epl.timestamp DESC
        LIMIT 50
    `, [tenantId]);
    
    return rows.map(r => ({
        ...r,
        timestamp: r.timestamp ? new Date(r.timestamp).toLocaleString() : null
    }));
}

