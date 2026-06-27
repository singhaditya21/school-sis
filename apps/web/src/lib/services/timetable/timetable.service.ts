'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

/**
 * Retrieves all teachers who could be candidates for substitutions.
 * Enforces tenant isolation and checks permissions (timetable:read or substitution:read).
 */
export async function getSubstitutionTeachers(): Promise<any[]> {
    let auth;
    try {
        auth = await requireAuth('timetable:read');
    } catch {
        auth = await requireAuth('substitution:read');
    }
    const { tenantId } = auth;

    const { rows } = await pool.query(
        `SELECT u.id, u.first_name || ' ' || u.last_name AS name, COALESCE(sd.name, 'Teacher') AS subject, u.is_active AS available
         FROM users u
         LEFT JOIN staff_profiles sp ON sp.user_id = u.id
         LEFT JOIN staff_departments sd ON sd.id = sp.department_id
         WHERE u.tenant_id = $1 AND u.role = 'TEACHER'
         ORDER BY u.first_name`,
        [tenantId]
    );

    return rows;
}

/**
 * Retrieves substitution requests for the tenant.
 * Enforces tenant isolation and checks permissions (timetable:read or substitution:read).
 */
export async function getSubstitutionRequests(): Promise<any[]> {
    let auth;
    try {
        auth = await requireAuth('timetable:read');
    } catch {
        auth = await requireAuth('substitution:read');
    }
    const { tenantId } = auth;

    const { rows } = await pool.query(
        `SELECT sr.id, u.first_name || ' ' || u.last_name AS "originalTeacher", sr.reason,
                g.name || '-' || sec.name AS class, sr.period, sr.date,
                sub_u.first_name || ' ' || sub_u.last_name AS substitute, sr.status
         FROM substitution_requests sr
         JOIN users u ON u.id = sr.teacher_id
         LEFT JOIN users sub_u ON sub_u.id = sr.substitute_id
         LEFT JOIN sections sec ON sec.id = sr.section_id
         LEFT JOIN grades g ON g.id = sec.grade_id
         WHERE sr.tenant_id = $1
         ORDER BY sr.date DESC LIMIT 50`,
        [tenantId]
    );

    return rows;
}
