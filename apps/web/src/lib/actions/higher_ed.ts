'use server';

import { pool } from '@/lib/db';
import { getSession } from '@/lib/auth/session';

/**
 * Fetch all degree programs for the university.
 */
export async function getUniversityProgramsAction() {
    const session = await getSession();
    if (!session.tenantId) throw new Error('Unauthorized');

    const result = await pool.query(
        'SELECT id, tenant_id AS "tenantId", name, degree_type AS "degreeType", created_at AS "createdAt", updated_at AS "updatedAt" FROM university_programs WHERE tenant_id = $1',
        [session.tenantId]
    );
    
    return result.rows;
}

/**
 * Fetch all university courses with their parent program names.
 */
export async function getUniversityCoursesAction() {
    const session = await getSession();
    if (!session.tenantId) throw new Error('Unauthorized');

    const result = await pool.query(
        `SELECT 
            uc.id, 
            uc.code, 
            uc.title, 
            uc.credits, 
            up.name AS "programName", 
            up.degree_type AS "degreeType"
         FROM university_courses uc
         LEFT JOIN university_programs up ON uc.program_id = up.id
         WHERE uc.tenant_id = $1`,
        [session.tenantId]
    );
    
    return result.rows;
}

/**
 * Super lightweight analytics summary for the Higher Ed dashboard.
 */
export async function getUniversityDashboardSummaryAction() {
    const session = await getSession();
    if (!session.tenantId) throw new Error('Unauthorized');

    const programsCountResult = await pool.query(
        'SELECT COUNT(*) as count FROM university_programs WHERE tenant_id = $1',
        [session.tenantId]
    );
    
    const coursesCountResult = await pool.query(
        'SELECT COUNT(*) as count FROM university_courses WHERE tenant_id = $1',
        [session.tenantId]
    );

    return {
        totalPrograms: Number(programsCountResult.rows[0]?.count || 0),
        totalCourses: Number(coursesCountResult.rows[0]?.count || 0),
        facultyAllocations: 0, // Mocked for now
    };
}
