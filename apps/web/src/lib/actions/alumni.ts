'use server';

import { db } from '@/lib/db';
import { alumniProfiles, alumniEvents, alumniRegistrations } from '@/lib/db/schema';
import { eq, and, count, sql, asc, desc } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';

export async function getAlumni(filters?: { batch?: string; verified?: boolean }) {
    const { tenantId } = await requireAuth('alumni:read');
    const conditions = [eq(alumniProfiles.tenantId, tenantId)];
    if (filters?.batch) conditions.push(eq(alumniProfiles.batch, filters.batch));
    if (filters?.verified !== undefined) conditions.push(eq(alumniProfiles.isVerified, filters.verified));
    return db.select().from(alumniProfiles).where(and(...conditions)).orderBy(desc(alumniProfiles.createdAt));
}

export async function registerAlumni(data: {
    name: string; email: string; phone?: string; batch: string;
    currentCompany?: string; designation?: string; location?: string; linkedIn?: string;
}) {
    const { tenantId } = await requireAuth('alumni:write');
    const [a] = await db.insert(alumniProfiles).values({ tenantId, ...data }).returning();
    return { success: true, alumni: a };
}

export async function verifyAlumni(alumniId: string) {
    const { tenantId } = await requireAuth('alumni:write');
    await db.update(alumniProfiles).set({ isVerified: true })
        .where(and(eq(alumniProfiles.id, alumniId), eq(alumniProfiles.tenantId, tenantId)));
    return { success: true };
}

export async function getAlumniEvents(status?: string) {
    const { tenantId } = await requireAuth('alumni:read');
    const conditions = [eq(alumniEvents.tenantId, tenantId)];
    if (status) conditions.push(eq(alumniEvents.status, status as any));
    return db.select().from(alumniEvents).where(and(...conditions)).orderBy(asc(alumniEvents.date));
}

export async function createAlumniEvent(data: {
    title: string; description?: string; date: string; time?: string;
    venue?: string; type: string; maxCapacity?: number;
}) {
    const { tenantId, userId } = await requireAuth('alumni:write');
    const [e] = await db.insert(alumniEvents).values({
        tenantId, title: data.title, description: data.description,
        date: data.date, time: data.time, venue: data.venue,
        type: data.type as any, organizerId: userId, maxCapacity: data.maxCapacity,
    }).returning();
    return { success: true, event: e };
}

export async function getAlumniStats() {
    const { tenantId } = await requireAuth('alumni:read');
    const all = await db.select().from(alumniProfiles).where(eq(alumniProfiles.tenantId, tenantId));
    const events = await db.select().from(alumniEvents).where(eq(alumniEvents.tenantId, tenantId));
    return {
        total: all.length, verified: all.filter(a => a.isVerified).length,
        pending: all.filter(a => !a.isVerified).length,
        batches: new Set(all.map(a => a.batch)).size,
        upcomingEvents: events.filter(e => e.status === 'UPCOMING').length,
    };
}
