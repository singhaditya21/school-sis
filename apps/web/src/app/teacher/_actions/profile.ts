'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

/**
 * The teacher's own record.
 *
 * Only two tables hold anything about a member of staff: `users` (always
 * present) and `staff_profiles` (present only once HR has onboarded them).
 * Everything nullable below is genuinely absent when HR has not filled it in —
 * the page says so rather than inventing an employee id or a qualification.
 */

export interface TeacherProfile {
    userId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    role: string;
    isActive: boolean;
    lastLoginAt: string | null;
    /** Null when this teacher has no staff_profiles row at all. */
    employeeId: string | null;
    departmentName: string | null;
    designationName: string | null;
    employmentType: string | null;
    staffStatus: string | null;
    joiningDate: string | null;
    qualification: string | null;
    specialization: string | null;
    experienceYears: number | null;
    hasStaffRecord: boolean;
}

export async function getMyProfile(): Promise<TeacherProfile | null> {
    const { tenantId, userId } = await requireAuth('profile:read');

    const { rows } = await pool.query(
        `SELECT
            u.id AS "userId",
            u.first_name AS "firstName",
            u.last_name AS "lastName",
            u.email,
            u.phone,
            u.role,
            u.is_active AS "isActive",
            u.last_login_at::text AS "lastLoginAt",
            sp.employee_id AS "employeeId",
            dept.name AS "departmentName",
            desig.name AS "designationName",
            sp.employment_type AS "employmentType",
            sp.status AS "staffStatus",
            sp.joining_date::text AS "joiningDate",
            sp.qualification,
            sp.specialization,
            sp.experience_years AS "experienceYears",
            (sp.id IS NOT NULL) AS "hasStaffRecord"
         FROM users u
         LEFT JOIN staff_profiles sp ON sp.user_id = u.id AND sp.tenant_id = u.tenant_id
         LEFT JOIN staff_departments dept ON dept.id = sp.department_id AND dept.tenant_id = u.tenant_id
         LEFT JOIN designations desig ON desig.id = sp.designation_id AND desig.tenant_id = u.tenant_id
         WHERE u.id = $2 AND u.tenant_id = $1`,
        [tenantId, userId]
    );

    return rows[0] ?? null;
}
