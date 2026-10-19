'use server';

import { sql } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

// ─── Get Allocations ─────────────────────────────────────────

export async function getAllocations(filters?: { hostelId?: string; status?: string }) {
    const { tenantId } = await requireAuth('hostel:read');

    const hostelFilter = filters?.hostelId ? sql`AND ha.hostel_id = ${filters.hostelId}` : sql``;
    const statusFilter = filters?.status ? sql`AND ha.status = ${filters.status}` : sql``;

    const rows = await sql<{
        id: string;
        studentId: string;
        studentName: string | null;
        hostelId: string;
        hostelName: string | null;
        roomNumber: string | null;
        bedNumber: string;
        allocatedFrom: Date | string | null;
        allocatedTo: Date | string | null;
        status: string;
    }>`
        SELECT 
            ha.id, 
            ha.student_id AS "studentId", 
            s.first_name || ' ' || s.last_name AS "studentName", 
            ha.hostel_id AS "hostelId", 
            h.name AS "hostelName", 
            hr.room_number AS "roomNumber", 
            ha.bed_number AS "bedNumber", 
            ha.allocated_from AS "allocatedFrom", 
            ha.allocated_to AS "allocatedTo", 
            ha.status 
        FROM hostel_allocations ha
        LEFT JOIN students s ON ha.student_id = s.id
        LEFT JOIN hostels h ON ha.hostel_id = h.id
        LEFT JOIN hostel_rooms hr ON ha.room_id = hr.id
        WHERE ha.tenant_id = ${tenantId}
          ${hostelFilter}
          ${statusFilter}
        ORDER BY ha.created_at DESC
    `;

    return rows.map(row => ({
        ...row,
        allocatedFrom: row.allocatedFrom ? new Date(row.allocatedFrom).toISOString().split('T')[0] : '',
        allocatedTo: row.allocatedTo ? new Date(row.allocatedTo).toISOString().split('T')[0] : '',
    }));
}

// ─── Allocate Student ────────────────────────────────────────

export async function allocateStudent(data: {
    studentId: string;
    hostelId: string;
    roomId: string;
    bedNumber: string;
    allocatedFrom: string;
    allocatedTo: string;
}) {
    const { tenantId } = await requireAuth('hostel:write');

    const room = await sql<{ id: string; occupiedBeds: number; totalBeds: number }>`
        SELECT id, occupied_beds AS "occupiedBeds", total_beds AS "totalBeds"
        FROM hostel_rooms
        WHERE id = ${data.roomId} AND tenant_id = ${tenantId}
    `.maybeOne();

    if (!room) return { success: false, error: 'Room not found' };
    if (room.occupiedBeds >= room.totalBeds) return { success: false, error: 'Room is full' };

    await sql`
        INSERT INTO hostel_allocations (tenant_id, student_id, hostel_id, room_id, bed_number, allocated_from, allocated_to, status) 
        VALUES (${tenantId}, ${data.studentId}, ${data.hostelId}, ${data.roomId}, ${data.bedNumber}, ${data.allocatedFrom}, ${data.allocatedTo}, 'ACTIVE')
    `.execute();

    const newStatus = room.occupiedBeds + 1 >= room.totalBeds ? 'FULL' : 'AVAILABLE';
    await sql`
        UPDATE hostel_rooms
        SET occupied_beds = occupied_beds + 1, status = ${newStatus}
        WHERE id = ${data.roomId}
    `.execute();

    await sql`
        UPDATE hostels
        SET occupied_beds = occupied_beds + 1
        WHERE id = ${data.hostelId}
    `.execute();

    // E2E-COM-301: Auto-generate hostel fee record
    await sql`
        INSERT INTO hostel_fees (tenant_id, student_id, fee_type, amount, due_date, status)
        VALUES (${tenantId}, ${data.studentId}, 'hostel', ${15000.00}, ${data.allocatedFrom}, 'pending')
    `.execute();

    return { success: true };
}

// ─── Vacate Student ──────────────────────────────────────────

export async function vacateStudent(allocationId: string) {
    const { tenantId } = await requireAuth('hostel:write');

    const allocation = await sql<{ roomId: string; hostelId: string }>`
        SELECT room_id AS "roomId", hostel_id AS "hostelId"
        FROM hostel_allocations
        WHERE id = ${allocationId} AND tenant_id = ${tenantId}
    `.maybeOne();

    if (!allocation) return { success: false, error: 'Allocation not found' };

    await sql`
        UPDATE hostel_allocations
        SET status = 'VACATED', updated_at = NOW()
        WHERE id = ${allocationId}
    `.execute();

    await sql`
        UPDATE hostel_rooms
        SET occupied_beds = GREATEST(occupied_beds - 1, 0), status = 'AVAILABLE'
        WHERE id = ${allocation.roomId}
    `.execute();

    await sql`
        UPDATE hostels
        SET occupied_beds = GREATEST(occupied_beds - 1, 0)
        WHERE id = ${allocation.hostelId}
    `.execute();

    // E2E-WRK-401: Waitlist reallocation logic
    const pendingAllocation = await sql<{
        id: string;
        studentId: string;
        roomId: string;
        bedNumber: string;
    }>`
        SELECT id, student_id AS "studentId", room_id AS "roomId", bed_number AS "bedNumber" 
        FROM hostel_allocations 
        WHERE tenant_id = ${tenantId} AND hostel_id = ${allocation.hostelId} AND status = 'PENDING' 
        ORDER BY created_at ASC
        LIMIT 1
    `.maybeOne();

    if (pendingAllocation) {
        await sql`
            UPDATE hostel_allocations
            SET status = 'ACTIVE', updated_at = NOW()
            WHERE id = ${pendingAllocation.id}
        `.execute();

        await sql`
            UPDATE hostel_rooms
            SET occupied_beds = occupied_beds + 1,
                status = CASE WHEN occupied_beds + 1 >= total_beds THEN 'FULL'::room_status ELSE 'AVAILABLE'::room_status END
            WHERE id = ${pendingAllocation.roomId}
        `.execute();

        await sql`
            UPDATE hostels
            SET occupied_beds = occupied_beds + 1
            WHERE id = ${allocation.hostelId}
        `.execute();
    }

    return { success: true };
}

// ─── Get Mess Menu ───────────────────────────────────────────

export async function getMessMenu(hostelId: string) {
    const { tenantId } = await requireAuth('hostel:read');

    return sql`
        SELECT id, tenant_id AS "tenantId", hostel_id AS "hostelId", day, breakfast, lunch, snacks, dinner, updated_at AS "updatedAt" 
        FROM mess_menus 
        WHERE tenant_id = ${tenantId} AND hostel_id = ${hostelId} 
        ORDER BY CASE day 
            WHEN 'Monday' THEN 1 
            WHEN 'Tuesday' THEN 2 
            WHEN 'Wednesday' THEN 3 
            WHEN 'Thursday' THEN 4 
            WHEN 'Friday' THEN 5 
            WHEN 'Saturday' THEN 6 
            WHEN 'Sunday' THEN 7 
        END
    `;
}
