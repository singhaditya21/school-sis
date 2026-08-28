'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

export async function logIncident(data: {
    studentId: string;
    type: string;
    description: string;
    actionTaken?: string;
    parentNotified?: boolean;
}) {
    const { tenantId, userId } = await requireAuth('health:write');

    const { rows: [incident] } = await pool.query(
        `INSERT INTO health_incidents (
            tenant_id, student_id, type, description, action_taken, reported_by, parent_notified, parent_notified_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
        RETURNING id, tenant_id AS "tenantId", student_id AS "studentId", type, description, action_taken AS "actionTaken", reported_by AS "reportedBy", parent_notified AS "parentNotified", parent_notified_at AS "parentNotifiedAt", incident_date AS "incidentDate"`,
        [tenantId, data.studentId, data.type, data.description, data.actionTaken, userId, data.parentNotified || false, data.parentNotified ? new Date() : null]
    );

    return { success: true, incident };
}

// ─── Get Incidents ───────────────────────────────────────────

export async function getIncidents(studentId?: string) {
    const { tenantId } = await requireAuth('health:read');

    let query = `SELECT h.id, h.student_id AS "studentId", s.first_name || ' ' || s.last_name AS "studentName", h.incident_date AS "incidentDate", h.type, h.description, h.action_taken AS "actionTaken", h.parent_notified AS "parentNotified"
                 FROM health_incidents h
                 LEFT JOIN students s ON h.student_id = s.id
                 WHERE h.tenant_id = $1`;
    const params: string[] = [tenantId];
    if (studentId) {
        query += ` AND h.student_id = $2`;
        params.push(studentId);
    }
    query += ` ORDER BY h.incident_date DESC`;

    const { rows } = await pool.query(query, params);
    return rows;
}

// ─── Get Immunizations ──────────────────────────────────────

export async function getImmunizations(studentId: string) {
    const { tenantId } = await requireAuth('health:read');

    const { rows } = await pool.query(
        `SELECT id, tenant_id AS "tenantId", student_id AS "studentId", vaccine_name AS "vaccineName", dose_number AS "doseNumber", date_given AS "dateGiven", next_due_date AS "nextDueDate", administered_by AS "administeredBy", batch_number AS "batchNumber", created_at AS "createdAt"
         FROM immunizations
         WHERE student_id = $1 AND tenant_id = $2
         ORDER BY date_given DESC`,
        [studentId, tenantId]
    );

    return rows;
}

// ─── Add Immunization ────────────────────────────────────────

export async function addImmunization(data: {
    studentId: string;
    vaccineName: string;
    doseNumber: number;
    dateGiven: string;
    nextDueDate?: string;
    administeredBy?: string;
    batchNumber?: string;
}) {
    const { tenantId } = await requireAuth('health:write');

    const { rows: [record] } = await pool.query(
        `INSERT INTO immunizations (tenant_id, student_id, vaccine_name, dose_number, date_given, next_due_date, administered_by, batch_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, tenant_id AS "tenantId", student_id AS "studentId", vaccine_name AS "vaccineName", dose_number AS "doseNumber", date_given AS "dateGiven", next_due_date AS "nextDueDate", administered_by AS "administeredBy", batch_number AS "batchNumber", created_at AS "createdAt"`,
        [tenantId, data.studentId, data.vaccineName, data.doseNumber, data.dateGiven, data.nextDueDate, data.administeredBy, data.batchNumber]
    );

    return { success: true, record };
}

// ─── Get Health Stats ────────────────────────────────────────

export async function getHealthStats() {
    const { tenantId } = await requireAuth('health:read');

    const { rows: [{ c: studentsWithRecords }] } = await pool.query(`SELECT COUNT(*) AS c FROM health_records WHERE tenant_id = $1`, [tenantId]);
    const { rows: [{ c: totalIncidents }] } = await pool.query(`SELECT COUNT(*) AS c FROM health_incidents WHERE tenant_id = $1`, [tenantId]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { rows: [{ c: todayIncidents }] } = await pool.query(`SELECT COUNT(*) AS c FROM health_incidents WHERE tenant_id = $1 AND incident_date >= $2`, [tenantId, today]);

    const { rows: [{ c: totalImmunizations }] } = await pool.query(`SELECT COUNT(*) AS c FROM immunizations WHERE tenant_id = $1`, [tenantId]);

    return {
        studentsWithRecords: Number(studentsWithRecords) || 0,
        totalIncidents: Number(totalIncidents) || 0,
        todayIncidents: Number(todayIncidents) || 0,
        totalImmunizations: Number(totalImmunizations) || 0,
    };
}
