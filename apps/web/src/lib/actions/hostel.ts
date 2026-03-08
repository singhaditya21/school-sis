'use server';

import { db } from '@/lib/db';
import { hostels, hostelRooms, hostelAllocations, messMenus, students } from '@/lib/db/schema';
import { eq, and, count, sql, asc, desc } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';

// ─── Get Hostels ─────────────────────────────────────────────

export async function getHostels() {
    const { tenantId } = await requireAuth('hostel:read');

    return db
        .select()
        .from(hostels)
        .where(and(eq(hostels.tenantId, tenantId), eq(hostels.isActive, true)))
        .orderBy(asc(hostels.name));
}

// ─── Get Hostel Stats ────────────────────────────────────────

export async function getHostelStats() {
    const { tenantId } = await requireAuth('hostel:read');

    const hostelList = await db
        .select()
        .from(hostels)
        .where(and(eq(hostels.tenantId, tenantId), eq(hostels.isActive, true)));

    const totalBeds = hostelList.reduce((sum, h) => sum + h.totalBeds, 0);
    const occupiedBeds = hostelList.reduce((sum, h) => sum + h.occupiedBeds, 0);

    return {
        totalHostels: hostelList.length,
        totalBeds,
        occupiedBeds,
        availableBeds: totalBeds - occupiedBeds,
        occupancyRate: totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
    };
}

// ─── Get Rooms ───────────────────────────────────────────────

export async function getRooms(hostelId?: string) {
    const { tenantId } = await requireAuth('hostel:read');

    const conditions = [eq(hostelRooms.tenantId, tenantId)];
    if (hostelId) conditions.push(eq(hostelRooms.hostelId, hostelId));

    return db
        .select()
        .from(hostelRooms)
        .where(and(...conditions))
        .orderBy(asc(hostelRooms.floor), asc(hostelRooms.roomNumber));
}

// ─── Get Allocations ─────────────────────────────────────────

export async function getAllocations(filters?: { hostelId?: string; status?: string }) {
    const { tenantId } = await requireAuth('hostel:read');

    const conditions = [eq(hostelAllocations.tenantId, tenantId)];
    if (filters?.hostelId) conditions.push(eq(hostelAllocations.hostelId, filters.hostelId));
    if (filters?.status) conditions.push(eq(hostelAllocations.status, filters.status as 'ACTIVE' | 'VACATED' | 'PENDING'));

    return db
        .select({
            id: hostelAllocations.id,
            studentId: hostelAllocations.studentId,
            studentName: sql<string>`${students.firstName} || ' ' || ${students.lastName}`,
            hostelId: hostelAllocations.hostelId,
            hostelName: hostels.name,
            roomNumber: hostelRooms.roomNumber,
            bedNumber: hostelAllocations.bedNumber,
            allocatedFrom: hostelAllocations.allocatedFrom,
            allocatedTo: hostelAllocations.allocatedTo,
            status: hostelAllocations.status,
        })
        .from(hostelAllocations)
        .leftJoin(students, eq(hostelAllocations.studentId, students.id))
        .leftJoin(hostels, eq(hostelAllocations.hostelId, hostels.id))
        .leftJoin(hostelRooms, eq(hostelAllocations.roomId, hostelRooms.id))
        .where(and(...conditions))
        .orderBy(desc(hostelAllocations.createdAt));
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

    // Check room availability
    const [room] = await db.select().from(hostelRooms)
        .where(and(eq(hostelRooms.id, data.roomId), eq(hostelRooms.tenantId, tenantId)));

    if (!room) return { success: false, error: 'Room not found' };
    if (room.occupiedBeds >= room.totalBeds) return { success: false, error: 'Room is full' };

    await db.insert(hostelAllocations).values({
        tenantId,
        studentId: data.studentId,
        hostelId: data.hostelId,
        roomId: data.roomId,
        bedNumber: data.bedNumber,
        allocatedFrom: data.allocatedFrom,
        allocatedTo: data.allocatedTo,
        status: 'ACTIVE',
    });

    // Update room occupancy
    await db.update(hostelRooms)
        .set({ occupiedBeds: room.occupiedBeds + 1, status: room.occupiedBeds + 1 >= room.totalBeds ? 'FULL' : 'AVAILABLE' })
        .where(eq(hostelRooms.id, data.roomId));

    // Update hostel occupancy
    await db.update(hostels)
        .set({ occupiedBeds: sql`${hostels.occupiedBeds} + 1` })
        .where(eq(hostels.id, data.hostelId));

    return { success: true };
}

// ─── Vacate Student ──────────────────────────────────────────

export async function vacateStudent(allocationId: string) {
    const { tenantId } = await requireAuth('hostel:write');

    const [allocation] = await db.select().from(hostelAllocations)
        .where(and(eq(hostelAllocations.id, allocationId), eq(hostelAllocations.tenantId, tenantId)));

    if (!allocation) return { success: false, error: 'Allocation not found' };

    await db.update(hostelAllocations)
        .set({ status: 'VACATED', updatedAt: new Date() })
        .where(eq(hostelAllocations.id, allocationId));

    // Update room occupancy
    await db.update(hostelRooms)
        .set({ occupiedBeds: sql`GREATEST(${hostelRooms.occupiedBeds} - 1, 0)`, status: 'AVAILABLE' })
        .where(eq(hostelRooms.id, allocation.roomId));

    // Update hostel occupancy
    await db.update(hostels)
        .set({ occupiedBeds: sql`GREATEST(${hostels.occupiedBeds} - 1, 0)` })
        .where(eq(hostels.id, allocation.hostelId));

    return { success: true };
}

// ─── Get Mess Menu ───────────────────────────────────────────

export async function getMessMenu(hostelId: string) {
    const { tenantId } = await requireAuth('hostel:read');

    return db
        .select()
        .from(messMenus)
        .where(and(eq(messMenus.tenantId, tenantId), eq(messMenus.hostelId, hostelId)))
        .orderBy(sql`CASE day WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 WHEN 'Sunday' THEN 7 END`);
}
