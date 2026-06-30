
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

export async function getGradebookData(classId?: string): Promise<{ classes: any[], exams: any[], students: any[] }> {
    const { tenantId } = await requireAuth('gradebook:read');

    const { rows: classes } = await pool.query(
        `SELECT id, name FROM grades WHERE tenant_id = $1 ORDER BY display_order`,
        [tenantId]
    );

    const { rows: exams } = await pool.query(
        `SELECT id, name, type FROM exams WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 10`,
        [tenantId]
    );

    let students: any[] = [];
    if (classId) {
        const { rows } = await pool.query(
            `SELECT s.id, s.first_name || ' ' || s.last_name AS name, s.roll_number AS "rollNo",
                    g.name AS class, sec.name AS section
             FROM students s 
             LEFT JOIN sections sec ON sec.id = s.section_id 
             LEFT JOIN grades g ON g.id = sec.grade_id
             WHERE s.tenant_id = $1 AND g.tenant_id = $1 AND g.id = $2 AND s.status = 'ACTIVE'
             ORDER BY s.roll_number`,
            [tenantId, classId]
        );
        students = rows;
    }

    return { classes, exams, students };
}
