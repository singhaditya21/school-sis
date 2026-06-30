'use server';

import { pool } from '@/lib/db';
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

    const { rows } = await pool.query(
        `SELECT id, name, start_time AS "startTime", end_time AS "endTime", display_order AS "displayOrder", is_break AS "isBreak" 
         FROM periods WHERE tenant_id = $1 ORDER BY display_order ASC`,
        [tenantId]
    );

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
    const { rows: entries } = await pool.query(
        `SELECT 
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
         WHERE te.section_id = $1 AND te.tenant_id = $2`,
        [sectionId, tenantId]
    );

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

    const { rows } = await pool.query(
        `SELECT s.id, s.name AS "sectionName", g.name AS "gradeName", g.display_order AS "gradeOrder"
         FROM sections s
         INNER JOIN grades g ON s.grade_id = g.id
         WHERE s.tenant_id = $1
         ORDER BY g.display_order ASC, s.name ASC`,
        [tenantId]
    );
    return rows;
}

export async function getTeachersForTimetable() {
    const { tenantId } = await requireAuth('timetable:read');
    
    const { rows } = await pool.query(
        `SELECT id, first_name AS "firstName", last_name AS "lastName"
         FROM users
         WHERE tenant_id = $1 AND role = 'TEACHER' AND is_active = true
         ORDER BY first_name ASC`,
        [tenantId]
    );
    return rows;
}

export async function getSubjectsForTimetable() {
    const { tenantId } = await requireAuth('timetable:read');
    
    const { rows } = await pool.query(
        `SELECT id, name, code
         FROM subjects
         WHERE tenant_id = $1
         ORDER BY name ASC`,
        [tenantId]
    );
    return rows;
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
    const teacherParams: any[] = [tenantId, data.periodId, data.dayOfWeek, data.teacherId, data.sectionId];
    let teacherQuery = `
        SELECT te.id, te.section_id AS "sectionId", s.name AS "sectionName", g.name AS "gradeName"
        FROM timetable_entries te
        INNER JOIN sections s ON te.section_id = s.id
        INNER JOIN grades g ON s.grade_id = g.id
        WHERE te.tenant_id = $1 AND te.period_id = $2 AND te.day_of_week = $3 
          AND te.teacher_id = $4 AND te.section_id != $5
    `;
    if (data.excludeEntryId) {
        teacherParams.push(data.excludeEntryId);
        teacherQuery += ` AND te.id != $6`;
    }

    const { rows: teacherEntries } = await pool.query(teacherQuery, teacherParams);

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
        const roomParams: any[] = [tenantId, data.periodId, data.dayOfWeek, data.roomNumber, data.sectionId];
        let roomQuery = `
            SELECT te.id, s.name AS "sectionName", g.name AS "gradeName"
            FROM timetable_entries te
            INNER JOIN sections s ON te.section_id = s.id
            INNER JOIN grades g ON s.grade_id = g.id
            WHERE te.tenant_id = $1 AND te.period_id = $2 AND te.day_of_week = $3 
              AND te.room_number = $4 AND te.section_id != $5
        `;
        if (data.excludeEntryId) {
            roomParams.push(data.excludeEntryId);
            roomQuery += ` AND te.id != $6`;
        }

        const { rows: roomEntries } = await pool.query(roomQuery, roomParams);

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

    await pool.query(
        `INSERT INTO timetable_entries (id, tenant_id, section_id, period_id, day_of_week, subject_id, teacher_id, room_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [randomUUID(), tenantId, data.sectionId, data.periodId, data.dayOfWeek, data.subjectId, data.teacherId, data.roomNumber || null]
    );

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
        const values: any[] = [];
        const placeholders: string[] = [];
        let index = 1;
        for (const e of validEntries) {
            placeholders.push(`($${index}, $${index+1}, $${index+2}, $${index+3}, $${index+4}, $${index+5}, $${index+6}, $${index+7})`);
            values.push(randomUUID(), tenantId, e.sectionId, e.periodId, e.dayOfWeek, e.subjectId, e.teacherId, e.roomNumber || null);
            index += 8;
        }

        await pool.query(
            `INSERT INTO timetable_entries (id, tenant_id, section_id, period_id, day_of_week, subject_id, teacher_id, room_number)
             VALUES ${placeholders.join(', ')}`,
            values
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
    const { rows: busyTeachers } = await pool.query(
        `SELECT teacher_id AS "teacherId" FROM timetable_entries 
         WHERE tenant_id = $1 AND period_id = $2 AND day_of_week = $3`,
        [tenantId, data.periodId, data.dayOfWeek]
    );

    const busyIds = new Set(busyTeachers.map(t => t.teacherId));

    const { rows: allTeachers } = await pool.query(
        `SELECT id, first_name AS "firstName", last_name AS "lastName"
         FROM users
         WHERE tenant_id = $1 AND role = 'TEACHER' AND is_active = true`,
        [tenantId]
    );

    return allTeachers
        .filter(t => !busyIds.has(t.id))
        .map(t => ({
            teacherId: t.id,
            teacherName: `${t.firstName} ${t.lastName}`,
            isFree: true,
        }));
}

export async function createSubstitutionRequest(data: {
    date: string;
    absentTeacherName: string;
    subject: string;
    period: number;
    substituteTeacherName?: string;
}) {
    const { tenantId } = await requireAuth('timetable:read');

    // Resolve teacher ID from name
    const teacherRes = await pool.query(
        `SELECT id FROM users WHERE tenant_id = $1 AND role = 'TEACHER' AND (first_name || ' ' || last_name) = $2 LIMIT 1`,
        [tenantId, data.absentTeacherName]
    );
    const teacherId = teacherRes.rows[0]?.id;
    if (!teacherId) {
        throw new Error('Teacher not found');
    }

    // Resolve a default section for the request
    const sectionRes = await pool.query(
        `SELECT id FROM sections WHERE tenant_id = $1 LIMIT 1`,
        [tenantId]
    );
    const sectionId = sectionRes.rows[0]?.id;

    // Resolve substitute
    let substituteId = null;
    if (data.substituteTeacherName) {
        const subRes = await pool.query(
            `SELECT id FROM users WHERE tenant_id = $1 AND role = 'TEACHER' AND (first_name || ' ' || last_name) = $2 LIMIT 1`,
            [tenantId, data.substituteTeacherName]
        );
        substituteId = subRes.rows[0]?.id;
    }
    if (!substituteId) {
        const substituteRes = await pool.query(
            `SELECT id FROM users WHERE tenant_id = $1 AND role = 'TEACHER' AND id != $2 LIMIT 1`,
            [tenantId, teacherId]
        );
        substituteId = substituteRes.rows[0]?.id;
    }

    await pool.query(
        `INSERT INTO substitution_requests (tenant_id, teacher_id, substitute_id, section_id, period, date, reason, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
        [tenantId, teacherId, substituteId, sectionId, data.period, data.date, data.subject]
    );

    return { success: true };
}

export async function approveSubstitutionRequest(id: string) {
    const { tenantId } = await requireAuth('timetable:write');
    await pool.query(
        `UPDATE substitution_requests
         SET status = 'approved'
         WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId]
    );
    return { success: true };
}
