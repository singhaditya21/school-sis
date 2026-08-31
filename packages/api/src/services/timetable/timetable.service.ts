'use server';

import { pool } from '@/lib/db';
import { tenantScope, eq, and, sql, identifier } from '../../data';
import { requireAuth } from '@/lib/auth/middleware';
import { timetableEntries, periods, substitutions, substitutionRequests, subjects, users } from '../../db/generated/tables';

/**
 * Retrieves all teachers who could be candidates for substitutions.
 * Enforces tenant isolation and checks permissions (timetable:read or substitution:read).
 */
export async function getSubstitutionTeachers(): Promise<{ id: string; name: string; subject: string; available: boolean }[]> {
    let auth;
    try {
        auth = await requireAuth('timetable:read');
    } catch {
        auth = await requireAuth('substitution:read');
    }
    const { tenantId } = auth;

    const { rows } = await pool.query(
        `SELECT u.id, u.first_name || ' ' || u.last_name AS name, COALESCE(sd.name, 'Teacher') AS subject, u.is_active AS available
         FROM users u
         LEFT JOIN staff_profiles sp ON sp.user_id = u.id
         LEFT JOIN staff_departments sd ON sd.id = sp.department_id
         WHERE u.tenant_id = $1 AND u.role = 'TEACHER'
         ORDER BY u.first_name`,
        [tenantId]
    );

    return rows;
}

/**
 * Retrieves substitution requests for the tenant.
 * Enforces tenant isolation and checks permissions (timetable:read or substitution:read).
 */
export async function getSubstitutionRequests(): Promise<{ id: string; originalTeacher: string; reason: string | null; class: string | null; period: number; date: string; substitute: string | null; status: string }[]> {
    let auth;
    try {
        auth = await requireAuth('timetable:read');
    } catch {
        auth = await requireAuth('substitution:read');
    }
    const { tenantId } = auth;

    const { rows } = await pool.query(
        `SELECT sr.id, u.first_name || ' ' || u.last_name AS "originalTeacher", sr.reason,
                g.name || '-' || sec.name AS class, sr.period, sr.date,
                sub_u.first_name || ' ' || sub_u.last_name AS substitute, sr.status
         FROM substitution_requests sr
         JOIN users u ON u.id = sr.teacher_id
         LEFT JOIN users sub_u ON sub_u.id = sr.substitute_id
         LEFT JOIN sections sec ON sec.id = sr.section_id
         LEFT JOIN grades g ON g.id = sec.grade_id
         WHERE sr.tenant_id = $1
         ORDER BY sr.date DESC LIMIT 50`,
        [tenantId]
    );

    return rows;
}

export async function getTimetableGrid(tenantId: string, sectionId: string) {
    return await tenantScope(tenantId)
        .from(timetableEntries)
        .innerJoin(periods, eq(timetableEntries.periodId, periods.id))
        .innerJoin(subjects, eq(timetableEntries.subjectId, subjects.id))
        .innerJoin(users, eq(timetableEntries.teacherId, users.id))
        .select<{
            id: string; sectionId: string; dayOfWeek: string; roomNumber: string | null;
            subjectId: string; subjectName: string; teacherId: string; teacherName: string;
            periodId: string; periodName: string; startTime: string; endTime: string;
            isBreak: boolean; displayOrder: number;
        }>({
            id: timetableEntries.id,
            sectionId: timetableEntries.sectionId,
            dayOfWeek: timetableEntries.dayOfWeek,
            roomNumber: timetableEntries.roomNumber,
            subjectId: timetableEntries.subjectId,
            subjectName: subjects.name,
            teacherId: timetableEntries.teacherId,
            teacherName: sql`${users.firstName} || ' ' || ${users.lastName}`,
            periodId: timetableEntries.periodId,
            periodName: periods.name,
            startTime: periods.startTime,
            endTime: periods.endTime,
            isBreak: periods.isBreak,
            displayOrder: periods.displayOrder,
        })
        .where(eq(timetableEntries.sectionId, sectionId))
        .rows();
}

