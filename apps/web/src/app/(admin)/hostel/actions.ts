'use server';

import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { allocateStudent } from '@/lib/actions/hostel';

/**
 * Hostel server actions scoped to this route.
 *
 * `getHostels()` in `lib/actions/hostel.ts` does not select `type`, `address` or
 * `total_rooms`, and `getRooms()` there selects a `hostel_rooms.updated_at`
 * column that does not exist, so the directory/room queries are re-stated here
 * against the real columns.
 */

export type HostelDirectoryRow = {
    id: string;
    name: string;
    type: string;
    address: string | null;
    phone: string | null;
    wardenName: string | null;
    totalRooms: number;
    totalBeds: number;
    occupiedBeds: number;
};

export type RoomOption = {
    id: string;
    hostelId: string;
    roomNumber: string;
    floor: number;
    type: string;
    totalBeds: number;
    occupiedBeds: number;
    status: string;
    takenBedNumbers: string[];
};

export type HostelStudentOption = {
    id: string;
    name: string;
    admissionNumber: string;
    className: string | null;
};

export type HostelActionResult = {
    success: boolean;
    error?: string;
};

/** Hostels with the descriptive columns the overview cards render. */
export async function getHostelDirectory(): Promise<HostelDirectoryRow[]> {
    const { tenantId } = await requireAuth('hostel:read');

    const { rows } = await pool.query(
        `SELECT
             h.id,
             h.name,
             h.type::text AS type,
             h.address,
             h.phone,
             h.total_rooms AS "totalRooms",
             h.total_beds AS "totalBeds",
             h.occupied_beds AS "occupiedBeds",
             CASE WHEN u.id IS NULL THEN NULL ELSE u.first_name || ' ' || u.last_name END AS "wardenName"
         FROM hostels h
         LEFT JOIN users u ON u.id = h.warden_id AND u.tenant_id = h.tenant_id
         WHERE h.tenant_id = $1 AND h.is_active = true
         ORDER BY h.name ASC`,
        [tenantId],
    );

    return rows.map((row) => ({
        id: row.id as string,
        name: row.name as string,
        type: row.type as string,
        address: (row.address as string | null) ?? null,
        phone: (row.phone as string | null) ?? null,
        wardenName: (row.wardenName as string | null) ?? null,
        totalRooms: Number(row.totalRooms ?? 0),
        totalBeds: Number(row.totalBeds ?? 0),
        occupiedBeds: Number(row.occupiedBeds ?? 0),
    }));
}

/** Rooms with the bed numbers currently held by an ACTIVE allocation. */
export async function getRoomOptions(): Promise<RoomOption[]> {
    const { tenantId } = await requireAuth('hostel:read');

    const { rows } = await pool.query(
        `SELECT
             hr.id,
             hr.hostel_id AS "hostelId",
             hr.room_number AS "roomNumber",
             hr.floor,
             hr.type::text AS type,
             hr.total_beds AS "totalBeds",
             hr.occupied_beds AS "occupiedBeds",
             hr.status::text AS status,
             COALESCE(
                 ARRAY(
                     SELECT ha.bed_number
                     FROM hostel_allocations ha
                     WHERE ha.room_id = hr.id AND ha.tenant_id = hr.tenant_id AND ha.status = 'ACTIVE'
                     ORDER BY ha.bed_number
                 ),
                 ARRAY[]::varchar[]
             ) AS "takenBedNumbers"
         FROM hostel_rooms hr
         WHERE hr.tenant_id = $1
         ORDER BY hr.floor ASC, hr.room_number ASC`,
        [tenantId],
    );

    return rows.map((row) => ({
        id: row.id as string,
        hostelId: row.hostelId as string,
        roomNumber: row.roomNumber as string,
        floor: Number(row.floor ?? 0),
        type: row.type as string,
        totalBeds: Number(row.totalBeds ?? 0),
        occupiedBeds: Number(row.occupiedBeds ?? 0),
        status: row.status as string,
        takenBedNumbers: Array.isArray(row.takenBedNumbers)
            ? (row.takenBedNumbers as unknown[]).map((b) => String(b))
            : [],
    }));
}

