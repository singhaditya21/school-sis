'use server';

import { db } from '@/lib/db';
import { students, guardians, grades, sections } from '@/lib/db/schema';
import { eq, and, ilike, or, count, asc, desc } from 'drizzle-orm';
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

    // Build where conditions
    const conditions = [eq(students.tenantId, tenantId)];

    if (options?.gradeId) {
        conditions.push(eq(students.gradeId, options.gradeId));
    }

    if (options?.status) {
        conditions.push(eq(students.status, options.status as any));
    }

    if (options?.search) {
        conditions.push(
            or(
                ilike(students.firstName, `%${options.search}%`),
                ilike(students.lastName, `%${options.search}%`),
                ilike(students.admissionNumber, `%${options.search}%`)
            )!
        );
    }

    const whereClause = and(...conditions);

    // Get total count
    const [countResult] = await db
        .select({ count: count() })
        .from(students)
        .where(whereClause);

    // Get students with grade/section info
    const rows = await db
        .select({
            id: students.id,
            admissionNumber: students.admissionNumber,
            firstName: students.firstName,
            lastName: students.lastName,
            dateOfBirth: students.dateOfBirth,
            gender: students.gender,
            status: students.status,
            gradeName: grades.name,
            sectionName: sections.name,
        })
        .from(students)
        .innerJoin(grades, eq(students.gradeId, grades.id))
        .innerJoin(sections, eq(students.sectionId, sections.id))
        .where(whereClause)
        .orderBy(asc(grades.displayOrder), asc(sections.name), asc(students.firstName))
        .limit(limit)
        .offset(offset);

    // Get guardian counts for these students
    const studentIds = rows.map(r => r.id);
    const guardianCounts: Record<string, number> = {};

    if (studentIds.length > 0) {
        const gcRows = await db
            .select({
                studentId: guardians.studentId,
                count: count(),
            })
            .from(guardians)
            .where(eq(guardians.tenantId, tenantId))
            .groupBy(guardians.studentId);

        for (const gc of gcRows) {
            guardianCounts[gc.studentId] = gc.count;
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
        total: countResult.count,
    };
}

export async function getGradesList() {
    const { tenantId } = await requireAuth('students:read');

    return db
        .select({ id: grades.id, name: grades.name, displayOrder: grades.displayOrder })
        .from(grades)
        .where(eq(grades.tenantId, tenantId))
        .orderBy(asc(grades.displayOrder));
}
