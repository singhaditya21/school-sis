'use server';

import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

/**
 * Appointment server actions.
 *
 * `appointments` stores `date` and `time` as plain varchars, so both are
 * validated here before they reach the table.
 */

const APPOINTMENT_STATUSES = ['scheduled', 'completed', 'cancelled'] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export type AppointmentRow = {
    id: string;
    title: string;
    description: string | null;
    date: string;
    time: string;
    duration: number;
    with: string | null;
    status: string;
    type: string | null;
};

export type AppointmentPerson = {
    id: string;
    name: string;
    role: string;
    email: string;
};

export type AppointmentActionResult = {
    success: boolean;
    error?: string;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Everyone in the tenant an appointment can be booked with. */
export async function getAppointmentPeople(): Promise<AppointmentPerson[]> {
    const { tenantId } = await requireAuth('appointments:read');

    const { rows } = await pool.query(
        `SELECT id, first_name || ' ' || last_name AS name, role::text AS role, email
         FROM users
         WHERE tenant_id = $1 AND is_active = true
         ORDER BY first_name ASC, last_name ASC`,
        [tenantId],
    );

    return rows.map((row) => ({
        id: row.id as string,
        name: row.name as string,
        role: row.role as string,
        email: row.email as string,
    }));
}

/** Appointments for the active tenant, most recent first. */
export async function listAppointments(): Promise<AppointmentRow[]> {
    const { tenantId } = await requireAuth('appointments:read');

    const { rows } = await pool.query(
        `SELECT a.id, a.title, a.description, a.date, a.time, a.duration,
                CASE WHEN u.id IS NULL THEN NULL ELSE u.first_name || ' ' || u.last_name END AS "with",
                a.status, a.type
         FROM appointments a
         LEFT JOIN users u ON u.id = a.with_user_id AND u.tenant_id = a.tenant_id
         WHERE a.tenant_id = $1
         ORDER BY a.date DESC, a.time DESC
         LIMIT 100`,
        [tenantId],
    );

    return rows.map((row) => ({
        id: row.id as string,
        title: row.title as string,
        description: (row.description as string | null) ?? null,
        date: String(row.date ?? ''),
        time: String(row.time ?? ''),
        duration: Number(row.duration ?? 0),
        with: (row.with as string | null) ?? null,
        status: String(row.status ?? 'scheduled'),
        type: (row.type as string | null) ?? null,
    }));
}

/** Book an appointment. */
export async function createAppointment(input: {
    title: string;
    description?: string;
    date: string;
    time: string;
    duration: number;
    withUserId?: string;
    type?: string;
}): Promise<AppointmentActionResult> {
    const { tenantId } = await requireAuth('appointments:write');

    const title = input.title?.trim();
    if (!title) return { success: false, error: 'Give the appointment a title.' };
    if (title.length > 255) return { success: false, error: 'Title must be 255 characters or fewer.' };
    if (!DATE_PATTERN.test(input.date ?? '')) return { success: false, error: 'Pick a date.' };
    if (!TIME_PATTERN.test(input.time ?? '')) return { success: false, error: 'Pick a start time.' };
    if (!Number.isInteger(input.duration) || input.duration < 5 || input.duration > 480) {
        return { success: false, error: 'Duration must be between 5 and 480 minutes.' };
    }

    let withUserId: string | null = null;
    if (input.withUserId) {
        const { rows } = await pool.query(
            `SELECT id FROM users WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
            [input.withUserId, tenantId],
        );
        if (rows.length === 0) {
            return { success: false, error: 'That person is not an active user of this school.' };
        }
        withUserId = input.withUserId;
    }

    await pool.query(
        `INSERT INTO appointments (tenant_id, title, description, date, time, duration, with_user_id, status, type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled', $8)`,
        [
            tenantId,
            title,
            input.description?.trim() || null,
            input.date,
            input.time,
            input.duration,
            withUserId,
            input.type?.trim().slice(0, 50) || null,
        ],
    );

    revalidatePath('/appointments');
    return { success: true };
}

/** Move an appointment between scheduled / completed / cancelled. */
export async function setAppointmentStatus(
    appointmentId: string,
    status: string,
): Promise<AppointmentActionResult> {
    const { tenantId } = await requireAuth('appointments:write');

    if (!(APPOINTMENT_STATUSES as readonly string[]).includes(status)) {
        return { success: false, error: 'Unknown appointment status.' };
    }

    const { rowCount } = await pool.query(
        `UPDATE appointments SET status = $1 WHERE id = $2 AND tenant_id = $3`,
        [status, appointmentId, tenantId],
    );

    if (!rowCount) return { success: false, error: 'Appointment not found.' };

    revalidatePath('/appointments');
    return { success: true };
}
