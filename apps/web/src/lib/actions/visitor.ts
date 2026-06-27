'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

// ─── Get Visitors ────────────────────────────────────────────

export async function getVisitors(filters?: { status?: string; purpose?: string }) {
    const { tenantId } = await requireAuth('visitor:read');

    let query = `
        SELECT id, tenant_id AS "tenantId", name, phone, email, company, purpose, 
               purpose_details AS "purposeDetails", host_name AS "hostName", 
               host_department AS "hostDepartment", id_proof AS "idProof", 
               id_number AS "idNumber", vehicle_number AS "vehicleNumber", 
               status, visitor_pass AS "visitorPass", check_in_time AS "checkInTime", 
               check_out_time AS "checkOutTime", pre_approved_by AS "preApprovedBy", 
               pre_approved_date AS "preApprovedDate"
        FROM visitors
        WHERE tenant_id = $1
    `;
    const params: any[] = [tenantId];

    if (filters?.status) {
        params.push(filters.status);
        query += ` AND status = $${params.length}`;
    }
    if (filters?.purpose) {
        params.push(filters.purpose);
        query += ` AND purpose = $${params.length}`;
    }

    query += ` ORDER BY check_in_time DESC`;

    const { rows } = await pool.query(query, params);
    return rows;
}

// ─── Check In Visitor ────────────────────────────────────────

export async function checkInVisitor(data: {
    name: string;
    phone: string;
    email?: string;
    company?: string;
    purpose: string;
    purposeDetails?: string;
    hostName: string;
    hostDepartment: string;
    idProof: string;
    idNumber: string;
    vehicleNumber?: string;
}) {
    const { tenantId } = await requireAuth('visitor:write');

    // Generate pass number
    const passNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const visitorPass = `VP-${passNum}`;

    const { rows } = await pool.query(`
        INSERT INTO visitors (
            tenant_id, name, phone, email, company, purpose, purpose_details, 
            host_name, host_department, id_proof, id_number, vehicle_number, 
            status, visitor_pass
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id, tenant_id AS "tenantId", name, phone, email, company, purpose, 
                  purpose_details AS "purposeDetails", host_name AS "hostName", 
                  host_department AS "hostDepartment", id_proof AS "idProof", 
                  id_number AS "idNumber", vehicle_number AS "vehicleNumber", 
                  status, visitor_pass AS "visitorPass", check_in_time AS "checkInTime", 
                  check_out_time AS "checkOutTime", pre_approved_by AS "preApprovedBy", 
                  pre_approved_date AS "preApprovedDate"
    `, [
        tenantId, data.name, data.phone, data.email, data.company, data.purpose, 
        data.purposeDetails, data.hostName, data.hostDepartment, data.idProof, 
        data.idNumber, data.vehicleNumber, 'CHECKED_IN', visitorPass
    ]);

    return { success: true, visitor: rows[0] };
}

// ─── Check Out Visitor ───────────────────────────────────────

export async function checkOutVisitor(visitorId: string) {
    const { tenantId } = await requireAuth('visitor:write');

    await pool.query(`
        UPDATE visitors
        SET status = 'CHECKED_OUT', check_out_time = NOW()
        WHERE id = $1 AND tenant_id = $2
    `, [visitorId, tenantId]);

    return { success: true };
}

// ─── Pre-approve Visitor ─────────────────────────────────────

export async function preApproveVisitor(data: {
    name: string;
    phone: string;
    email?: string;
    company?: string;
    purpose: string;
    purposeDetails?: string;
    hostName: string;
    hostDepartment: string;
    idProof: string;
    idNumber: string;
    expectedDate: string;
}) {
    const { tenantId, userId } = await requireAuth('visitor:write');

    const { rows } = await pool.query(`
        INSERT INTO visitors (
            tenant_id, name, phone, email, company, purpose, purpose_details, 
            host_name, host_department, id_proof, id_number, status, 
            pre_approved_by, pre_approved_date
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
        RETURNING id, tenant_id AS "tenantId", name, phone, email, company, purpose, 
                  purpose_details AS "purposeDetails", host_name AS "hostName", 
                  host_department AS "hostDepartment", id_proof AS "idProof", 
                  id_number AS "idNumber", vehicle_number AS "vehicleNumber", 
                  status, visitor_pass AS "visitorPass", check_in_time AS "checkInTime", 
                  check_out_time AS "checkOutTime", pre_approved_by AS "preApprovedBy", 
                  pre_approved_date AS "preApprovedDate"
    `, [
        tenantId, data.name, data.phone, data.email, data.company, data.purpose, 
        data.purposeDetails, data.hostName, data.hostDepartment, data.idProof, 
        data.idNumber, 'PRE_APPROVED', userId
    ]);

    return { success: true, visitor: rows[0] };
}

// ─── Get Visitor Stats ───────────────────────────────────────

export async function getVisitorStats() {
    const { tenantId } = await requireAuth('visitor:read');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { rows: allToday } = await pool.query(`
        SELECT status
        FROM visitors
        WHERE tenant_id = $1 AND check_in_time >= $2
    `, [tenantId, today]);

    return {
        todayTotal: allToday.length,
        currentlyIn: allToday.filter(v => v.status === 'CHECKED_IN').length,
        checkedOut: allToday.filter(v => v.status === 'CHECKED_OUT').length,
        preApproved: allToday.filter(v => v.status === 'PRE_APPROVED').length,
    };
}