export async function createTimetableEntry(tenantId: string, data: any) {
    const { teacherId, roomNumber, sectionId, periodId, dayOfWeek, subjectId } = data;
    const scope = tenantScope(tenantId);

    // 1. Teacher Conflict check
    if (teacherId) {
        const teacherConflict = await scope
            .from(timetableEntries)
            .select<{ id: string }>({ id: timetableEntries.id })
            .where(and(
                eq(timetableEntries.teacherId, teacherId),
                eq(timetableEntries.dayOfWeek, dayOfWeek),
                eq(timetableEntries.periodId, periodId),
            ))
            .limit(1)
            .rows();
        if (teacherConflict.length > 0) {
            throw new Error('Teacher is already assigned to another class/section at this period on this day');
        }
    }

    // 2. Room Conflict check
    if (roomNumber) {
        const roomConflict = await scope
            .from(timetableEntries)
            .select<{ id: string }>({ id: timetableEntries.id })
            .where(and(
                eq(timetableEntries.roomNumber, roomNumber),
                eq(timetableEntries.dayOfWeek, dayOfWeek),
                eq(timetableEntries.periodId, periodId),
            ))
            .limit(1)
            .rows();
        if (roomConflict.length > 0) {
            throw new Error('Room is already occupied by another class/section at this period on this day');
        }
    }

    // 3. Section/Class Conflict check
    if (sectionId) {
        const sectionConflict = await scope
            .from(timetableEntries)
            .select<{ id: string }>({ id: timetableEntries.id })
            .where(and(
                eq(timetableEntries.sectionId, sectionId),
                eq(timetableEntries.dayOfWeek, dayOfWeek),
                eq(timetableEntries.periodId, periodId),
            ))
            .limit(1)
            .rows();
        if (sectionConflict.length > 0) {
            throw new Error('Class/Section already has a subject scheduled at this period on this day');
        }
    }

    // No conflicts, create entry. tenant_id is set explicitly; the routing pool's RLS
    // still enforces the tenant.
    const [newEntry] = await sql`
        INSERT INTO ${identifier(timetableEntries.$name)}
            (tenant_id, section_id, period_id, subject_id, teacher_id, day_of_week, room_number)
        VALUES (${tenantId}, ${sectionId}, ${periodId}, ${subjectId}, ${teacherId}, ${dayOfWeek}, ${roomNumber})
        RETURNING *
    `;

    return newEntry;
}

export async function getSubstitutions(tenantId: string) {
    // Two aliased self-joins on `users` (orig/sub) are beyond the scoped builder, so this
    // uses the raw escape hatch. tenant("s") pins the query to this tenant's substitutions.
    return await tenantScope(tenantId).raw<{
        id: string; timetableEntryId: string; originalTeacherId: string; originalTeacherName: string;
        substituteTeacherId: string; substituteTeacherName: string; date: string; reason: string | null;
    }>((tenant, sql) => sql`
        SELECT s.id AS "id",
               s.timetable_entry_id AS "timetableEntryId",
               s.original_teacher_id AS "originalTeacherId",
               orig.first_name || ' ' || orig.last_name AS "originalTeacherName",
               s.substitute_teacher_id AS "substituteTeacherId",
               sub.first_name || ' ' || sub.last_name AS "substituteTeacherName",
               s.date AS "date",
               s.reason AS "reason"
        FROM substitutions s
        INNER JOIN users orig ON s.original_teacher_id = orig.id
        INNER JOIN users sub ON s.substitute_teacher_id = sub.id
        WHERE ${tenant("s")}
    `);
}

export async function createSubstitutionRequest(tenantId: string, data: any) {
    // tenant_id is set explicitly; the routing pool's RLS still enforces the tenant.
    const [request] = await sql`
        INSERT INTO ${identifier(substitutionRequests.$name)}
            (tenant_id, teacher_id, substitute_id, section_id, period, date, reason, status)
        VALUES (${tenantId}, ${data.teacherId}, ${data.substituteId}, ${data.sectionId}, ${Number(data.period)}, ${data.date}, ${data.reason}, ${data.status || 'pending'})
        RETURNING *
    `;

    return request;
}
