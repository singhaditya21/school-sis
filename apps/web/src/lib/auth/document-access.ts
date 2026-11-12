import { pool } from '@/lib/db';
import { hasPermission, type UserRole } from '@/lib/rbac/permissions';

/**
 * Who may fetch a document about a particular student.
 *
 * The receipt and report-card PDF routes guard only with requireApiAuth, which
 * proves a valid session in the tenant and nothing more. That was harmless while
 * both routes returned 501; now that they render real documents it would let any
 * signed-in user — a parent, or a student — pull any other child's report card or
 * any other family's fee receipt in the same school.
 *
 * Staff are authorised by permission. Everyone else must prove a relationship to
 * the student, in SQL, against the caller's own tenant.
 */
export async function canAccessStudentDocument(input: {
    tenantId: string;
    userId: string;
    role: string;
    studentId: string;
    staffPermission: string;
}): Promise<boolean> {
    // Staff route: TEACHER is restricted to students in their assigned sections/classes;
    // other authorized staff roles hold tenant-scoped document permission.
    if (input.role === 'TEACHER') {
        if (hasPermission(input.role as UserRole, input.staffPermission)) {
            const teacherAssigned = await pool.query(
                `SELECT 1
                   FROM students s
                   LEFT JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = s.tenant_id
                   LEFT JOIN staff_profiles sp ON sp.tenant_id = s.tenant_id AND sp.user_id = $3
                  WHERE s.tenant_id = $1
                    AND s.id = $2
                    AND (
                      sec.class_teacher_id = $3
                      OR (sp.id IS NOT NULL AND sec.class_teacher_id = sp.id)
                      OR EXISTS (
                        SELECT 1
                          FROM timetable_entries te
                         WHERE te.tenant_id = s.tenant_id
                           AND te.section_id = s.section_id
                           AND (te.teacher_id = $3 OR (sp.id IS NOT NULL AND te.teacher_id = sp.id))
                      )
                    )
                  LIMIT 1`,
                [input.tenantId, input.studentId, input.userId],
            );
            if ((teacherAssigned.rowCount ?? teacherAssigned.rows?.length ?? 0) > 0) {
                return true;
            }
        }
    } else if (hasPermission(input.role as UserRole, input.staffPermission)) {
        return true;
    }

    // A guardian may read documents about their own children.
    const guardian = await pool.query(
        `SELECT 1
           FROM guardians
          WHERE tenant_id = $1 AND student_id = $2 AND user_id = $3
          LIMIT 1`,
        [input.tenantId, input.studentId, input.userId],
    );
    if ((guardian.rowCount ?? guardian.rows?.length ?? 0) > 0) return true;

    // A student may read their own documents.
    const self = await pool.query(
        `SELECT 1
           FROM students
          WHERE tenant_id = $1 AND id = $2 AND user_id = $3
          LIMIT 1`,
        [input.tenantId, input.studentId, input.userId],
    );
    return (self.rowCount ?? self.rows?.length ?? 0) > 0;
}
