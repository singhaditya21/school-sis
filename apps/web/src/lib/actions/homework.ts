'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

// ─── Get Assignments ─────────────────────────────────────────

export async function getAssignments(filters?: { gradeId?: string }) {
    const { tenantId } = await requireAuth('homework:read');

    let query = 'SELECT id, tenant_id AS "tenantId", title, description, subject_id AS "subjectId", grade_id AS "gradeId", section_id AS "sectionId", due_date AS "dueDate", assigned_by AS "assignedBy", max_marks AS "maxMarks", created_at AS "createdAt", updated_at AS "updatedAt" FROM homework_assignments WHERE tenant_id = $1';
    const params: string[] = [tenantId];

    if (filters?.gradeId) {
        params.push(filters.gradeId);
        query += ` AND grade_id = $${params.length}`;
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    return result.rows;
}

// ─── Create Assignment ──────────────────────────────────────

export async function createAssignment(data: {
    title: string;
    description?: string;
    subjectId?: string;
    gradeId?: string;
    sectionId?: string;
    dueDate: string;
    maxMarks?: number;
}) {
    const { tenantId, userId } = await requireAuth('homework:write');

    const result = await pool.query(
        `INSERT INTO homework_assignments (tenant_id, title, description, subject_id, grade_id, section_id, due_date, assigned_by, max_marks) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
         RETURNING id, tenant_id AS "tenantId", title, description, subject_id AS "subjectId", grade_id AS "gradeId", section_id AS "sectionId", due_date AS "dueDate", assigned_by AS "assignedBy", max_marks AS "maxMarks", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [tenantId, data.title, data.description, data.subjectId, data.gradeId, data.sectionId, data.dueDate, userId, data.maxMarks]
    );

    return { success: true, assignment: result.rows[0] };
}

// ─── Get Submissions ─────────────────────────────────────────

export async function getSubmissions(assignmentId: string) {
    const { tenantId } = await requireAuth('homework:read');

    const result = await pool.query(
        `SELECT 
            hs.id, 
            hs.student_id AS "studentId", 
            s.first_name || ' ' || s.last_name AS "studentName", 
            hs.submitted_at AS "submittedAt", 
            hs.content, 
            hs.marks, 
            hs.feedback 
         FROM homework_submissions hs
         LEFT JOIN students s ON hs.student_id = s.id
         WHERE hs.assignment_id = $1 AND hs.tenant_id = $2
         ORDER BY hs.submitted_at DESC`,
        [assignmentId, tenantId]
    );
    
    return result.rows;
}

// ─── Grade Submission ────────────────────────────────────────

export async function gradeSubmission(submissionId: string, marks: number, feedback?: string) {
    const { tenantId, userId } = await requireAuth('homework:write');

    await pool.query(
        `UPDATE homework_submissions 
         SET marks = $1, feedback = $2, graded_by = $3, graded_at = NOW() 
         WHERE id = $4 AND tenant_id = $5`,
        [marks, feedback, userId, submissionId, tenantId]
    );

    return { success: true };
}

// ─── Get Homework Stats ─────────────────────────────────────

export async function getHomeworkStats() {
    const { tenantId } = await requireAuth('homework:read');

    const assignmentCountResult = await pool.query(
        'SELECT COUNT(*) as c FROM homework_assignments WHERE tenant_id = $1',
        [tenantId]
    );

    const submissionCountResult = await pool.query(
        'SELECT COUNT(*) as c FROM homework_submissions WHERE tenant_id = $1',
        [tenantId]
    );

    const gradedCountResult = await pool.query(
        'SELECT COUNT(*) as c FROM homework_submissions WHERE tenant_id = $1 AND marks IS NOT NULL',
        [tenantId]
    );

    const totalAssignments = Number(assignmentCountResult.rows[0]?.c || 0);
    const totalSubmissions = Number(submissionCountResult.rows[0]?.c || 0);
    const gradedSubmissions = Number(gradedCountResult.rows[0]?.c || 0);

    return {
        totalAssignments,
        totalSubmissions,
        gradedSubmissions,
        pendingGrading: totalSubmissions - gradedSubmissions,
    };
}
