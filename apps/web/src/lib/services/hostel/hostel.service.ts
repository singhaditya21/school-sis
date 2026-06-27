'use server';

// Hostel Management Service — Production (Real DB)
import { db, pool } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import type { Hostel, HostelRoom } from './types';

export async function getHostels(tenantId: string): Promise<Hostel[]> {
    await (tenantId);
    const rows = await db.execute(sql`SELECT h.id,h.name,h.type,u.first_name||' '||u.last_name AS warden,(SELECT COUNT(*) FROM hostel_rooms WHERE hostel_id=h.id) AS "totalRooms",(SELECT COUNT(*) FROM hostel_rooms WHERE hostel_id=h.id AND status='occupied') AS "occupiedRooms",h.capacity,(SELECT COUNT(*) FROM hostel_allocations WHERE hostel_id=h.id AND status='ACTIVE') AS "currentOccupancy" FROM hostels h LEFT JOIN users u ON u.id=h.warden_id WHERE h.tenant_id=${tenantId} ORDER BY h.name`);
    return rows as Hostel[];
}

export async function getRooms(tenantId: string, hostelId: string): Promise<HostelRoom[]> {
    await (tenantId);
    const rows = await db.execute(sql`SELECT hr.id,hr.hostel_id AS "hostelId",hr.room_number AS "roomNumber",hr.floor,hr.capacity,(SELECT COUNT(*) FROM hostel_allocations WHERE room_id=hr.id AND status='ACTIVE') AS occupants,hr.type,hr.status FROM hostel_rooms hr WHERE hr.hostel_id=${hostelId} AND hr.tenant_id=${tenantId} ORDER BY hr.floor,hr.room_number`);
    return rows as HostelRoom[];
}

export async function getStats(tenantId: string) {
    await (tenantId);
    const [s] = await db.execute(sql`SELECT (SELECT COUNT(*) FROM hostels WHERE tenant_id=${tenantId}) AS "totalHostels",(SELECT COUNT(*) FROM hostel_rooms WHERE tenant_id=${tenantId}) AS "totalRooms",(SELECT COUNT(*) FROM hostel_allocations WHERE tenant_id=${tenantId} AND status='ACTIVE') AS "totalOccupants",(SELECT COUNT(*) FROM hostel_rooms WHERE tenant_id=${tenantId} AND status='maintenance') AS "underMaintenance"`) as any[];
    return { totalHostels: Number(s?.totalHostels||0), totalRooms: Number(s?.totalRooms||0), totalOccupants: Number(s?.totalOccupants||0), underMaintenance: Number(s?.underMaintenance||0) };
}

export async function getHostelFees(status?: string, feeType?: string): Promise<any[]> {
    const { tenantId } = await requireAuth('hostel:read');

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
