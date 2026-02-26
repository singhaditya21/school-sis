'use server';

import { db } from '@/lib/db';
import { attendanceRecords, students, grades, sections } from '@/lib/db/schema';
import { eq, and, count, sql, asc } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';

export interface ClassAttendanceSummary {
    gradeName: string;
    sectionName: string;
    sectionId: string;
    gradeId: string;
    studentCount: number;
    presentToday: number;
    absentToday: number;
    lateToday: number;
    attendanceMarked: boolean;
}

export interface AttendanceWeeklyStats {
    status: string;
    count: number;
}

export async function getClassAttendanceSummary(date?: string): Promise<ClassAttendanceSummary[]> {
    const { tenantId } = await requireAuth('attendance:read');
    const targetDate = date || new Date().toISOString().split('T')[0];

    // Get all sections with grade info and student counts
    const sectionRows = await db
        .select({
            sectionId: sections.id,
            sectionName: sections.name,
            gradeId: grades.id,
            gradeName: grades.name,
            gradeOrder: grades.displayOrder,
        })
        .from(sections)
        .innerJoin(grades, eq(sections.gradeId, grades.id))
        .where(eq(sections.tenantId, tenantId))
        .orderBy(asc(grades.displayOrder), asc(sections.name));

    const result: ClassAttendanceSummary[] = [];

    for (const sec of sectionRows) {
        // Count students in this section
        const [studentCountRow] = await db
            .select({ count: count() })
            .from(students)
            .where(and(
                eq(students.sectionId, sec.sectionId),
                eq(students.tenantId, tenantId),
                eq(students.status, 'ACTIVE')
            ));

        // Get attendance for this section today
        const attendanceRows = await db
            .select({
                status: attendanceRecords.status,
                count: count(),
            })
            .from(attendanceRecords)
            .where(and(
                eq(attendanceRecords.sectionId, sec.sectionId),
                eq(attendanceRecords.tenantId, tenantId),
                eq(attendanceRecords.date, targetDate)
            ))
            .groupBy(attendanceRecords.status);

        const statMap: Record<string, number> = {};
        let totalMarked = 0;
        for (const row of attendanceRows) {
            statMap[row.status] = row.count;
            totalMarked += row.count;
        }

        result.push({
            gradeName: sec.gradeName,
            sectionName: sec.sectionName,
            sectionId: sec.sectionId,
            gradeId: sec.gradeId,
            studentCount: studentCountRow.count,
            presentToday: statMap['PRESENT'] || 0,
            absentToday: statMap['ABSENT'] || 0,
            lateToday: statMap['LATE'] || 0,
            attendanceMarked: totalMarked > 0,
        });
    }

    return result;
}

export async function getAttendanceWeeklyStats(): Promise<AttendanceWeeklyStats[]> {
    const { tenantId } = await requireAuth('attendance:read');

    // Get stats for the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const startDate = sevenDaysAgo.toISOString().split('T')[0];

    const rows = await db
        .select({
            status: attendanceRecords.status,
            count: count(),
        })
        .from(attendanceRecords)
        .where(and(
            eq(attendanceRecords.tenantId, tenantId),
            sql`${attendanceRecords.date} >= ${startDate}`
        ))
        .groupBy(attendanceRecords.status);

    return rows.map(r => ({
        status: r.status,
        count: r.count,
    }));
}
