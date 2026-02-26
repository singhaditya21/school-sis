'use server';

import { db } from '@/lib/db';
import { periods, timetableEntries, subjects, sections, grades, users } from '@/lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';

export interface PeriodItem {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    displayOrder: number;
    isBreak: boolean;
}

export interface TimetableRow {
    periodName: string;
    startTime: string;
    endTime: string;
    monday: TimetableCell | null;
    tuesday: TimetableCell | null;
    wednesday: TimetableCell | null;
    thursday: TimetableCell | null;
    friday: TimetableCell | null;
    saturday: TimetableCell | null;
}

export interface TimetableCell {
    subjectName: string;
    subjectCode: string;
    teacherName: string;
    roomNumber: string | null;
}

export async function getPeriods(): Promise<PeriodItem[]> {
    const { tenantId } = await requireAuth('timetable:read');

    const rows = await db
        .select({
            id: periods.id,
            name: periods.name,
            startTime: periods.startTime,
            endTime: periods.endTime,
            displayOrder: periods.displayOrder,
            isBreak: periods.isBreak,
        })
        .from(periods)
        .where(eq(periods.tenantId, tenantId))
        .orderBy(asc(periods.displayOrder));

    return rows.map(r => ({
        ...r,
        isBreak: r.isBreak === 1,
    }));
}

export async function getTimetableForSection(sectionId: string): Promise<TimetableRow[]> {
    const { tenantId } = await requireAuth('timetable:read');

    // Get all periods
    const allPeriods = await getPeriods();

    // Get all entries for this section
    const entries = await db
        .select({
            periodId: timetableEntries.periodId,
            dayOfWeek: timetableEntries.dayOfWeek,
            subjectName: subjects.name,
            subjectCode: subjects.code,
            teacherFirstName: users.firstName,
            teacherLastName: users.lastName,
            roomNumber: timetableEntries.roomNumber,
        })
        .from(timetableEntries)
        .innerJoin(subjects, eq(timetableEntries.subjectId, subjects.id))
        .innerJoin(users, eq(timetableEntries.teacherId, users.id))
        .where(and(
            eq(timetableEntries.sectionId, sectionId),
            eq(timetableEntries.tenantId, tenantId)
        ));

    // Build timetable grid
    const entryMap = new Map<string, TimetableCell>();
    for (const e of entries) {
        const key = `${e.periodId}-${e.dayOfWeek}`;
        entryMap.set(key, {
            subjectName: e.subjectName,
            subjectCode: e.subjectCode,
            teacherName: `${e.teacherFirstName} ${e.teacherLastName}`,
            roomNumber: e.roomNumber,
        });
    }

    const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;

    return allPeriods.map(period => ({
        periodName: period.name,
        startTime: period.startTime,
        endTime: period.endTime,
        monday: entryMap.get(`${period.id}-MONDAY`) || null,
        tuesday: entryMap.get(`${period.id}-TUESDAY`) || null,
        wednesday: entryMap.get(`${period.id}-WEDNESDAY`) || null,
        thursday: entryMap.get(`${period.id}-THURSDAY`) || null,
        friday: entryMap.get(`${period.id}-FRIDAY`) || null,
        saturday: entryMap.get(`${period.id}-SATURDAY`) || null,
    }));
}

export async function getSectionsForTimetable() {
    const { tenantId } = await requireAuth('timetable:read');

    return db
        .select({
            id: sections.id,
            sectionName: sections.name,
            gradeName: grades.name,
            gradeOrder: grades.displayOrder,
        })
        .from(sections)
        .innerJoin(grades, eq(sections.gradeId, grades.id))
        .where(eq(sections.tenantId, tenantId))
        .orderBy(asc(grades.displayOrder), asc(sections.name));
}
