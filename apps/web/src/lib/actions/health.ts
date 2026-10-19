'use server';

import { sql } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

// ─── Get Incidents ───────────────────────────────────────────

export async function getIncidents(studentId?: string) {
    const { tenantId } = await requireAuth('health:read');
    const studentFilter = studentId ? sql`AND h.student_id = ${studentId}` : sql``;

    return sql`
        SELECT h.id,
               h.student_id AS "studentId",
               s.first_name || ' ' || s.last_name AS "studentName",
               h.incident_date AS "incidentDate",
               h.type,
               h.description,
               h.action_taken AS "actionTaken",
               h.parent_notified AS "parentNotified"
        FROM health_incidents h
        LEFT JOIN students s ON h.student_id = s.id
        WHERE h.tenant_id = ${tenantId}
          ${studentFilter}
        ORDER BY h.incident_date DESC
    `;
}

// ─── Get Health Stats ────────────────────────────────────────

export async function getHealthStats() {
    const { tenantId } = await requireAuth('health:read');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [recordsRow, incidentsRow, todayRow, immunizationsRow] = await Promise.all([
        sql<{ c: string | number }>`SELECT COUNT(*) AS c FROM health_records WHERE tenant_id = ${tenantId}`.one(),
        sql<{ c: string | number }>`SELECT COUNT(*) AS c FROM health_incidents WHERE tenant_id = ${tenantId}`.one(),
        sql<{ c: string | number }>`SELECT COUNT(*) AS c FROM health_incidents WHERE tenant_id = ${tenantId} AND incident_date >= ${today}`.one(),
        sql<{ c: string | number }>`SELECT COUNT(*) AS c FROM immunizations WHERE tenant_id = ${tenantId}`.one(),
    ]);

    return {
        studentsWithRecords: Number(recordsRow.c) || 0,
        totalIncidents: Number(incidentsRow.c) || 0,
        todayIncidents: Number(todayRow.c) || 0,
        totalImmunizations: Number(immunizationsRow.c) || 0,
    };
}
