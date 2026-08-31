'use server';

// Hostel Management Service — Production (Real DB)
import { pool } from '@/lib/db';
import { tenantScope, eq } from '../../data';
import { requireAuth } from '@/lib/auth/middleware';
import { hostels, hostelRooms, hostelAllocations, hostelFees } from '../../db/generated/tables';
import type { Hostel, HostelRoom } from './types';

export async function getHostels(tenantId: string): Promise<Hostel[]> {
    const rows = await tenantScope(tenantId)
        .from(hostels)
        .select<{ id: string; name: string; type: string; totalRooms: number; totalBeds: number; occupiedBeds: number }>({
            id: hostels.id,
            name: hostels.name,
            type: hostels.type,
            totalRooms: hostels.totalRooms,
            totalBeds: hostels.totalBeds,
            occupiedBeds: hostels.occupiedBeds,
        })
        .rows();
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
    const rows = await tenantScope(tenantId)
        .from(hostelRooms)
        .select<{ id: string; hostelId: string; roomNumber: string; floor: number; totalBeds: number; occupiedBeds: number; type: string; status: string }>({
            id: hostelRooms.id,
            hostelId: hostelRooms.hostelId,
            roomNumber: hostelRooms.roomNumber,
            floor: hostelRooms.floor,
            totalBeds: hostelRooms.totalBeds,
            occupiedBeds: hostelRooms.occupiedBeds,
            type: hostelRooms.type,
            status: hostelRooms.status,
        })
        .where(eq(hostelRooms.hostelId, hostelId))
        .rows();
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
    const scope = tenantScope(tenantId);
    const hostelList = await scope
        .from(hostels)
        .select<{ totalBeds: number; occupiedBeds: number }>({ totalBeds: hostels.totalBeds, occupiedBeds: hostels.occupiedBeds })
        .rows();
    const roomsList = await scope
        .from(hostelRooms)
        .select<{ status: string }>({ status: hostelRooms.status })
        .rows();
    const activeAllocations = await scope
        .from(hostelAllocations)
        .select<{ id: string }>({ id: hostelAllocations.id })
        .where(eq(hostelAllocations.status, 'ACTIVE'))
        .rows();

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
    const scope = tenantScope(tenantId);
    const hostelList = await scope
        .from(hostels)
        .select<{ id: string; name: string; type: string; totalBeds: number; occupiedBeds: number }>({
            id: hostels.id, name: hostels.name, type: hostels.type,
            totalBeds: hostels.totalBeds, occupiedBeds: hostels.occupiedBeds,
        })
        .rows();
    const roomsList = await scope
        .from(hostelRooms)
        .select<{ id: string; roomNumber: string; status: string }>({
            id: hostelRooms.id, roomNumber: hostelRooms.roomNumber, status: hostelRooms.status,
        })
        .rows();
    const activeAllocations = await scope
        .from(hostelAllocations)
        .select<{ id: string; studentId: string; status: string }>({
            id: hostelAllocations.id, studentId: hostelAllocations.studentId, status: hostelAllocations.status,
        })
        .where(eq(hostelAllocations.status, 'ACTIVE'))
        .rows();

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
    const params: string[] = [tenantId];
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
    const fee = await tenantScope(tenantId)
        .from(hostelFees)
        .select<{ id: string }>({ id: hostelFees.id })
        .where(eq(hostelFees.id, feeId))
        .first();

    if (!fee) {
        throw new Error('Fee record not found');
    }

    return {
        success: false,
        message: 'Hostel payment reminders are unavailable until a live notification workflow is configured.',
    };
}