/** Active students who do not already hold an ACTIVE hostel allocation. */
export async function getAllocatableStudents(): Promise<HostelStudentOption[]> {
    const { tenantId } = await requireAuth('hostel:read');

    const { rows } = await pool.query(
        `SELECT
             s.id,
             s.first_name || ' ' || s.last_name AS name,
             s.admission_number AS "admissionNumber",
             CASE WHEN g.name IS NULL THEN NULL ELSE g.name || ' - ' || COALESCE(sec.name, '') END AS "className"
         FROM students s
         LEFT JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = s.tenant_id
         LEFT JOIN grades g ON g.id = sec.grade_id AND g.tenant_id = s.tenant_id
         WHERE s.tenant_id = $1
           AND s.status = 'ACTIVE'
           AND NOT EXISTS (
               SELECT 1 FROM hostel_allocations ha
               WHERE ha.student_id = s.id AND ha.tenant_id = s.tenant_id AND ha.status = 'ACTIVE'
           )
         ORDER BY s.first_name ASC, s.last_name ASC`,
        [tenantId],
    );

    return rows.map((row) => ({
        id: row.id as string,
        name: row.name as string,
        admissionNumber: row.admissionNumber as string,
        className: (row.className as string | null) ?? null,
    }));
}

/**
 * Allocate a bed. Validates the room/bed against the live table before handing
 * off to the shared `allocateStudent` helper, which keeps the occupancy
 * counters and the hostel fee record in step.
 */
export async function allocateBed(input: {
    studentId: string;
    hostelId: string;
    roomId: string;
    bedNumber: string;
    allocatedFrom: string;
    allocatedTo: string;
}): Promise<HostelActionResult> {
    const { tenantId } = await requireAuth('hostel:write');

    const bedNumber = input.bedNumber?.trim();

    if (!input.studentId) return { success: false, error: 'Select a student.' };
    if (!input.hostelId) return { success: false, error: 'Select a hostel.' };
    if (!input.roomId) return { success: false, error: 'Select a room.' };
    if (!bedNumber) return { success: false, error: 'Enter a bed number.' };
    if (bedNumber.length > 10) return { success: false, error: 'Bed number must be 10 characters or fewer.' };
    if (!input.allocatedFrom || !input.allocatedTo) {
        return { success: false, error: 'Enter both the start and end date of the allocation.' };
    }
    if (input.allocatedTo < input.allocatedFrom) {
        return { success: false, error: 'The end date cannot fall before the start date.' };
    }

    const { rows: studentRows } = await pool.query(
        `SELECT 1 FROM students WHERE id = $1 AND tenant_id = $2 AND status = 'ACTIVE'`,
        [input.studentId, tenantId],
    );
    if (studentRows.length === 0) {
        return { success: false, error: 'That student is not on this school roll.' };
    }

    const { rows: existingRows } = await pool.query(
        `SELECT 1 FROM hostel_allocations
         WHERE tenant_id = $1 AND student_id = $2 AND status = 'ACTIVE'`,
        [tenantId, input.studentId],
    );
    if (existingRows.length > 0) {
        return { success: false, error: 'That student already holds an active hostel allocation.' };
    }

    const { rows: roomRows } = await pool.query(
        `SELECT hr.id, hr.hostel_id AS "hostelId", hr.status::text AS status
         FROM hostel_rooms hr
         WHERE hr.id = $1 AND hr.tenant_id = $2`,
        [input.roomId, tenantId],
    );
    const room = roomRows[0];
    if (!room) return { success: false, error: 'Room not found.' };
    if (room.hostelId !== input.hostelId) {
        return { success: false, error: 'That room does not belong to the selected hostel.' };
    }
    if (room.status === 'MAINTENANCE') {
        return { success: false, error: 'That room is under maintenance.' };
    }

    const { rows: bedRows } = await pool.query(
        `SELECT 1 FROM hostel_allocations
         WHERE tenant_id = $1 AND room_id = $2 AND bed_number = $3 AND status = 'ACTIVE'`,
        [tenantId, input.roomId, bedNumber],
    );
    if (bedRows.length > 0) {
        return { success: false, error: `Bed ${bedNumber} in this room is already occupied.` };
    }

    const result = await allocateStudent({
        studentId: input.studentId,
        hostelId: input.hostelId,
        roomId: input.roomId,
        bedNumber,
        allocatedFrom: input.allocatedFrom,
        allocatedTo: input.allocatedTo,
    });

    if (!result.success) {
        return { success: false, error: result.error ?? 'Allocation failed.' };
    }

    revalidatePath('/hostel');
    revalidatePath('/hostel/fees');
    return { success: true };
}
