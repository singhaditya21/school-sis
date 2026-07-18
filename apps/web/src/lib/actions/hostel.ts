'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

// ─── Get Hostels ─────────────────────────────────────────────

export async function getHostels() {
    const { tenantId } = await requireAuth('hostel:read');

    const result = await pool.query(
        'SELECT id, tenant_id AS "tenantId", name, is_active AS "isActive", total_beds AS "totalBeds", occupied_beds AS "occupiedBeds", created_at AS "createdAt", updated_at AS "updatedAt" FROM hostels WHERE tenant_id = $1 AND is_active = true ORDER BY name ASC',
        [tenantId]
    );
    
    return result.rows;
}

// ─── Get Hostel Stats ────────────────────────────────────────

export async function getHostelStats() {
    const { tenantId } = await requireAuth('hostel:read');

    const result = await pool.query(
        'SELECT total_beds AS "totalBeds", occupied_beds AS "occupiedBeds" FROM hostels WHERE tenant_id = $1 AND is_active = true',
        [tenantId]
    );

    const hostelList = result.rows;

    const totalBeds = hostelList.reduce((sum, h) => sum + Number(h.totalBeds || 0), 0);
    const occupiedBeds = hostelList.reduce((sum, h) => sum + Number(h.occupiedBeds || 0), 0);

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

    let query = 'SELECT id, tenant_id AS "tenantId", hostel_id AS "hostelId", floor, room_number AS "roomNumber", total_beds AS "totalBeds", occupied_beds AS "occupiedBeds", status, created_at AS "createdAt", updated_at AS "updatedAt" FROM hostel_rooms WHERE tenant_id = $1';
    const params: unknown[] = [tenantId];

    if (hostelId) {
        params.push(hostelId);
        query += ` AND hostel_id = $${params.length}`;
    }
    
    query += ' ORDER BY floor ASC, room_number ASC';

    const result = await pool.query(query, params);
    return result.rows;
}

// ─── Get Allocations ─────────────────────────────────────────

export async function getAllocations(filters?: { hostelId?: string; status?: string }) {
    const { tenantId } = await requireAuth('hostel:read');

    let query = `
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
        WHERE ha.tenant_id = $1`;
    
    const params: unknown[] = [tenantId];

    if (filters?.hostelId) {
        params.push(filters.hostelId);
        query += ` AND ha.hostel_id = $${params.length}`;
    }
    if (filters?.status) {
        params.push(filters.status);
        query += ` AND ha.status = $${params.length}`;
    }
    
    query += ' ORDER BY ha.created_at DESC';

    const result = await pool.query(query, params);
    return result.rows.map(row => ({
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

    // Check room availability
    const roomResult = await pool.query(
        'SELECT id, occupied_beds AS "occupiedBeds", total_beds AS "totalBeds" FROM hostel_rooms WHERE id = $1 AND tenant_id = $2',
        [data.roomId, tenantId]
    );
    
    const room = roomResult.rows[0];

    if (!room) return { success: false, error: 'Room not found' };
    if (room.occupiedBeds >= room.totalBeds) return { success: false, error: 'Room is full' };

    await pool.query(
        `INSERT INTO hostel_allocations (tenant_id, student_id, hostel_id, room_id, bed_number, allocated_from, allocated_to, status) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [tenantId, data.studentId, data.hostelId, data.roomId, data.bedNumber, data.allocatedFrom, data.allocatedTo, 'ACTIVE']
    );

    // Update room occupancy
    const newStatus = room.occupiedBeds + 1 >= room.totalBeds ? 'FULL' : 'AVAILABLE';
    await pool.query(
        'UPDATE hostel_rooms SET occupied_beds = occupied_beds + 1, status = $1 WHERE id = $2',
        [newStatus, data.roomId]
    );

    // Update hostel occupancy
    await pool.query(
        'UPDATE hostels SET occupied_beds = occupied_beds + 1 WHERE id = $1',
        [data.hostelId]
    );

    // E2E-COM-301: Auto-generate hostel fee record
    await pool.query(
        `INSERT INTO hostel_fees (tenant_id, student_id, fee_type, amount, due_date, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [tenantId, data.studentId, 'hostel', 15000.00, data.allocatedFrom, 'pending']
    );

    return { success: true };
}

// ─── Vacate Student ──────────────────────────────────────────

export async function vacateStudent(allocationId: string) {
    const { tenantId } = await requireAuth('hostel:write');

    const allocationResult = await pool.query(
        'SELECT room_id AS "roomId", hostel_id AS "hostelId" FROM hostel_allocations WHERE id = $1 AND tenant_id = $2',
        [allocationId, tenantId]
    );
    
    const allocation = allocationResult.rows[0];

    if (!allocation) return { success: false, error: 'Allocation not found' };

    await pool.query(
        "UPDATE hostel_allocations SET status = 'VACATED', updated_at = NOW() WHERE id = $1",
        [allocationId]
    );

    // Update room occupancy
    await pool.query(
        "UPDATE hostel_rooms SET occupied_beds = GREATEST(occupied_beds - 1, 0), status = 'AVAILABLE' WHERE id = $1",
        [allocation.roomId]
    );

    // Update hostel occupancy
    await pool.query(
        'UPDATE hostels SET occupied_beds = GREATEST(occupied_beds - 1, 0) WHERE id = $1',
        [allocation.hostelId]
    );

    // E2E-WRK-401: Waitlist reallocation logic
    // Find the oldest PENDING (waitlisted) allocation for this hostel
    const pendingRes = await pool.query(
        `SELECT id, student_id AS "studentId", room_id AS "roomId", bed_number AS "bedNumber" 
         FROM hostel_allocations 
         WHERE tenant_id = $1 AND hostel_id = $2 AND status = 'PENDING' 
         ORDER BY created_at ASC LIMIT 1`,
        [tenantId, allocation.hostelId]
    );
    
    if (pendingRes.rows.length > 0) {
        const pendingAllocation = pendingRes.rows[0];
        
        // Activate the pending allocation
        await pool.query(
            "UPDATE hostel_allocations SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1",
            [pendingAllocation.id]
        );
        
        // Update room occupancy for newly activated allocation
        await pool.query(
            "UPDATE hostel_rooms SET occupied_beds = occupied_beds + 1, status = CASE WHEN occupied_beds + 1 >= total_beds THEN 'FULL'::room_status ELSE 'AVAILABLE'::room_status END WHERE id = $1",
            [pendingAllocation.roomId]
        );
        
        // Update hostel occupancy
        await pool.query(
            "UPDATE hostels SET occupied_beds = occupied_beds + 1 WHERE id = $1",
            [allocation.hostelId]
        );
    }

    return { success: true };
}

// ─── Get Mess Menu ───────────────────────────────────────────

export async function getMessMenu(hostelId: string) {
    const { tenantId } = await requireAuth('hostel:read');

    const result = await pool.query(
        `SELECT id, tenant_id AS "tenantId", hostel_id AS "hostelId", day, breakfast, lunch, snacks, dinner, updated_at AS "updatedAt" 
         FROM mess_menus 
         WHERE tenant_id = $1 AND hostel_id = $2 
         ORDER BY CASE day 
            WHEN 'Monday' THEN 1 
            WHEN 'Tuesday' THEN 2 
            WHEN 'Wednesday' THEN 3 
            WHEN 'Thursday' THEN 4 
            WHEN 'Friday' THEN 5 
            WHEN 'Saturday' THEN 6 
            WHEN 'Sunday' THEN 7 
         END`,
        [tenantId, hostelId]
    );
    
    return result.rows;
}
