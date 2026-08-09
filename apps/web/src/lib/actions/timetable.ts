'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';

const timetableEntrySchema = z.object({
    sectionId: z.string().uuid(),
    periodId: z.string().uuid(),
    dayOfWeek: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']),
    subjectId: z.string().uuid(),
    teacherId: z.string().uuid(),
    roomNumber: z.string().trim().max(20).optional(),
}).strict().transform((entry) => ({
    ...entry,
    roomNumber: entry.roomNumber || undefined,
}));

const bulkTimetableEntriesSchema = z.array(timetableEntrySchema).max(
    500,
    'A timetable import cannot contain more than 500 entries.',
);

type ValidatedTimetableEntry = z.infer<typeof timetableEntrySchema>;

type TimetableMutationFailureCode =
    | 'INVALID_INPUT'
    | 'INVALID_REFERENCE'
    | 'BREAK_PERIOD';

const INVALID_REFERENCE_MESSAGE =
    'One or more timetable references are unavailable for this school.';

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
    type: 'SECTION_ALREADY_SCHEDULED' | 'TEACHER_DOUBLE_BOOKED' | 'ROOM_DOUBLE_BOOKED';
    periodId: string;
    dayOfWeek: string;
    conflictWith: string;
    details: string;
}

type ReferenceValidationResult =
    | { valid: true }
    | {
        valid: false;
        code: Extract<TimetableMutationFailureCode, 'INVALID_REFERENCE' | 'BREAK_PERIOD'>;
        error: string;
    };

function unique(values: string[]): string[] {
    return [...new Set(values)];
}

