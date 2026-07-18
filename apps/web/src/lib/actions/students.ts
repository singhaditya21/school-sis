'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

export interface StudentListItem {
    id: string;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    gender: string;
    status: string;
    gradeName: string;
    sectionName: string;
    className: string; // "Grade 1-A"
    guardianCount: number;
}

export async function getStudents(options?: {
    search?: string;
    gradeId?: string;
    status?: string;
    limit?: number;
    offset?: number;
}): Promise<{ students: StudentListItem[]; total: number }> {
    const { tenantId } = await requireAuth('students:read');

    const limit = options?.limit || 100;
    const offset = options?.offset || 0;

    const conditions: string[] = ['s.tenant_id = $1'];
    const params: string[] = [tenantId];
    let paramIndex = 2;

    if (options?.gradeId) {
        conditions.push(`s.grade_id = $${paramIndex}`);
        params.push(options.gradeId);
        paramIndex++;
    }

    if (options?.status) {
        conditions.push(`s.status = $${paramIndex}`);
        params.push(options.status);
        paramIndex++;
    }

    if (options?.search) {
        conditions.push(
            `(s.first_name ILIKE $${paramIndex} OR s.last_name ILIKE $${paramIndex} OR s.admission_number ILIKE $${paramIndex})`
        );
        params.push(`%${options.search}%`);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countQuery = `
        SELECT count(*) as count
        FROM students s
        WHERE ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count, 10);

    // Get students with grade/section info
    const studentsQuery = `
        SELECT 
            s.id,
            s.admission_number AS "admissionNumber",
            s.first_name AS "firstName",
            s.last_name AS "lastName",
            s.date_of_birth AS "dateOfBirth",
            s.gender,
            s.status,
            g.name AS "gradeName",
            sec.name AS "sectionName"
        FROM students s
        INNER JOIN grades g ON s.grade_id = g.id
        INNER JOIN sections sec ON s.section_id = sec.id
        WHERE ${whereClause}
        ORDER BY g.display_order ASC, sec.name ASC, s.first_name ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const studentsParams = [...params, limit, offset];
    
    const { rows } = await pool.query(studentsQuery, studentsParams);

    // Get guardian counts for these students
    const studentIds = rows.map(r => r.id);
    const guardianCounts: Record<string, number> = {};

    if (studentIds.length > 0) {
        const idParams = studentIds.map((_, i) => `$${i + 2}`).join(', ');
        const gcQuery = `
            SELECT student_id AS "studentId", count(*) as count
            FROM guardians
            WHERE tenant_id = $1 AND student_id IN (${idParams})
            GROUP BY student_id
        `;
        const gcParams = [tenantId, ...studentIds];
        const gcRows = await pool.query(gcQuery, gcParams);

        for (const gc of gcRows.rows) {
            guardianCounts[gc.studentId] = parseInt(gc.count, 10);
        }
    }

    const studentList: StudentListItem[] = rows.map(r => ({
        id: r.id,
        admissionNumber: r.admissionNumber,
        firstName: r.firstName,
        lastName: r.lastName,
        dateOfBirth: r.dateOfBirth,
        gender: r.gender,
        status: r.status,
        gradeName: r.gradeName,
        sectionName: r.sectionName,
        className: `${r.gradeName}-${r.sectionName}`,
        guardianCount: guardianCounts[r.id] || 0,
    }));

    return {
        students: studentList,
        total,
    };
}

export async function getGradesList() {
    const { tenantId } = await requireAuth('students:read');

    const query = `
        SELECT id, name, display_order AS "displayOrder"
        FROM grades
        WHERE tenant_id = $1
        ORDER BY display_order ASC
    `;
    const { rows } = await pool.query(query, [tenantId]);
    return rows;
}
