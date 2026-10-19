'use server';

// Hostel Management Service — Production (Real DB)
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

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
