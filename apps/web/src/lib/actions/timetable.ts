'use server';

import { db } from '@/lib/db';
import { periods, timetableEntries, subjects, sections, grades, users } from '@/lib/db/schema';
import { eq, and, asc, ne } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { randomUUID } from 'crypto';

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

// ─── Conflict Detection ─────────────────────────────────────

export interface TimetableConflict {
    type: 'TEACHER_DOUBLE_BOOKED' | 'ROOM_DOUBLE_BOOKED';
    periodId: string;
    dayOfWeek: string;
    conflictWith: string;
    details: string;
}

export async function checkConflicts(data: {
    sectionId: string;
    periodId: string;
    dayOfWeek: string;
    teacherId: string;
    roomNumber?: string;
    excludeEntryId?: string; // for updates
}): Promise<TimetableConflict[]> {
    const { tenantId } = await requireAuth('timetable:read');
    const conflicts: TimetableConflict[] = [];

    // Check teacher double-booking
    const teacherEntries = await db
        .select({
            id: timetableEntries.id,
            sectionId: timetableEntries.sectionId,
            sectionName: sections.name,
            gradeName: grades.name,
        })
        .from(timetableEntries)
        .innerJoin(sections, eq(timetableEntries.sectionId, sections.id))
        .innerJoin(grades, eq(sections.gradeId, grades.id))
        .where(and(
            eq(timetableEntries.tenantId, tenantId),
            eq(timetableEntries.periodId, data.periodId),
            eq(timetableEntries.dayOfWeek, data.dayOfWeek as any),
            eq(timetableEntries.teacherId, data.teacherId),
            ne(timetableEntries.sectionId, data.sectionId),
            ...(data.excludeEntryId ? [ne(timetableEntries.id, data.excludeEntryId)] : []),
        ));

    for (const entry of teacherEntries) {
        conflicts.push({
            type: 'TEACHER_DOUBLE_BOOKED',
            periodId: data.periodId,
            dayOfWeek: data.dayOfWeek,
            conflictWith: `${entry.gradeName} - ${entry.sectionName}`,
            details: `Teacher is already assigned to ${entry.gradeName} ${entry.sectionName} during this period`,
        });
    }

    // Check room double-booking
    if (data.roomNumber) {
        const roomEntries = await db
            .select({
                id: timetableEntries.id,
                sectionName: sections.name,
                gradeName: grades.name,
            })
            .from(timetableEntries)
            .innerJoin(sections, eq(timetableEntries.sectionId, sections.id))
            .innerJoin(grades, eq(sections.gradeId, grades.id))
            .where(and(
                eq(timetableEntries.tenantId, tenantId),
                eq(timetableEntries.periodId, data.periodId),
                eq(timetableEntries.dayOfWeek, data.dayOfWeek as any),
                eq(timetableEntries.roomNumber, data.roomNumber),
                ne(timetableEntries.sectionId, data.sectionId),
                ...(data.excludeEntryId ? [ne(timetableEntries.id, data.excludeEntryId)] : []),
            ));

        for (const entry of roomEntries) {
            conflicts.push({
                type: 'ROOM_DOUBLE_BOOKED',
                periodId: data.periodId,
                dayOfWeek: data.dayOfWeek,
                conflictWith: `${entry.gradeName} - ${entry.sectionName}`,
                details: `Room ${data.roomNumber} is already assigned to ${entry.gradeName} ${entry.sectionName}`,
            });
        }
    }

    return conflicts;
}

// ─── Create Entry (with conflict check) ──────────────────────

export async function createTimetableEntry(data: {
    sectionId: string;
    periodId: string;
    dayOfWeek: string;
    subjectId: string;
    teacherId: string;
    roomNumber?: string;
}) {
    const { tenantId } = await requireAuth('timetable:write');

    // Check for conflicts first
    const conflicts = await checkConflicts({
        sectionId: data.sectionId,
        periodId: data.periodId,
        dayOfWeek: data.dayOfWeek,
        teacherId: data.teacherId,
        roomNumber: data.roomNumber,
    });

    if (conflicts.length > 0) {
        return { success: false, conflicts };
    }

    await db.insert(timetableEntries).values({
        id: randomUUID(),
        tenantId,
        sectionId: data.sectionId,
        periodId: data.periodId,
        dayOfWeek: data.dayOfWeek as any,
        subjectId: data.subjectId,
        teacherId: data.teacherId,
        roomNumber: data.roomNumber,
    });

    return { success: true, conflicts: [] };
}

// ─── Bulk Create ─────────────────────────────────────────────

export async function bulkCreateEntries(entries: {
    sectionId: string;
    periodId: string;
    dayOfWeek: string;
    subjectId: string;
    teacherId: string;
    roomNumber?: string;
}[]) {
    const { tenantId } = await requireAuth('timetable:write');

    const allConflicts: TimetableConflict[] = [];
    const validEntries: typeof entries = [];

    for (const entry of entries) {
        const conflicts = await checkConflicts({
            sectionId: entry.sectionId,
            periodId: entry.periodId,
            dayOfWeek: entry.dayOfWeek,
            teacherId: entry.teacherId,
            roomNumber: entry.roomNumber,
        });

        if (conflicts.length > 0) {
            allConflicts.push(...conflicts);
        } else {
            validEntries.push(entry);
        }
    }

    // Insert valid entries
    if (validEntries.length > 0) {
        await db.insert(timetableEntries).values(
            validEntries.map(e => ({
                id: randomUUID(),
                tenantId,
                sectionId: e.sectionId,
                periodId: e.periodId,
                dayOfWeek: e.dayOfWeek as any,
                subjectId: e.subjectId,
                teacherId: e.teacherId,
                roomNumber: e.roomNumber,
            }))
        );
    }

    return {
        success: allConflicts.length === 0,
        inserted: validEntries.length,
        skipped: entries.length - validEntries.length,
        conflicts: allConflicts,
    };
}

// ─── Substitution Management ─────────────────────────────────

export async function getSubstitutionSuggestions(data: {
    periodId: string;
    dayOfWeek: string;
    subjectId: string;
}) {
    const { tenantId } = await requireAuth('timetable:read');

    // Find all teachers who teach this subject and are NOT busy during this period+day
    const busyTeachers = await db
        .select({ teacherId: timetableEntries.teacherId })
        .from(timetableEntries)
        .where(and(
            eq(timetableEntries.tenantId, tenantId),
            eq(timetableEntries.periodId, data.periodId),
            eq(timetableEntries.dayOfWeek, data.dayOfWeek as any),
        ));

    const busyIds = new Set(busyTeachers.map(t => t.teacherId));

    // Get all teachers (simple approach — could be refined with subject-teacher mapping)
    const allTeachers = await db
        .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
        })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.role, 'TEACHER'), eq(users.isActive, true)));

    return allTeachers
        .filter(t => !busyIds.has(t.id))
        .map(t => ({
            teacherId: t.id,
            teacherName: `${t.firstName} ${t.lastName}`,
            isFree: true,
        }));
}

