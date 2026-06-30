'use server';

import { db, pool } from '@/lib/db';
import { eq, and, sql } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { timetableEntries, periods, substitutions, substitutionRequests } from '@/lib/db/schema/timetable';
import { subjects, sections } from '@/lib/db/schema/academic';
import { users } from '@/lib/db/schema/core';

/**
 * Retrieves all teachers who could be candidates for substitutions.
 * Enforces tenant isolation and checks permissions (timetable:read or substitution:read).
 */
export async function getSubstitutionTeachers(): Promise<any[]> {
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
export async function getSubstitutionRequests(): Promise<any[]> {
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
    const entries = await db.select({
        id: timetableEntries.id,
        sectionId: timetableEntries.sectionId,
        dayOfWeek: timetableEntries.dayOfWeek,
        roomNumber: timetableEntries.roomNumber,
        subjectId: timetableEntries.subjectId,
        subjectName: subjects.name,
        teacherId: timetableEntries.teacherId,
        teacherName: sql<string>`u.first_name || ' ' || u.last_name`,
        periodId: timetableEntries.periodId,
        periodName: periods.name,
        startTime: periods.startTime,
        endTime: periods.endTime,
        isBreak: periods.isBreak,
        displayOrder: periods.displayOrder,
    })
    .from(timetableEntries)
    .innerJoin(periods, eq(timetableEntries.periodId, periods.id))
    .innerJoin(subjects, eq(timetableEntries.subjectId, subjects.id))
    .innerJoin(users, eq(timetableEntries.teacherId, users.id))
    .where(and(
        eq(timetableEntries.tenantId, tenantId),
        eq(timetableEntries.sectionId, sectionId)
    ))
    .execute();

    return entries;
}

export async function createTimetableEntry(tenantId: string, data: any) {
    const { teacherId, roomNumber, sectionId, periodId, dayOfWeek, subjectId } = data;

    // 1. Teacher Conflict check
    if (teacherId) {
        const teacherConflict = await db.select()
            .from(timetableEntries)
            .where(and(
                eq(timetableEntries.tenantId, tenantId),
                eq(timetableEntries.teacherId, teacherId),
                eq(timetableEntries.dayOfWeek, dayOfWeek),
                eq(timetableEntries.periodId, periodId)
            ))
            .limit(1)
            .execute();
        if (teacherConflict.length > 0) {
            throw new Error('Teacher is already assigned to another class/section at this period on this day');
        }
    }

    // 2. Room Conflict check
    if (roomNumber) {
        const roomConflict = await db.select()
            .from(timetableEntries)
            .where(and(
                eq(timetableEntries.tenantId, tenantId),
                eq(timetableEntries.roomNumber, roomNumber),
                eq(timetableEntries.dayOfWeek, dayOfWeek),
                eq(timetableEntries.periodId, periodId)
            ))
            .limit(1)
            .execute();
        if (roomConflict.length > 0) {
            throw new Error('Room is already occupied by another class/section at this period on this day');
        }
    }

    // 3. Section/Class Conflict check
    if (sectionId) {
        const sectionConflict = await db.select()
            .from(timetableEntries)
            .where(and(
                eq(timetableEntries.tenantId, tenantId),
                eq(timetableEntries.sectionId, sectionId),
                eq(timetableEntries.dayOfWeek, dayOfWeek),
                eq(timetableEntries.periodId, periodId)
            ))
            .limit(1)
            .execute();
        if (sectionConflict.length > 0) {
            throw new Error('Class/Section already has a subject scheduled at this period on this day');
        }
    }

    // No conflicts, create entry
    const [newEntry] = await db.insert(timetableEntries).values({
        tenantId,
        sectionId,
        periodId,
        subjectId,
        teacherId,
        dayOfWeek,
        roomNumber,
    }).returning().execute();

    return newEntry;
}

export async function getSubstitutions(tenantId: string) {
    const list = await db.select({
        id: substitutions.id,
        timetableEntryId: substitutions.timetableEntryId,
        originalTeacherId: substitutions.originalTeacherId,
        originalTeacherName: sql<string>`orig.first_name || ' ' || orig.last_name`,
        substituteTeacherId: substitutions.substituteTeacherId,
        substituteTeacherName: sql<string>`sub.first_name || ' ' || sub.last_name`,
        date: substitutions.date,
        reason: substitutions.reason,
    })
    .from(substitutions)
    .innerJoin(sql`users orig`, eq(substitutions.originalTeacherId, sql`orig.id`))
    .innerJoin(sql`users sub`, eq(substitutions.substituteTeacherId, sql`sub.id`))
    .where(eq(substitutions.tenantId, tenantId))
    .execute();

    return list;
}

export async function createSubstitutionRequest(tenantId: string, data: any) {
    const [request] = await db.insert(substitutionRequests).values({
        tenantId,
        teacherId: data.teacherId,
        substituteId: data.substituteId,
        sectionId: data.sectionId,
        period: Number(data.period),
        date: data.date,
        reason: data.reason,
        status: data.status || 'pending',
    }).returning().execute();

    return request;
}
