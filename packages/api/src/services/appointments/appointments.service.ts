'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

export interface AppointmentRow {
    id: string;
    title: string;
    description: string | null;
    date: Date | string;
    time: string;
    duration: number | string | null;
    with: string | null;
    status: string;
    type: string | null;
}

export async function getAppointments(): Promise<AppointmentRow[]> {
    const auth = await requireAuth('appointments:read');
    const { tenantId, userId } = auth;
    const role = auth.session?.role;
    const isScopedParticipantRole = role === 'PARENT' || role === 'TEACHER';
    if (isScopedParticipantRole && !userId) {
        return [];
    }

    const queryText = isScopedParticipantRole
        ? `
            SELECT a.id, a.title, a.description, a.date, a.time, a.duration,
                   u.first_name||' '||u.last_name AS "with", a.status, a.type
            FROM appointments a
            LEFT JOIN users u ON u.id = a.with_user_id AND u.tenant_id = a.tenant_id
            WHERE a.tenant_id = $1 AND a.with_user_id = $2
            ORDER BY a.date DESC, a.time DESC
            LIMIT 50
        `
        : `
            SELECT a.id, a.title, a.description, a.date, a.time, a.duration,
                   u.first_name||' '||u.last_name AS "with", a.status, a.type
            FROM appointments a
            LEFT JOIN users u ON u.id = a.with_user_id AND u.tenant_id = a.tenant_id
            WHERE a.tenant_id = $1
            ORDER BY a.date DESC, a.time DESC
            LIMIT 50
        `;
    const params = isScopedParticipantRole ? [tenantId, userId] : [tenantId];
    const { rows } = await pool.query(queryText, params);
    return rows;
}
