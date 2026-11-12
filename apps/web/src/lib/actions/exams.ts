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

async function assertTeacherAssignedToGrade(tenantId: string, userId: string, gradeId: string): Promise<void> {
    const assigned = await sql<{ id: string }>`
        SELECT sec.id
        FROM sections sec
        LEFT JOIN staff_profiles sp ON sp.user_id = ${userId} AND sp.tenant_id = ${tenantId}
        WHERE sec.tenant_id = ${tenantId}
          AND sec.grade_id = ${gradeId}
          AND (
              sec.class_teacher_id = ${userId}
              OR (sp.id IS NOT NULL AND sec.class_teacher_id = sp.id)
              OR EXISTS (
                  SELECT 1
                  FROM timetable_entries te
                  WHERE te.tenant_id = ${tenantId}
                    AND te.section_id = sec.id
                    AND (
                        te.teacher_id = ${userId}
                        OR (sp.id IS NOT NULL AND te.teacher_id = sp.id)
                    )
              )
          )
        LIMIT 1
    `;
    if (assigned.length === 0) {
        throw new Error('Unauthorized: Teacher is not assigned to this class or grade.');
    }
}

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
    const { tenantId, userId, session } = await requireAuth('exams:write');

    if (session.role === 'TEACHER') {
        await assertTeacherAssignedToGrade(tenantId, userId, data.gradeId);
    }

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
    const { tenantId, userId, session } = await requireAuth('exams:write');

    // Verify schedule belongs to tenant via its exam and exam is not published
    const scheduleRows = await sql<{ maxMarks: string; gradeId: string; examStatus: string }>`
        SELECT es.max_marks AS "maxMarks", es.grade_id AS "gradeId", e.status AS "examStatus"
        FROM exam_schedules es
        INNER JOIN exams e ON es.exam_id = e.id
        WHERE es.id = ${examScheduleId} AND e.tenant_id = ${tenantId}
    `;
    
    const schedule = scheduleRows[0];
    if (!schedule) {
        throw new Error('Exam schedule not found or unauthorized');
    }
    if (schedule.examStatus === 'PUBLISHED') {
        throw new Error('Cannot modify marks after exam results have been published.');
    }

    if (session.role === 'TEACHER') {
        await assertTeacherAssignedToGrade(tenantId, userId, schedule.gradeId);
    }

    const maxMarks = Number(schedule?.maxMarks || 100);

    for (const entry of marks) {
        if (session.role === 'TEACHER') {
            const studentScopeCheck = await sql<{ id: string }>`
                SELECT s.id
                FROM students s
                INNER JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = s.tenant_id
                LEFT JOIN staff_profiles sp ON sp.user_id = ${userId} AND sp.tenant_id = ${tenantId}
                WHERE s.id = ${entry.studentId}
                  AND s.tenant_id = ${tenantId}
                  AND COALESCE(s.custom_data->>'erased', 'false') <> 'true'
                  AND (
                      sec.class_teacher_id = ${userId}
                      OR (sp.id IS NOT NULL AND sec.class_teacher_id = sp.id)
                      OR EXISTS (
                          SELECT 1
                          FROM timetable_entries te
                          WHERE te.tenant_id = ${tenantId}
                            AND te.section_id = s.section_id
                            AND (
                                te.teacher_id = ${userId}
                                OR (sp.id IS NOT NULL AND te.teacher_id = sp.id)
                            )
                      )
                  )
                LIMIT 1
            `;
            if (studentScopeCheck.length === 0) {
                throw new Error('Unauthorized: Teachers can only enter marks for students in their assigned classes.');
            }
        } else {
            const tenantStudentCheck = await sql<{ id: string }>`
                SELECT id
                FROM students
                WHERE id = ${entry.studentId}
                  AND tenant_id = ${tenantId}
                  AND COALESCE(custom_data->>'erased', 'false') <> 'true'
                LIMIT 1
            `;
            if (tenantStudentCheck.length === 0) {
                throw new Error('Student not found or unauthorized');
            }
        }

        if (!entry.isAbsent && entry.marksObtained !== null) {
            if (!Number.isFinite(entry.marksObtained) || entry.marksObtained < 0 || entry.marksObtained > maxMarks) {
                throw new Error(`Marks obtained must be between 0 and ${maxMarks}.`);
            }
        }
        const normalizedMarks = entry.isAbsent ? null : entry.marksObtained;
        const percentage = normalizedMarks !== null ? (normalizedMarks / maxMarks) * 100 : 0;
        const grade = entry.isAbsent ? 'AB' : calculateGrade(percentage);

        // Check if result already exists and whether it is hash-locked
        const existingRows = await sql<{ id: string; isLocked: boolean }>`
            SELECT sr.id,
                   EXISTS (
                       SELECT 1 FROM exam_result_hashes erh
                       WHERE erh.result_id = sr.id AND erh.tenant_id = ${tenantId}
                   ) AS "isLocked"
            FROM student_results sr
            WHERE sr.exam_schedule_id = ${examScheduleId} AND sr.student_id = ${entry.studentId} AND sr.tenant_id = ${tenantId}
        `;

        const existing = existingRows[0];

        if (existing) {
            if (existing.isLocked) {
                throw new Error('Cannot overwrite cryptographically verified exam result.');
            }
            await sql`
                UPDATE student_results
                SET marks_obtained = ${normalizedMarks !== null ? String(normalizedMarks) : null},
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
                    ${normalizedMarks !== null ? String(normalizedMarks) : null},
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

async function verifyResultRowsForReviewer(
    tenantId: string,
    userId: string,
    resultIds: string[],
): Promise<number> {
    let lockedCount = 0;

    for (const resultId of resultIds) {
        const checkRows = await sql<{
            entered_by: string | null;
            already_locked: boolean;
        }>`
            SELECT sr.entered_by,
                   EXISTS (
                       SELECT 1 FROM exam_result_hashes erh
                       WHERE erh.result_id = sr.id AND erh.tenant_id = ${tenantId}
                   ) AS already_locked
            FROM student_results sr
            WHERE sr.id = ${resultId} AND sr.tenant_id = ${tenantId}
        `;
        const meta = checkRows[0];
        if (!meta || meta.already_locked) continue;
        if (meta.entered_by && meta.entered_by === userId) {
            throw new Error('Maker-checker policy violation: You cannot verify marks that you entered yourself.');
        }

        const rows = await sql<{
            student_id: string;
            exam_schedule_id: string;
            marks_obtained: string | null;
            grade: string | null;
            is_absent: boolean;
        }>`
            SELECT student_id, exam_schedule_id, marks_obtained, grade, is_absent
            FROM student_results
            WHERE id = ${resultId}
              AND tenant_id = ${tenantId}
              AND entered_by IS DISTINCT FROM ${userId}
        `;

        const result = rows[0];
        if (!result) continue;

        const payload = JSON.stringify({
            studentId: result.student_id,
            examScheduleId: result.exam_schedule_id,
            marksObtained: result.marks_obtained,
            grade: result.grade,
            isAbsent: result.is_absent,
        });
        const hash = createHash('sha256').update(payload).digest('hex');

        await sql`
            INSERT INTO exam_result_hashes (
                id, tenant_id, result_id, hash, locked_at, locked_by
            ) VALUES (${randomUUID()}, ${tenantId}, ${resultId}, ${hash}, NOW(), ${userId})
        `;
        lockedCount += 1;
    }

    return lockedCount;
}

export async function verifyExamResults(resultIds: string[]) {
    const { tenantId, userId } = await requireAuth('exams:review');
    const verified = await verifyResultRowsForReviewer(tenantId, userId, resultIds);
    return { success: true, verified };
}

export async function verifyExamResult(resultId: string) {
    const { tenantId, userId } = await requireAuth('exams:review');
    const verified = await verifyResultRowsForReviewer(tenantId, userId, [resultId]);
    return { success: true, verified };
}

export async function verifySubjectMarks(examScheduleId: string) {
    const { tenantId, userId } = await requireAuth('exams:review');

    const selfEntered = await sql<{ id: string }>`
        SELECT sr.id
        FROM student_results sr
        LEFT JOIN exam_result_hashes erh ON erh.result_id = sr.id AND erh.tenant_id = ${tenantId}
        WHERE sr.exam_schedule_id = ${examScheduleId}
          AND sr.tenant_id = ${tenantId}
          AND erh.id IS NULL
          AND sr.entered_by = ${userId}
        LIMIT 1
    `;
    if (selfEntered.length > 0) {
        throw new Error('Maker-checker policy violation: You cannot verify marks that you entered yourself.');
    }

    const eligibleRows = await sql<{ id: string }>`
        SELECT sr.id
        FROM student_results sr
        LEFT JOIN exam_result_hashes erh ON erh.result_id = sr.id AND erh.tenant_id = ${tenantId}
        WHERE sr.exam_schedule_id = ${examScheduleId}
          AND sr.tenant_id = ${tenantId}
          AND erh.id IS NULL
          AND sr.entered_by IS DISTINCT FROM ${userId}
    `;

    const verified = await verifyResultRowsForReviewer(
        tenantId,
        userId,
        eligibleRows.map((r) => r.id),
    );
    return { success: true, verified };
}

export async function rejectExamResults(resultIds: string[]) {
    const { tenantId, userId } = await requireAuth('exams:review');
    for (const resultId of resultIds) {
        const lockCheck = await sql<{ examStatus: string; isLocked: boolean }>`
            SELECT e.status AS "examStatus",
                   EXISTS (
                       SELECT 1 FROM exam_result_hashes erh
                       WHERE erh.result_id = sr.id AND erh.tenant_id = ${tenantId}
                   ) AS "isLocked"
            FROM student_results sr
            INNER JOIN exam_schedules es ON es.id = sr.exam_schedule_id
            INNER JOIN exams e ON e.id = es.exam_id
            WHERE sr.id = ${resultId} AND sr.tenant_id = ${tenantId}
        `;
        if (!lockCheck[0]) continue;
        if (lockCheck[0].examStatus === 'PUBLISHED' || lockCheck[0].isLocked) {
            throw new Error('Cannot reject published or hash-locked exam results.');
        }
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

export async function publishExamResults(examId: string) {
    const { tenantId, userId } = await requireAuth('exams:publish');

    const examRows = await sql<{ id: string; unverifiedCount: string }>`
        SELECT e.id,
               (
                   SELECT COUNT(*)
                   FROM student_results sr
                   INNER JOIN exam_schedules es ON es.id = sr.exam_schedule_id
                   LEFT JOIN exam_result_hashes erh ON erh.result_id = sr.id AND erh.tenant_id = e.tenant_id
                   WHERE es.exam_id = e.id
                     AND sr.tenant_id = e.tenant_id
                     AND erh.id IS NULL
               ) AS "unverifiedCount"
        FROM exams e
        WHERE e.id = ${examId} AND e.tenant_id = ${tenantId}
    `;

    const exam = examRows[0];
    if (!exam) {
        throw new Error('Exam not found or unauthorized');
    }
    if (Number(exam.unverifiedCount || 0) > 0) {
        throw new Error('Cannot publish exam results while unverified marks remain.');
    }

    await sql`
        UPDATE exams
        SET status = 'PUBLISHED',
            updated_at = NOW()
        WHERE id = ${examId} AND tenant_id = ${tenantId}
    `;

    await logAudit({
        tenantId,
        userId,
        action: 'UPDATE',
        entityType: 'exam_publication',
        entityId: examId,
        description: 'Published verified exam results',
    });

    return { success: true };
}
