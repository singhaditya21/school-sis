'use server';

/**
 * Alumni workspace actions (colocated with the /alumni route).
 * Backed by alumni_profiles, alumni_events and alumni_registrations.
 */

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';

import { requireAuth } from '@/lib/auth/middleware';
import { pool } from '@/lib/db';

import { ALUMNI_EVENT_STATUSES, ALUMNI_EVENT_TYPES } from './constants';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isUuid(value: string): boolean {
    return UUID_RE.test(value);
}

export interface AlumniProfileRow {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    batch: string;
    graduationYear: number | null;
    currentCompany: string | null;
    designation: string | null;
    location: string | null;
    linkedIn: string | null;
    isVerified: boolean;
    createdAt: string;
}

export interface AlumniEventRow {
    id: string;
    title: string;
    description: string | null;
    date: string;
    time: string | null;
    venue: string | null;
    type: string;
    status: string;
    maxCapacity: number | null;
    organizerName: string | null;
    registeredCount: number;
    registrants: { alumniId: string; name: string; batch: string }[];
}

// ─── Directory ───────────────────────────────────────────────

export async function listAlumni(): Promise<AlumniProfileRow[]> {
    const { tenantId } = await requireAuth('alumni:read');

    const { rows } = await pool.query(
        `SELECT id, name, email, phone, batch,
                graduation_year AS "graduationYear",
                current_company AS "currentCompany",
                designation, location,
                linkedin AS "linkedIn",
                is_verified AS "isVerified",
                created_at AS "createdAt"
         FROM alumni_profiles
         WHERE tenant_id = $1
         ORDER BY batch DESC, name ASC`,
        [tenantId],
    );

    return (rows as (Omit<AlumniProfileRow, 'createdAt'> & { createdAt: Date })[]).map((r) => ({
        ...r,
        createdAt: new Date(r.createdAt).toISOString(),
    }));
}

