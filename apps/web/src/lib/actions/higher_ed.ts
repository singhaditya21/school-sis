'use server';

import { db } from '@/lib/db';
import { universityPrograms, universityCourses, facultyWorkload } from '@/lib/db/schema/higher_ed';
import { getSession } from '@/lib/auth/session';
import { eq, and, sql } from 'drizzle-orm';

/**
 * Fetch all degree programs for the university.
 */
export async function getUniversityProgramsAction() {
    const session = await getSession();
    if (!session.tenantId) throw new Error('Unauthorized');

    return await db
        .select()
        .from(universityPrograms)
        .where(eq(universityPrograms.tenantId, session.tenantId));
}

/**
 * Fetch all university courses with their parent program names.
 */
export async function getUniversityCoursesAction() {
    const session = await getSession();
    if (!session.tenantId) throw new Error('Unauthorized');

    return await db
        .select({
            id: universityCourses.id,
            code: universityCourses.code,
            title: universityCourses.title,
            credits: universityCourses.credits,
            programName: universityPrograms.name,
            degreeType: universityPrograms.degreeType,
        })
        .from(universityCourses)
        .leftJoin(universityPrograms, eq(universityCourses.programId, universityPrograms.id))
        .where(eq(universityCourses.tenantId, session.tenantId));
}

/**
 * Super lightweight analytics summary for the Higher Ed dashboard.
 */
export async function getUniversityDashboardSummaryAction() {
    const session = await getSession();
    if (!session.tenantId) throw new Error('Unauthorized');

    const programsCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(universityPrograms)
        .where(eq(universityPrograms.tenantId, session.tenantId));

    const coursesCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(universityCourses)
        .where(eq(universityCourses.tenantId, session.tenantId));

    return {
        totalPrograms: programsCount[0]?.count || 0,
        totalCourses: coursesCount[0]?.count || 0,
        facultyAllocations: 0, // Mocked for now
    };
}