async function validateTimetableReferences(
    client: PoolClient,
    tenantId: string,
    entries: ValidatedTimetableEntry[],
): Promise<ReferenceValidationResult> {
    if (entries.length === 0) return { valid: true };

    const sectionIds = unique(entries.map((entry) => entry.sectionId));
    const periodIds = unique(entries.map((entry) => entry.periodId));
    const subjectIds = unique(entries.map((entry) => entry.subjectId));
    const teacherIds = unique(entries.map((entry) => entry.teacherId));

    const { rows: sectionRows } = await client.query<{ id: string }>(
        `SELECT id
         FROM sections
         WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [tenantId, sectionIds],
    );
    const { rows: periodRows } = await client.query<{ id: string; isBreak: number | boolean }>(
        `SELECT id, is_break AS "isBreak"
         FROM periods
         WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [tenantId, periodIds],
    );
    const { rows: subjectRows } = await client.query<{ id: string }>(
        `SELECT id
         FROM subjects
         WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [tenantId, subjectIds],
    );
    const { rows: teacherRows } = await client.query<{ id: string }>(
        `SELECT id
         FROM users
         WHERE tenant_id = $1
           AND id = ANY($2::uuid[])
           AND role = 'TEACHER'
           AND is_active = true`,
        [tenantId, teacherIds],
    );

    if (
        sectionRows.length !== sectionIds.length
        || periodRows.length !== periodIds.length
        || subjectRows.length !== subjectIds.length
        || teacherRows.length !== teacherIds.length
    ) {
        return {
            valid: false,
            code: 'INVALID_REFERENCE',
            error: INVALID_REFERENCE_MESSAGE,
        };
    }

    if (periodRows.some((period) => period.isBreak === true || period.isBreak === 1)) {
        return {
            valid: false,
            code: 'BREAK_PERIOD',
            error: 'A class cannot be assigned to a break period.',
        };
    }

    return { valid: true };
}

async function findExistingConflicts(
    client: PoolClient,
    tenantId: string,
    entry: ValidatedTimetableEntry,
): Promise<TimetableConflict[]> {
    const conflicts: TimetableConflict[] = [];

    const { rows: sectionEntries } = await client.query<{
        sectionName: string;
        gradeName: string;
    }>(
        `SELECT s.name AS "sectionName", g.name AS "gradeName"
         FROM timetable_entries te
         INNER JOIN sections s
            ON s.id = te.section_id
           AND s.tenant_id = te.tenant_id
         INNER JOIN grades g
            ON g.id = s.grade_id
           AND g.tenant_id = te.tenant_id
         WHERE te.tenant_id = $1
           AND te.section_id = $2
           AND te.period_id = $3
           AND te.day_of_week = $4
         LIMIT 1`,
        [tenantId, entry.sectionId, entry.periodId, entry.dayOfWeek],
    );
    if (sectionEntries[0]) {
        conflicts.push({
            type: 'SECTION_ALREADY_SCHEDULED',
            periodId: entry.periodId,
            dayOfWeek: entry.dayOfWeek,
            conflictWith: `${sectionEntries[0].gradeName} - ${sectionEntries[0].sectionName}`,
            details: 'This section already has a class assigned during this period.',
        });
    }

    const { rows: teacherEntries } = await client.query<{
        sectionName: string;
        gradeName: string;
    }>(
        `SELECT s.name AS "sectionName", g.name AS "gradeName"
         FROM timetable_entries te
         INNER JOIN sections s
            ON s.id = te.section_id
           AND s.tenant_id = te.tenant_id
         INNER JOIN grades g
            ON g.id = s.grade_id
           AND g.tenant_id = te.tenant_id
         WHERE te.tenant_id = $1
           AND te.period_id = $2
           AND te.day_of_week = $3
           AND te.teacher_id = $4
         LIMIT 1`,
        [tenantId, entry.periodId, entry.dayOfWeek, entry.teacherId],
    );
    if (teacherEntries[0]) {
        conflicts.push({
            type: 'TEACHER_DOUBLE_BOOKED',
            periodId: entry.periodId,
            dayOfWeek: entry.dayOfWeek,
            conflictWith: `${teacherEntries[0].gradeName} - ${teacherEntries[0].sectionName}`,
            details: `Teacher is already assigned to ${teacherEntries[0].gradeName} ${teacherEntries[0].sectionName} during this period`,
        });
    }

    if (entry.roomNumber) {
        const { rows: roomEntries } = await client.query<{
            sectionName: string;
            gradeName: string;
        }>(
            `SELECT s.name AS "sectionName", g.name AS "gradeName"
             FROM timetable_entries te
             INNER JOIN sections s
                ON s.id = te.section_id
               AND s.tenant_id = te.tenant_id
             INNER JOIN grades g
                ON g.id = s.grade_id
               AND g.tenant_id = te.tenant_id
             WHERE te.tenant_id = $1
               AND te.period_id = $2
               AND te.day_of_week = $3
               AND te.room_number = $4
             LIMIT 1`,
            [tenantId, entry.periodId, entry.dayOfWeek, entry.roomNumber],
        );
        if (roomEntries[0]) {
            conflicts.push({
                type: 'ROOM_DOUBLE_BOOKED',
                periodId: entry.periodId,
                dayOfWeek: entry.dayOfWeek,
                conflictWith: `${roomEntries[0].gradeName} - ${roomEntries[0].sectionName}`,
                details: `Room ${entry.roomNumber} is already assigned to ${roomEntries[0].gradeName} ${roomEntries[0].sectionName}`,
            });
        }
    }

    return conflicts;
}

function findAcceptedBatchConflicts(
    entry: ValidatedTimetableEntry,
    acceptedEntries: ValidatedTimetableEntry[],
): TimetableConflict[] {
    const conflicts: TimetableConflict[] = [];
    const sameSlot = (accepted: ValidatedTimetableEntry) => (
        accepted.periodId === entry.periodId && accepted.dayOfWeek === entry.dayOfWeek
    );

    if (acceptedEntries.some((accepted) => sameSlot(accepted) && accepted.sectionId === entry.sectionId)) {
        conflicts.push({
            type: 'SECTION_ALREADY_SCHEDULED',
            periodId: entry.periodId,
            dayOfWeek: entry.dayOfWeek,
            conflictWith: 'another row in this import',
            details: 'This section already has a class assigned during this period.',
        });
    }
    if (acceptedEntries.some((accepted) => sameSlot(accepted) && accepted.teacherId === entry.teacherId)) {
        conflicts.push({
            type: 'TEACHER_DOUBLE_BOOKED',
            periodId: entry.periodId,
            dayOfWeek: entry.dayOfWeek,
            conflictWith: 'another row in this import',
            details: 'Teacher is already assigned during this period by another row in this import.',
        });
    }
    if (
        entry.roomNumber
        && acceptedEntries.some((accepted) => (
            sameSlot(accepted) && accepted.roomNumber === entry.roomNumber
        ))
    ) {
        conflicts.push({
            type: 'ROOM_DOUBLE_BOOKED',
            periodId: entry.periodId,
            dayOfWeek: entry.dayOfWeek,
            conflictWith: 'another row in this import',
            details: `Room ${entry.roomNumber} is already assigned during this period by another row in this import.`,
        });
    }

    return conflicts;
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
    const teacherParams: string[] = [tenantId, data.periodId, data.dayOfWeek, data.teacherId, data.sectionId];
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
        const roomParams: string[] = [tenantId, data.periodId, data.dayOfWeek, data.roomNumber, data.sectionId];
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
    const parsed = timetableEntrySchema.safeParse(data);
    if (!parsed.success) {
        return {
            success: false as const,
            code: 'INVALID_INPUT' as const,
            error: parsed.error.issues[0]?.message || 'Enter a valid timetable entry.',
            conflicts: [],
        };
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Serialize writes for one tenant so two requests cannot both pass an
        // empty conflict check and then create the same schedule slot.
        await client.query(
            'SELECT pg_advisory_xact_lock(hashtext($1))',
            [`timetable:${tenantId}`],
        );

        const references = await validateTimetableReferences(client, tenantId, [parsed.data]);
        if (references.valid === false) {
            await client.query('ROLLBACK');
            return {
                success: false as const,
                code: references.code,
                error: references.error,
                conflicts: [],
            };
        }

        const conflicts = await findExistingConflicts(client, tenantId, parsed.data);
        if (conflicts.length > 0) {
            await client.query('ROLLBACK');
            return { success: false as const, conflicts };
        }

        await client.query(
            `INSERT INTO timetable_entries
                (id, tenant_id, section_id, period_id, day_of_week, subject_id, teacher_id, room_number)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                randomUUID(),
                tenantId,
                parsed.data.sectionId,
                parsed.data.periodId,
                parsed.data.dayOfWeek,
                parsed.data.subjectId,
                parsed.data.teacherId,
                parsed.data.roomNumber || null,
            ],
        );
        await client.query('COMMIT');

        return { success: true as const, conflicts: [] };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
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
    const parsed = bulkTimetableEntriesSchema.safeParse(entries);
    if (!parsed.success) {
        return {
            success: false as const,
            inserted: 0,
            skipped: Array.isArray(entries) ? entries.length : 0,
            conflicts: [] as TimetableConflict[],
            code: 'INVALID_INPUT' as const,
            error: parsed.error.issues[0]?.message || 'Enter valid timetable rows.',
        };
    }
    if (parsed.data.length === 0) {
        return {
            success: true as const,
            inserted: 0,
            skipped: 0,
            conflicts: [] as TimetableConflict[],
        };
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(
            'SELECT pg_advisory_xact_lock(hashtext($1))',
            [`timetable:${tenantId}`],
        );

        // Validate the entire payload before conflict filtering or insertion.
        // A single cross-tenant or otherwise invalid reference rejects the
        // complete import, so no earlier row can be partially persisted.
        const references = await validateTimetableReferences(client, tenantId, parsed.data);
        if (references.valid === false) {
            await client.query('ROLLBACK');
            return {
                success: false as const,
                inserted: 0,
                skipped: parsed.data.length,
                conflicts: [] as TimetableConflict[],
                code: references.code,
                error: references.error,
            };
        }

        const allConflicts: TimetableConflict[] = [];
        const validEntries: ValidatedTimetableEntry[] = [];

        for (const entry of parsed.data) {
            const conflicts = [
                ...await findExistingConflicts(client, tenantId, entry),
                ...findAcceptedBatchConflicts(entry, validEntries),
            ];
            if (conflicts.length > 0) {
                allConflicts.push(...conflicts);
            } else {
                validEntries.push(entry);
            }
        }

        if (validEntries.length > 0) {
            const values: (string | null)[] = [];
            const placeholders: string[] = [];
            let index = 1;
            for (const entry of validEntries) {
                placeholders.push(
                    `($${index}, $${index + 1}, $${index + 2}, $${index + 3}, $${index + 4}, $${index + 5}, $${index + 6}, $${index + 7})`,
                );
                values.push(
                    randomUUID(),
                    tenantId,
                    entry.sectionId,
                    entry.periodId,
                    entry.dayOfWeek,
                    entry.subjectId,
                    entry.teacherId,
                    entry.roomNumber || null,
                );
                index += 8;
            }

            await client.query(
                `INSERT INTO timetable_entries
                    (id, tenant_id, section_id, period_id, day_of_week, subject_id, teacher_id, room_number)
                 VALUES ${placeholders.join(', ')}`,
                values,
            );
        }

        await client.query('COMMIT');
        return {
            success: allConflicts.length === 0,
            inserted: validEntries.length,
            skipped: parsed.data.length - validEntries.length,
            conflicts: allConflicts,
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
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
