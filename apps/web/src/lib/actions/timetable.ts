'use server';

import { sql } from '@/lib/db';
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

export interface TimetableSection {
    id: string;
    sectionName: string;
    gradeName: string;
    gradeOrder: number;
}

export async function getPeriods(): Promise<PeriodItem[]> {
    const { tenantId } = await requireAuth('timetable:read');

    const rows = await sql<{
        id: string;
        name: string;
        startTime: string;
        endTime: string;
        displayOrder: number;
        isBreak: number | boolean;
    }>`
        SELECT id, name, start_time AS "startTime", end_time AS "endTime", display_order AS "displayOrder", is_break AS "isBreak" 
        FROM periods WHERE tenant_id = ${tenantId} ORDER BY display_order ASC
    `;

    return rows.map(r => ({
        ...r,
        isBreak: r.isBreak === 1 || r.isBreak === true,
    }));
}

export async function getTimetableForSection(sectionId: string): Promise<TimetableRow[]> {
    const { tenantId } = await requireAuth('timetable:read');

    // Get all periods
    const allPeriods = await getPeriods();

    // Get all entries for this section
    const entries = await sql<{
        periodId: string;
        dayOfWeek: string;
        subjectName: string;
        subjectCode: string;
        teacherFirstName: string;
        teacherLastName: string;
        roomNumber: string | null;
    }>`
        SELECT 
            te.period_id AS "periodId", 
            te.day_of_week AS "dayOfWeek", 
            s.name AS "subjectName", 
            s.code AS "subjectCode", 
            u.first_name AS "teacherFirstName", 
            u.last_name AS "teacherLastName", 
            te.room_number AS "roomNumber"
        FROM timetable_entries te
        INNER JOIN subjects s ON te.subject_id = s.id
        INNER JOIN users u ON te.teacher_id = u.id
        WHERE te.section_id = ${sectionId} AND te.tenant_id = ${tenantId}
    `;

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

export async function getSectionsForTimetable(): Promise<TimetableSection[]> {
    const { tenantId } = await requireAuth('timetable:read');

    return sql<TimetableSection>`
        SELECT s.id, s.name AS "sectionName", g.name AS "gradeName", g.display_order AS "gradeOrder"
        FROM sections s
        INNER JOIN grades g ON s.grade_id = g.id
        WHERE s.tenant_id = ${tenantId}
        ORDER BY g.display_order ASC, s.name ASC
    `;
}

export async function getTeachersForTimetable() {
    const { tenantId } = await requireAuth('timetable:read');
    
    return sql<{ id: string; firstName: string; lastName: string }>`
        SELECT id, first_name AS "firstName", last_name AS "lastName"
        FROM users
        WHERE tenant_id = ${tenantId} AND role = 'TEACHER' AND is_active = true
        ORDER BY first_name ASC
    `;
}

export async function getSubjectsForTimetable() {
    const { tenantId } = await requireAuth('timetable:read');
    
    return sql<{ id: string; name: string; code: string }>`
        SELECT id, name, code
        FROM subjects
        WHERE tenant_id = ${tenantId}
        ORDER BY name ASC
    `;
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
    const excludeFilter = data.excludeEntryId ? sql`AND te.id != ${data.excludeEntryId}` : sql``;

    // Check teacher double-booking
    const teacherEntries = await sql<{
        id: string;
        sectionId: string;
        sectionName: string;
        gradeName: string;
    }>`
        SELECT te.id, te.section_id AS "sectionId", s.name AS "sectionName", g.name AS "gradeName"
        FROM timetable_entries te
        INNER JOIN sections s ON te.section_id = s.id
        INNER JOIN grades g ON s.grade_id = g.id
        WHERE te.tenant_id = ${tenantId} AND te.period_id = ${data.periodId} AND te.day_of_week = ${data.dayOfWeek} 
          AND te.teacher_id = ${data.teacherId} AND te.section_id != ${data.sectionId} ${excludeFilter}
    `;

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
        const roomEntries = await sql<{
            id: string;
            sectionName: string;
            gradeName: string;
        }>`
            SELECT te.id, s.name AS "sectionName", g.name AS "gradeName"
            FROM timetable_entries te
            INNER JOIN sections s ON te.section_id = s.id
            INNER JOIN grades g ON s.grade_id = g.id
            WHERE te.tenant_id = ${tenantId} AND te.period_id = ${data.periodId} AND te.day_of_week = ${data.dayOfWeek} 
              AND te.room_number = ${data.roomNumber} AND te.section_id != ${data.sectionId} ${excludeFilter}
        `;

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

    await sql`
        INSERT INTO timetable_entries (id, tenant_id, section_id, period_id, day_of_week, subject_id, teacher_id, room_number)
        VALUES (${randomUUID()}, ${tenantId}, ${data.sectionId}, ${data.periodId}, ${data.dayOfWeek}, ${data.subjectId}, ${data.teacherId}, ${data.roomNumber || null})
    `;

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
    for (const e of validEntries) {
        await sql`
            INSERT INTO timetable_entries (id, tenant_id, section_id, period_id, day_of_week, subject_id, teacher_id, room_number)
            VALUES (${randomUUID()}, ${tenantId}, ${e.sectionId}, ${e.periodId}, ${e.dayOfWeek}, ${e.subjectId}, ${e.teacherId}, ${e.roomNumber || null})
        `;
    }

    return {
        success: allConflicts.length === 0,
        inserted: validEntries.length,
        skipped: entries.length - validEntries.length,
        conflicts: allConflicts,
    };
}
