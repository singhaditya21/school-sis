'use server';

// Hostel Management Service — Production (Real DB)
import { randomUUID } from 'crypto';
import { pool } from '@/lib/db';
import { tenantScope, eq } from '../../data';
import { requireAuth } from '@/lib/auth/middleware';
import {
    hostels,
    hostelRooms,
    hostelAllocations,
    hostelFees,
    students,
    users,
    notificationOutbox,
} from '../../db/generated/tables';
import type { Hostel, HostelRoom } from './types';

export async function getHostels(tenantId: string): Promise<Hostel[]> {
    const scope = tenantScope(tenantId);
    const [rows, roomRows] = await Promise.all([
        scope
            .from(hostels)
            .leftJoin(users, eq(users.id, hostels.wardenId))
            .select<{
                id: string;
                name: string;
                type: string;
                totalRooms: number;
                totalBeds: number;
                occupiedBeds: number;
                wardenFirstName: string | null;
                wardenLastName: string | null;
            }>({
                id: hostels.id,
                name: hostels.name,
                type: hostels.type,
                totalRooms: hostels.totalRooms,
                totalBeds: hostels.totalBeds,
                occupiedBeds: hostels.occupiedBeds,
                wardenFirstName: users.firstName,
                wardenLastName: users.lastName,
            })
            .rows(),
        scope
            .from(hostelRooms)
            .select<{ hostelId: string; occupiedBeds: number }>({
                hostelId: hostelRooms.hostelId,
                occupiedBeds: hostelRooms.occupiedBeds,
            })
            .rows(),
    ]);

    const occupiedRoomsByHostel = new Map<string, number>();
    for (const room of roomRows) {
        if ((room.occupiedBeds ?? 0) > 0) {
            occupiedRoomsByHostel.set(
                room.hostelId,
                (occupiedRoomsByHostel.get(room.hostelId) ?? 0) + 1,
            );
        }
    }

    return rows.map(r => ({
        id: r.id,
        name: r.name,
        type: r.type.toLowerCase() as Hostel['type'],
        warden: r.wardenFirstName ? `${r.wardenFirstName} ${r.wardenLastName ?? ''}`.trim() : '',
        totalRooms: r.totalRooms,
        occupiedRooms: occupiedRoomsByHostel.get(r.id) ?? 0,
        capacity: r.totalBeds,
        currentOccupancy: r.occupiedBeds,
    }));
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

export interface HostelFeeRow {
    id: string;
    studentId: string | null;
    studentName: string;
    class: string | null;
    hostelName: string | null;
    roomNumber: string | null;
    feeType: string;
    amount: number;
    dueDate: string | null;
    status: string;
    paidDate: string | null;
}

export async function getHostelFees(
    tenantIdOrStatus?: string,
    filtersOrFeeType?: { status?: string; feeType?: string } | string
): Promise<HostelFeeRow[]> {
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
    const scope = tenantScope(tenantId);
    const fee = await scope
        .from(hostelFees)
        .innerJoin(students, eq(students.id, hostelFees.studentId))
        .select<{
            id: string;
            studentId: string;
            feeType: string;
            amount: string;
            dueDate: Date;
            status: string;
            firstName: string;
            lastName: string;
            admissionNumber: string;
        }>({
            id: hostelFees.id,
            studentId: hostelFees.studentId,
            feeType: hostelFees.feeType,
            amount: hostelFees.amount,
            dueDate: hostelFees.dueDate,
            status: hostelFees.status,
            firstName: students.firstName,
            lastName: students.lastName,
            admissionNumber: students.admissionNumber,
        })
        .where(eq(hostelFees.id, feeId))
        .first();

    if (!fee) {
        throw new Error('Fee record not found');
    }

    const studentName = `${fee.firstName} ${fee.lastName}`.trim();
    const dueStr = fee.dueDate instanceof Date ? fee.dueDate.toISOString().split('T')[0] : String(fee.dueDate);
    const idempotencyKey = `hostel-fee-reminder:${fee.id}:${new Date().toISOString().slice(0, 10)}`;

    const existing = await scope
        .from(notificationOutbox)
        .select<{ id: string }>({ id: notificationOutbox.id })
        .where(eq(notificationOutbox.idempotencyKey, idempotencyKey))
        .first();

    const notificationId = existing?.id ?? randomUUID();

    if (!existing) {
        await scope.insert(notificationOutbox, {
            id: notificationId,
            channel: 'IN_APP',
            status: 'QUEUED',
            provider: 'database',
            recipient: fee.admissionNumber || fee.studentId,
            subject: `Hostel ${fee.feeType} Fee Reminder`,
            body: `Reminder: Hostel ${fee.feeType} fee of ₹${Number(fee.amount || 0).toLocaleString('en-IN')} for ${studentName} is due on ${dueStr}.`,
            payload: {
                feeId: fee.id,
                studentId: fee.studentId,
                feeType: fee.feeType,
                amount: Number(fee.amount || 0),
                dueDate: dueStr,
            },
            idempotencyKey,
        });
    }

    return {
        success: true,
        notificationId,
        message: `Payment reminder queued for ${studentName}.`,
    };
}
