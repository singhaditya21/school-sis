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
    status?: string,
    feeType?: string
): Promise<HostelFeeRow[]> {
    const auth = await requireAuth('hostel:read');
    const tenantId = auth.tenantId;

    let query = `
        SELECT hf.id, s.admission_number AS "studentId", s.first_name||' '||s.last_name AS "studentName",
               g.name||'-'||sec.name AS class, h.name AS "hostelName", hr.room_number AS "roomNumber",
               hf.fee_type AS "feeType", hf.amount, hf.due_date AS "dueDate", hf.status, hf.paid_date AS "paidDate"
        FROM hostel_fees hf
        JOIN students s ON s.id = hf.student_id AND s.tenant_id = hf.tenant_id
        LEFT JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = hf.tenant_id
        LEFT JOIN grades g ON g.id = sec.grade_id AND g.tenant_id = hf.tenant_id
        LEFT JOIN hostel_allocations ha ON ha.student_id = s.id AND ha.tenant_id = hf.tenant_id AND ha.status = 'ACTIVE'
        LEFT JOIN hostels h ON h.id = ha.hostel_id AND h.tenant_id = hf.tenant_id
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

    type RawHostelFeeRow = Omit<HostelFeeRow, 'amount' | 'dueDate' | 'paidDate'> & {
        amount: string | number | null;
        dueDate: Date | string | null;
        paidDate: Date | string | null;
    };
    const { rows } = await pool.query<RawHostelFeeRow>(query, params);
    return rows.map((r) => ({
        ...r,
        amount: Number(r.amount || 0),
        dueDate: r.dueDate instanceof Date ? r.dueDate.toISOString().split('T')[0] : r.dueDate,
        paidDate: r.paidDate instanceof Date ? r.paidDate.toISOString().split('T')[0] : r.paidDate,
    }));
}
