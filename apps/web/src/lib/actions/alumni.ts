'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

export async function getAlumni(filters?: { batch?: string; verified?: boolean }) {
    const { tenantId } = await requireAuth('alumni:read');
    let query = 'SELECT id, tenant_id AS "tenantId", name, email, phone, batch, current_company AS "currentCompany", designation, location, linked_in AS "linkedIn", is_verified AS "isVerified", created_at AS "createdAt", updated_at AS "updatedAt" FROM alumni_profiles WHERE tenant_id = $1';
    const params: any[] = [tenantId];
    if (filters?.batch) {
        params.push(filters.batch);
        query += ` AND batch = $${params.length}`;
    }
    if (filters?.verified !== undefined) {
        params.push(filters.verified);
        query += ` AND is_verified = $${params.length}`;
    }
    query += ' ORDER BY created_at DESC';
    const { rows } = await pool.query(query, params);
    return rows;
}

export async function registerAlumni(data: {
    name: string; email: string; phone?: string; batch: string;
    currentCompany?: string; designation?: string; location?: string; linkedIn?: string;
}) {
    const { tenantId } = await requireAuth('alumni:write');
    const { rows } = await pool.query(
        `INSERT INTO alumni_profiles (tenant_id, name, email, phone, batch, current_company, designation, location, linked_in) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, tenant_id AS "tenantId", name, email, phone, batch, current_company AS "currentCompany", designation, location, linked_in AS "linkedIn", is_verified AS "isVerified", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [tenantId, data.name, data.email, data.phone || null, data.batch, data.currentCompany || null, data.designation || null, data.location || null, data.linkedIn || null]
    );
    return { success: true, alumni: rows[0] };
}

export async function verifyAlumni(alumniId: string) {
    const { tenantId } = await requireAuth('alumni:write');
    await pool.query(
        `UPDATE alumni_profiles SET is_verified = true WHERE id = $1 AND tenant_id = $2`,
        [alumniId, tenantId]
    );
    return { success: true };
}

export async function getAlumniEvents(status?: string) {
    const { tenantId } = await requireAuth('alumni:read');
    let query = 'SELECT id, tenant_id AS "tenantId", title, description, date, time, venue, type, organizer_id AS "organizerId", max_capacity AS "maxCapacity", status, created_at AS "createdAt", updated_at AS "updatedAt" FROM alumni_events WHERE tenant_id = $1';
    const params: any[] = [tenantId];
    if (status) {
        params.push(status);
        query += ` AND status = $${params.length}`;
    }
    query += ' ORDER BY date ASC';
    const { rows } = await pool.query(query, params);
    return rows;
}

export async function createAlumniEvent(data: {
    title: string; description?: string; date: string; time?: string;
    venue?: string; type: string; maxCapacity?: number;
}) {
    const { tenantId, userId } = await requireAuth('alumni:write');
    const { rows } = await pool.query(
        `INSERT INTO alumni_events (tenant_id, title, description, date, time, venue, type, organizer_id, max_capacity) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, tenant_id AS "tenantId", title, description, date, time, venue, type, organizer_id AS "organizerId", max_capacity AS "maxCapacity", status, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [tenantId, data.title, data.description || null, data.date, data.time || null, data.venue || null, data.type, userId, data.maxCapacity || null]
    );
    return { success: true, event: rows[0] };
}

export async function getAlumniStats() {
    const { tenantId } = await requireAuth('alumni:read');
    const { rows: all } = await pool.query(`SELECT is_verified AS "isVerified", batch FROM alumni_profiles WHERE tenant_id = $1`, [tenantId]);
    const { rows: events } = await pool.query(`SELECT status FROM alumni_events WHERE tenant_id = $1`, [tenantId]);
    
    return {
        total: all.length,
        verified: all.filter((a: any) => a.isVerified).length,
        pending: all.filter((a: any) => !a.isVerified).length,
        batches: new Set(all.map((a: any) => a.batch)).size,
        upcomingEvents: events.filter((e: any) => e.status === 'UPCOMING').length,
    };
}
