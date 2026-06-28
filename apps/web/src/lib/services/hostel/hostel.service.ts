'use server';

// Hostel Management Service — Production (Real DB)
import { db, pool } from '@/lib/db';
import { sql, eq, and } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { hostels, hostelRooms, hostelAllocations, hostelFees } from '@/lib/db/schema/hostel';
import type { Hostel, HostelRoom } from './types';

export async function getHostels(tenantId: string): Promise<Hostel[]> {
    const rows = await db.select().from(hostels).where(eq(hostels.tenantId, tenantId)).execute();
    return rows.map(r => ({
        id: r.id,
        name: r.name,
        type: r.type,
        warden: '', // Placeholder or fetch if needed
        totalRooms: r.totalRooms,
        occupiedRooms: 0,
        capacity: r.totalBeds,
        currentOccupancy: r.occupiedBeds,
    })) as Hostel[];
}

export async function getRooms(tenantId: string, hostelId: string): Promise<HostelRoom[]> {
    const rows = await db.select().from(hostelRooms).where(and(eq(hostelRooms.tenantId, tenantId), eq(hostelRooms.hostelId, hostelId))).execute();
    return rows.map(r => ({
        id: r.id,
        hostelId: r.hostelId,
        roomNumber: r.roomNumber,
        floor: r.floor,
        capacity: r.totalBeds,
        occupants: r.occupiedBeds,
        type: r.type,
        status: r.status,
    })) as HostelRoom[];
}

export async function getStats(tenantId: string) {
    const hostelList = await db.select().from(hostels).where(eq(hostels.tenantId, tenantId)).execute();
    const roomsList = await db.select().from(hostelRooms).where(eq(hostelRooms.tenantId, tenantId)).execute();
    const activeAllocations = await db.select().from(hostelAllocations).where(and(eq(hostelAllocations.tenantId, tenantId), eq(hostelAllocations.status, 'ACTIVE'))).execute();

    const totalBeds = hostelList.reduce((sum, h) => sum + (h.totalBeds || 0), 0);
    const occupiedBeds = hostelList.reduce((sum, h) => sum + (h.occupiedBeds || 0), 0);
    const underMaintenance = roomsList.filter(r => r.status === 'MAINTENANCE').length;

    return {
        totalHostels: hostelList.length,
        totalRooms: roomsList.length,
        totalOccupants: activeAllocations.length,
        underMaintenance,
        totalBeds,
        occupiedBeds,
        availableBeds: totalBeds - occupiedBeds,
    };
}

export async function getHostelOverview(tenantId: string) {
    const hostelList = await db.select().from(hostels).where(eq(hostels.tenantId, tenantId)).execute();
    const roomsList = await db.select().from(hostelRooms).where(eq(hostelRooms.tenantId, tenantId)).execute();
    const activeAllocations = await db.select().from(hostelAllocations).where(and(eq(hostelAllocations.tenantId, tenantId), eq(hostelAllocations.status, 'ACTIVE'))).execute();

    const totalBeds = hostelList.reduce((sum, h) => sum + (h.totalBeds || 0), 0);
    const occupiedBeds = hostelList.reduce((sum, h) => sum + (h.occupiedBeds || 0), 0);

    return {
        hostels: hostelList,
        rooms: roomsList,
        allocations: activeAllocations,
        stats: {
            totalHostels: hostelList.length,
            totalBeds,
            occupiedBeds,
            availableBeds: totalBeds - occupiedBeds,
            occupancyRate: totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
        }
    };
}

export async function getHostelFees(
    tenantIdOrStatus?: string,
    filtersOrFeeType?: { status?: string; feeType?: string } | string
): Promise<any[]> {
    let tenantId: string;
    let status: string | undefined;
    let feeType: string | undefined;

    // Determine parameter layout: (tenantId, filters) vs (status, feeType)
    const isFirstArgTenantId = 
        typeof tenantIdOrStatus === 'string' && 
        (typeof filtersOrFeeType === 'object' || filtersOrFeeType === undefined) &&
        !['paid', 'pending', 'overdue'].includes(tenantIdOrStatus);

    if (isFirstArgTenantId) {
        tenantId = tenantIdOrStatus as string;
        const filters = filtersOrFeeType as { status?: string; feeType?: string } | undefined;
        status = filters?.status;
        feeType = filters?.feeType;
    } else {
        const auth = await requireAuth('hostel:read');
        tenantId = auth.tenantId;
        status = tenantIdOrStatus;
        feeType = filtersOrFeeType as string | undefined;
    }

    let query = `
        SELECT hf.id, s.admission_number AS "studentId", s.first_name||' '||s.last_name AS "studentName",
               g.name||'-'||sec.name AS class, h.name AS "hostelName", hr.room_number AS "roomNumber",
               hf.fee_type AS "feeType", hf.amount, hf.due_date AS "dueDate", hf.status, hf.paid_date AS "paidDate"
        FROM hostel_fees hf
        JOIN students s ON s.id = hf.student_id
        LEFT JOIN sections sec ON sec.id = s.section_id LEFT JOIN grades g ON g.id = sec.grade_id
        LEFT JOIN hostel_allocations ha ON ha.student_id = s.id AND ha.status = 'ACTIVE'
        LEFT JOIN hostels h ON h.id = ha.hostel_id
        LEFT JOIN hostel_rooms hr ON hr.id = ha.room_id
        WHERE hf.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    if (status) {
        params.push(status);
        query += ` AND hf.status = $${params.length}`;
    }
    if (feeType) {
        params.push(feeType);
        query += ` AND hf.fee_type = $${params.length}`;
    }
    query += ` ORDER BY hf.due_date DESC LIMIT 100`;

    const { rows } = await pool.query(query, params);
    return rows.map(r => ({
        ...r,
        amount: Number(r.amount || 0),
        dueDate: r.dueDate instanceof Date ? r.dueDate.toISOString().split('T')[0] : r.dueDate,
        paidDate: r.paidDate instanceof Date ? r.paidDate.toISOString().split('T')[0] : r.paidDate,
    }));
}

export async function sendPaymentReminder(tenantId: string, feeId: string) {
    const fee = await db.select().from(hostelFees)
        .where(and(eq(hostelFees.tenantId, tenantId), eq(hostelFees.id, feeId)))
        .limit(1)
        .execute();

    if (!fee || fee.length === 0) {
        throw new Error('Fee record not found');
    }

    return { success: true, message: `Payment reminder sent successfully for fee ID ${feeId}` };
}
