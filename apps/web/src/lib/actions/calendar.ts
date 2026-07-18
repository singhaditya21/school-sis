'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

// ─── Get Events ──────────────────────────────────────────────

export async function getEvents(filters?: { eventType?: string; month?: number; year?: number }) {
    const { tenantId } = await requireAuth('calendar:read');

    let query = `
        SELECT 
            id, tenant_id AS "tenantId", title, description, event_type AS "eventType", 
            start_date AS "startDate", end_date AS "endDate", is_all_day AS "isAllDay", 
            start_time AS "startTime", end_time AS "endTime", venue, audience_type AS "audienceType", 
            created_by AS "createdBy", color, updated_at AS "updatedAt", created_at AS "createdAt"
        FROM academic_events 
        WHERE tenant_id = $1
    `;
    const params: string[] = [tenantId];

    if (filters?.eventType) {
        params.push(filters.eventType);
        query += ` AND event_type = $${params.length}`;
    }

    if (filters?.month && filters?.year) {
        const startOfMonth = `${filters.year}-${String(filters.month).padStart(2, '0')}-01`;
        const endOfMonth = filters.month === 12
            ? `${filters.year + 1}-01-01`
            : `${filters.year}-${String(filters.month + 1).padStart(2, '0')}-01`;
        
        params.push(startOfMonth);
        query += ` AND start_date >= $${params.length}`;
        params.push(endOfMonth);
        query += ` AND start_date < $${params.length}`;
    }

    query += ` ORDER BY start_date ASC`;

    const { rows } = await pool.query(query, params);
    return rows;
}

// ─── Create Event ────────────────────────────────────────────

export async function createEvent(data: {
    title: string;
    description?: string;
    eventType: string;
    startDate: string;
    endDate?: string;
    isAllDay?: boolean;
    startTime?: string;
    endTime?: string;
    venue?: string;
    audienceType?: string;
    color?: string;
}) {
    const { tenantId, userId } = await requireAuth('calendar:write');

    const query = `
        INSERT INTO academic_events (
            tenant_id, title, description, event_type, start_date, end_date, 
            is_all_day, start_time, end_time, venue, audience_type, created_by, color
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
        ) RETURNING 
            id, tenant_id AS "tenantId", title, description, event_type AS "eventType", 
            start_date AS "startDate", end_date AS "endDate", is_all_day AS "isAllDay", 
            start_time AS "startTime", end_time AS "endTime", venue, audience_type AS "audienceType", 
            created_by AS "createdBy", color, updated_at AS "updatedAt", created_at AS "createdAt"
    `;
    const params = [
        tenantId,
        data.title,
        data.description || null,
        data.eventType,
        data.startDate,
        data.endDate || null,
        data.isAllDay ?? true,
        data.startTime || null,
        data.endTime || null,
        data.venue || null,
        data.audienceType || 'ALL',
        userId,
        data.color || null
    ];

    const { rows } = await pool.query(query, params);
    return { success: true, event: rows[0] };
}

// ─── Update Event ────────────────────────────────────────────

export async function updateEvent(eventId: string, data: Partial<{
    title: string;
    description: string;
    eventType: string;
    startDate: string;
    endDate: string;
    isAllDay: boolean;
    startTime: string;
    endTime: string;
    venue: string;
    audienceType: string;
    color: string;
}>) {
    const { tenantId } = await requireAuth('calendar:write');

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) {
            const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
            setClauses.push(`${snakeKey} = $${paramIndex}`);
            params.push(value);
            paramIndex++;
        }
    }

    if (setClauses.length === 0) {
        return { success: true };
    }

    setClauses.push(`updated_at = $${paramIndex}`);
    params.push(new Date());
    paramIndex++;

    const query = `
        UPDATE academic_events
        SET ${setClauses.join(', ')}
        WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
    `;
    params.push(eventId, tenantId);

    await pool.query(query, params);

    return { success: true };
}

// ─── Delete Event ────────────────────────────────────────────

export async function deleteEvent(eventId: string) {
    const { tenantId } = await requireAuth('calendar:write');

    const query = `
        DELETE FROM academic_events
        WHERE id = $1 AND tenant_id = $2
    `;
    await pool.query(query, [eventId, tenantId]);

    return { success: true };
}

// ─── Get Academic Years ──────────────────────────────────────

export async function getAcademicYears() {
    const { tenantId } = await requireAuth('calendar:read');

    const query = `
        SELECT 
            id, tenant_id AS "tenantId", name, start_date AS "startDate", 
            end_date AS "endDate", status, created_at AS "createdAt", updated_at AS "updatedAt"
        FROM academic_years
        WHERE tenant_id = $1
        ORDER BY start_date DESC
    `;
    const { rows } = await pool.query(query, [tenantId]);
    return rows;
}

// ─── Get Upcoming Events ─────────────────────────────────────

export async function getUpcomingEvents(limit: number = 10) {
    const { tenantId } = await requireAuth('calendar:read');

    const today = new Date().toISOString().split('T')[0];

    const query = `
        SELECT 
            id, tenant_id AS "tenantId", title, description, event_type AS "eventType", 
            start_date AS "startDate", end_date AS "endDate", is_all_day AS "isAllDay", 
            start_time AS "startTime", end_time AS "endTime", venue, audience_type AS "audienceType", 
            created_by AS "createdBy", color, updated_at AS "updatedAt", created_at AS "createdAt"
        FROM academic_events
        WHERE tenant_id = $1 AND start_date >= $2
        ORDER BY start_date ASC
        LIMIT $3
    `;
    const { rows } = await pool.query(query, [tenantId, today, limit]);
    return rows;
}