export async function addAlumniProfile(input: {
    name: string;
    email: string;
    batch: string;
    phone?: string;
    graduationYear?: string;
    currentCompany?: string;
    designation?: string;
    location?: string;
    linkedIn?: string;
}): Promise<{ success: boolean; error?: string }> {
    const { tenantId } = await requireAuth('alumni:write');

    const name = input.name.trim();
    const email = input.email.trim();
    const batch = input.batch.trim();

    if (!name) return { success: false, error: 'Name is required.' };
    if (name.length > 200) return { success: false, error: 'Name is too long.' };
    if (!EMAIL_RE.test(email)) return { success: false, error: 'Enter a valid email address.' };
    if (!batch) return { success: false, error: 'Batch is required.' };
    if (batch.length > 10) return { success: false, error: 'Batch must be 10 characters or fewer.' };

    let graduationYear: number | null = null;
    if (input.graduationYear?.trim()) {
        const parsed = Number(input.graduationYear.trim());
        if (!Number.isInteger(parsed) || parsed < 1900 || parsed > 2100) {
            return { success: false, error: 'Graduation year must be a four-digit year.' };
        }
        graduationYear = parsed;
    }

    const { rows: duplicate } = await pool.query(
        `SELECT id FROM alumni_profiles WHERE tenant_id = $1 AND lower(email) = lower($2)`,
        [tenantId, email],
    );
    if (duplicate.length) {
        return { success: false, error: 'An alumnus with that email is already on the register.' };
    }

    await pool.query(
        `INSERT INTO alumni_profiles
            (id, tenant_id, name, email, phone, batch, graduation_year, current_company, designation, location, linkedin)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
            randomUUID(),
            tenantId,
            name,
            email,
            input.phone?.trim() || null,
            batch,
            graduationYear,
            input.currentCompany?.trim() || null,
            input.designation?.trim() || null,
            input.location?.trim() || null,
            input.linkedIn?.trim() || null,
        ],
    );

    revalidatePath('/alumni');
    return { success: true };
}

export async function setAlumniVerified(
    alumniId: string,
    verified: boolean,
): Promise<{ success: boolean; error?: string }> {
    const { tenantId } = await requireAuth('alumni:write');
    if (!isUuid(alumniId)) return { success: false, error: 'Invalid alumni reference.' };

    const { rows } = await pool.query(
        `UPDATE alumni_profiles SET is_verified = $1 WHERE id = $2 AND tenant_id = $3 RETURNING id`,
        [verified, alumniId, tenantId],
    );
    if (!rows.length) return { success: false, error: 'Alumni record not found.' };

    revalidatePath('/alumni');
    return { success: true };
}

// ─── Events ──────────────────────────────────────────────────

export async function listAlumniEvents(): Promise<AlumniEventRow[]> {
    const { tenantId } = await requireAuth('alumni:read');

    const { rows: eventRows } = await pool.query(
        `SELECT e.id, e.title, e.description, e.date, e.time, e.venue, e.type, e.status,
                e.max_capacity AS "maxCapacity",
                u.first_name AS "organizerFirstName",
                u.last_name AS "organizerLastName"
         FROM alumni_events e
         LEFT JOIN users u ON e.organizer_id = u.id AND u.tenant_id = e.tenant_id
         WHERE e.tenant_id = $1
         ORDER BY e.date DESC`,
        [tenantId],
    );

    if (!eventRows.length) return [];

    const { rows: registrationRows } = await pool.query(
        `SELECT r.event_id AS "eventId", r.alumni_id AS "alumniId", p.name, p.batch
         FROM alumni_registrations r
         INNER JOIN alumni_profiles p ON r.alumni_id = p.id AND p.tenant_id = r.tenant_id
         WHERE r.tenant_id = $1
         ORDER BY p.name ASC`,
        [tenantId],
    );

    const byEvent = new Map<string, { alumniId: string; name: string; batch: string }[]>();
    for (const row of registrationRows as {
        eventId: string;
        alumniId: string;
        name: string;
        batch: string;
    }[]) {
        const list = byEvent.get(row.eventId) ?? [];
        list.push({ alumniId: row.alumniId, name: row.name, batch: row.batch });
        byEvent.set(row.eventId, list);
    }

    return (eventRows as {
        id: string;
        title: string;
        description: string | null;
        date: Date | string;
        time: string | null;
        venue: string | null;
        type: string;
        status: string;
        maxCapacity: number | null;
        organizerFirstName: string | null;
        organizerLastName: string | null;
    }[]).map((e) => {
        const registrants = byEvent.get(e.id) ?? [];
        return {
            id: e.id,
            title: e.title,
            description: e.description,
            date: typeof e.date === 'string' ? e.date : new Date(e.date).toISOString().slice(0, 10),
            time: e.time,
            venue: e.venue,
            type: e.type,
            status: e.status,
            maxCapacity: e.maxCapacity,
            organizerName: e.organizerFirstName
                ? `${e.organizerFirstName} ${e.organizerLastName ?? ''}`.trim()
                : null,
            registeredCount: registrants.length,
            registrants,
        };
    });
}

export async function addAlumniEvent(input: {
    title: string;
    date: string;
    type: string;
    description?: string;
    time?: string;
    venue?: string;
    maxCapacity?: string;
}): Promise<{ success: boolean; error?: string }> {
    const { tenantId, userId } = await requireAuth('alumni:write');

    const title = input.title.trim();
    if (!title) return { success: false, error: 'Give the event a title.' };
    if (title.length > 255) return { success: false, error: 'Title is too long.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
        return { success: false, error: 'Pick a valid date.' };
    }
    if (!ALUMNI_EVENT_TYPES.some((t) => t.value === input.type)) {
        return { success: false, error: 'Pick a valid event type.' };
    }

    let maxCapacity: number | null = null;
    if (input.maxCapacity?.trim()) {
        const parsed = Number(input.maxCapacity.trim());
        if (!Number.isInteger(parsed) || parsed < 1) {
            return { success: false, error: 'Capacity must be a whole number above zero.' };
        }
        maxCapacity = parsed;
    }

    await pool.query(
        `INSERT INTO alumni_events
            (id, tenant_id, title, description, date, time, venue, type, organizer_id, max_capacity)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
            randomUUID(),
            tenantId,
            title,
            input.description?.trim() || null,
            input.date,
            input.time?.trim() || null,
            input.venue?.trim() || null,
            input.type,
            userId,
            maxCapacity,
        ],
    );

    revalidatePath('/alumni');
    return { success: true };
}

