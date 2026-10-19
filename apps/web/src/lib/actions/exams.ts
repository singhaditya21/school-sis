'use server';

import { sql } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { logAudit } from '@/lib/audit';
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

export async function getExams(): Promise<ExamListItem[]> {
    const { tenantId } = await requireAuth('exams:read');

    const rows = await sql<{
        id: string;
        name: string;
        type: string;
        startDate: string;
        endDate: string;
        description: string | null;
        academicYearName: string;
    }>`
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
        WHERE e.tenant_id = ${tenantId}
        ORDER BY e.start_date DESC
    `;

    const result: ExamListItem[] = [];
    for (const exam of rows) {
        const schedCountRows = await sql<{ count: string }>`
            SELECT COUNT(*) AS count
            FROM exam_schedules
            WHERE exam_id = ${exam.id}
        `;

        result.push({ ...exam, scheduleCount: parseInt(schedCountRows[0].count, 10) });
    }

    return result;
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
    await sql`
        INSERT INTO exams (
            id, tenant_id, academic_year_id, name, type, start_date, end_date, description
        ) VALUES (${examId}, ${tenantId}, ${academicYearId}, ${name}, ${type}, ${startDate}, ${endDate}, ${description})
    `;

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
    const examCheck = await sql<{ id: string }>`
        SELECT id FROM exams WHERE id = ${data.examId} AND tenant_id = ${tenantId}
    `;
    if (examCheck.length === 0) {
        throw new Error('Exam not found or unauthorized');
    }

    // Verify grade belongs to tenant
    const gradeCheck = await sql<{ id: string }>`
        SELECT id FROM grades WHERE id = ${data.gradeId} AND tenant_id = ${tenantId}
    `;
    if (gradeCheck.length === 0) {
        throw new Error('Grade not found or unauthorized');
    }

    // Verify subject belongs to tenant
    const subjectCheck = await sql<{ id: string }>`
        SELECT id FROM subjects WHERE id = ${data.subjectId} AND tenant_id = ${tenantId}
    `;
    if (subjectCheck.length === 0) {
        throw new Error('Subject not found or unauthorized');
    }

    await sql`
        INSERT INTO exam_schedules (
            id, exam_id, grade_id, subject_id, exam_date, start_time, end_time, max_marks, passing_marks, room_number
        ) VALUES (
            ${randomUUID()},
            ${data.examId},
            ${data.gradeId},
            ${data.subjectId},
            ${data.examDate},
            ${data.startTime},
            ${data.endTime},
            ${String(data.maxMarks)},
            ${String(data.passingMarks)},
            ${data.roomNumber || null}
        )
    `;

    await sql`
        UPDATE exams
        SET status = CASE WHEN status = 'DRAFT' THEN 'SCHEDULED' ELSE status END,
            updated_at = NOW()
        WHERE id = ${data.examId} AND tenant_id = ${tenantId}
    `;

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
    const scheduleRows = await sql<{ maxMarks: string }>`
        SELECT es.max_marks AS "maxMarks"
        FROM exam_schedules es
        INNER JOIN exams e ON es.exam_id = e.id
        WHERE es.id = ${examScheduleId} AND e.tenant_id = ${tenantId}
    `;
    
    const schedule = scheduleRows[0];
    if (!schedule) {
        throw new Error('Exam schedule not found or unauthorized');
    }
    const maxMarks = Number(schedule?.maxMarks || 100);

    for (const entry of marks) {
        const percentage = entry.marksObtained !== null ? (entry.marksObtained / maxMarks) * 100 : 0;
        const grade = entry.isAbsent ? 'AB' : calculateGrade(percentage);

        // Check if result already exists
        const existingRows = await sql<{ id: string }>`
            SELECT id
            FROM student_results
            WHERE exam_schedule_id = ${examScheduleId} AND student_id = ${entry.studentId} AND tenant_id = ${tenantId}
        `;

        const existing = existingRows[0];

        if (existing) {
            await sql`
                UPDATE student_results
                SET marks_obtained = ${entry.marksObtained !== null ? String(entry.marksObtained) : null},
                    grade = ${grade},
                    is_absent = ${entry.isAbsent},
                    remarks = ${entry.remarks || null},
                    entered_by = ${userId},
                    updated_at = NOW()
                WHERE id = ${existing.id} AND tenant_id = ${tenantId}
            `;
        } else {
            await sql`
                INSERT INTO student_results (
                    id, tenant_id, exam_schedule_id, student_id, marks_obtained, grade, is_absent, remarks, entered_by
                ) VALUES (
                    ${randomUUID()},
                    ${tenantId},
                    ${examScheduleId},
                    ${entry.studentId},
                    ${entry.marksObtained !== null ? String(entry.marksObtained) : null},
                    ${grade},
                    ${entry.isAbsent},
                    ${entry.remarks || null},
                    ${userId}
                )
            `;
        }
    }

    await sql`
        UPDATE exams e
        SET status = 'RESULT_REVIEW',
            updated_at = NOW()
        FROM exam_schedules es
        WHERE es.exam_id = e.id
          AND es.id = ${examScheduleId}
          AND e.tenant_id = ${tenantId}
          AND e.status IN ('DRAFT', 'SCHEDULED', 'MARKS_ENTRY', 'RESULT_REVIEW')
    `;

    return { success: true };
}

// ─── Exam Verification & Compliance ──────────────────────────

export async function verifyExamResults(resultIds: string[]) {
    const { tenantId, userId } = await requireAuth('exams:write');
    
    for (const resultId of resultIds) {
        const rows = await sql<{
            student_id: string;
            exam_schedule_id: string;
            marks_obtained: string | null;
            grade: string | null;
            is_absent: boolean;
        }>`
            SELECT student_id, exam_schedule_id, marks_obtained, grade, is_absent
            FROM student_results
            WHERE id = ${resultId} AND tenant_id = ${tenantId}
        `;
        
        const result = rows[0];
        if (!result) continue;
        
        const payload = JSON.stringify({
            studentId: result.student_id,
            examScheduleId: result.exam_schedule_id,
            marksObtained: result.marks_obtained,
            grade: result.grade,
            isAbsent: result.is_absent
        });
        const hash = createHash('sha256').update(payload).digest('hex');
        
        await sql`
            INSERT INTO exam_result_hashes (
                id, tenant_id, result_id, hash, locked_at, locked_by
            ) VALUES (${randomUUID()}, ${tenantId}, ${resultId}, ${hash}, NOW(), ${userId})
        `;
    }
    
    return { success: true };
}

export async function rejectExamResults(resultIds: string[]) {
    const { tenantId, userId } = await requireAuth('exams:write');
    for (const resultId of resultIds) {
        await sql`
            DELETE FROM student_results WHERE id = ${resultId} AND tenant_id = ${tenantId}
        `;
        await logAudit({
            tenantId,
            userId,
            action: 'DELETE',
            entityType: 'student_result_rejection',
            entityId: resultId,
            description: 'Rejected exam result during verification for re-entry',
        });
    }
    return { success: true };
}
