'use server';

import { pool } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';

// Visa Compliance Actions
export async function getStudentVisasAction() {
    const session = await getSession();
    if (!session.tenantId) throw new Error('Unauthorized');
    
    const { rows } = await pool.query(`
        SELECT sv.id, sv.visa_type AS "visaType", sv.country_of_origin AS "countryOfOrigin",
               sv.passport_number AS "passportNumber", sv.issue_date AS "issueDate",
               sv.expiration_date AS "expirationDate",
               s.first_name || ' ' || s.last_name AS "studentName"
        FROM student_visas sv
        JOIN students s ON sv.student_id = s.id
        WHERE sv.tenant_id = $1
        ORDER BY sv.expiration_date ASC
    `, [session.tenantId]);
    return rows;
}

export async function createStudentVisaAction(data: {
    studentId: string; visaType: string; countryOfOrigin: string; passportNumber: string; issueDate: string; expirationDate: string;
}) {
    const session = await getSession();
    if (!session.tenantId) throw new Error('Unauthorized');

    await pool.query(`
        INSERT INTO student_visas (tenant_id, student_id, visa_type, country_of_origin, passport_number, issue_date, expiration_date)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [session.tenantId, data.studentId, data.visaType, data.countryOfOrigin, data.passportNumber, data.issueDate, data.expirationDate]);

    revalidatePath('/international');
    return { success: true };
}

// Host Family Actions
export async function getHostFamiliesAction() {
    const session = await getSession();
    if (!session.tenantId) throw new Error('Unauthorized');

    const { rows } = await pool.query(`
        SELECT id, family_name AS "familyName", address, phone, background_checked AS "backgroundChecked"
        FROM host_families
        WHERE tenant_id = $1
        ORDER BY family_name ASC
    `, [session.tenantId]);
    return rows;
}

export async function createHostFamilyAction(data: { familyName: string; address: string; phone: string; backgroundChecked?: string }) {
    const session = await getSession();
    if (!session.tenantId) throw new Error('Unauthorized');

    await pool.query(`
        INSERT INTO host_families (tenant_id, family_name, address, phone, background_checked)
        VALUES ($1, $2, $3, $4, $5)
    `, [session.tenantId, data.familyName, data.address, data.phone, data.backgroundChecked ? new Date(data.backgroundChecked) : null]);

    revalidatePath('/international');
    return { success: true };
}

// Placement Actions
export async function getInternationalPlacementsAction() {
    const session = await getSession();
    if (!session.tenantId) throw new Error('Unauthorized');

    const { rows } = await pool.query(`
        SELECT ip.id, ip.placement_year AS "placementYear",
               s.first_name || ' ' || s.last_name AS "studentName",
               hf.family_name AS "hostFamilyName"
        FROM international_placements ip
        JOIN students s ON ip.student_id = s.id
        LEFT JOIN host_families hf ON ip.host_family_id = hf.id
        WHERE ip.tenant_id = $1
        ORDER BY ip.placement_year DESC
    `, [session.tenantId]);
    return rows;
}

export async function createInternationalPlacementAction(data: { studentId: string; hostFamilyId?: string; placementYear: string }) {
    const session = await getSession();
    if (!session.tenantId) throw new Error('Unauthorized');

    await pool.query(`
        INSERT INTO international_placements (tenant_id, student_id, host_family_id, placement_year)
        VALUES ($1, $2, $3, $4)
    `, [session.tenantId, data.studentId, data.hostFamilyId || null, data.placementYear]);

    revalidatePath('/international');
    return { success: true };
}