export async function setAlumniEventStatus(
    eventId: string,
    status: string,
): Promise<{ success: boolean; error?: string }> {
    const { tenantId } = await requireAuth('alumni:write');
    if (!isUuid(eventId)) return { success: false, error: 'Invalid event reference.' };
    if (!ALUMNI_EVENT_STATUSES.includes(status)) {
        return { success: false, error: 'Invalid event status.' };
    }

    const { rows } = await pool.query(
        `UPDATE alumni_events SET status = $1 WHERE id = $2 AND tenant_id = $3 RETURNING id`,
        [status, eventId, tenantId],
    );
    if (!rows.length) return { success: false, error: 'Event not found.' };

    revalidatePath('/alumni');
    return { success: true };
}

// ─── Registrations ───────────────────────────────────────────

export async function registerAlumniForEvent(
    eventId: string,
    alumniId: string,
): Promise<{ success: boolean; error?: string }> {
    const { tenantId } = await requireAuth('alumni:write');
    if (!isUuid(eventId) || !isUuid(alumniId)) {
        return { success: false, error: 'Invalid event or alumni reference.' };
    }

    const { rows: eventRows } = await pool.query(
        `SELECT e.max_capacity AS "maxCapacity",
                e.status,
                (SELECT COUNT(*) FROM alumni_registrations r
                  WHERE r.event_id = e.id AND r.tenant_id = e.tenant_id) AS "registered"
         FROM alumni_events e
         WHERE e.id = $1 AND e.tenant_id = $2`,
        [eventId, tenantId],
    );
    if (!eventRows.length) return { success: false, error: 'Event not found.' };

    const event = eventRows[0] as { maxCapacity: number | null; status: string; registered: string };
    if (event.status === 'COMPLETED') {
        return { success: false, error: 'That event has already finished.' };
    }
    if (event.maxCapacity !== null && parseInt(event.registered, 10) >= event.maxCapacity) {
        return { success: false, error: 'That event is already at capacity.' };
    }

    const { rows: alumniRows } = await pool.query(
        `SELECT id FROM alumni_profiles WHERE id = $1 AND tenant_id = $2`,
        [alumniId, tenantId],
    );
    if (!alumniRows.length) return { success: false, error: 'Alumni record not found.' };

    const { rows: existing } = await pool.query(
        `SELECT id FROM alumni_registrations WHERE event_id = $1 AND alumni_id = $2 AND tenant_id = $3`,
        [eventId, alumniId, tenantId],
    );
    if (existing.length) return { success: false, error: 'They are already registered for this event.' };

    await pool.query(
        `INSERT INTO alumni_registrations (id, tenant_id, event_id, alumni_id) VALUES ($1, $2, $3, $4)`,
        [randomUUID(), tenantId, eventId, alumniId],
    );

    revalidatePath('/alumni');
    return { success: true };
}

export async function cancelAlumniRegistration(
    eventId: string,
    alumniId: string,
): Promise<{ success: boolean; error?: string }> {
    const { tenantId } = await requireAuth('alumni:write');
    if (!isUuid(eventId) || !isUuid(alumniId)) {
        return { success: false, error: 'Invalid event or alumni reference.' };
    }

    const { rows } = await pool.query(
        `DELETE FROM alumni_registrations
         WHERE event_id = $1 AND alumni_id = $2 AND tenant_id = $3
         RETURNING id`,
        [eventId, alumniId, tenantId],
    );
    if (!rows.length) return { success: false, error: 'That registration no longer exists.' };

    revalidatePath('/alumni');
    return { success: true };
}
