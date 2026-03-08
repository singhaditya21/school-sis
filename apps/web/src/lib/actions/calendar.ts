'use server';

import { db } from '@/lib/db';
import { academicEvents, academicYears } from '@/lib/db/schema';
import { eq, and, count, sql, asc, desc, gte } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';

// ─── Get Events ──────────────────────────────────────────────

export async function getEvents(filters?: { eventType?: string; month?: number; year?: number }) {
    const { tenantId } = await requireAuth('calendar:read');

    const conditions = [eq(academicEvents.tenantId, tenantId)];
    if (filters?.eventType) conditions.push(eq(academicEvents.eventType, filters.eventType as any));

    if (filters?.month && filters?.year) {
        const startOfMonth = `${filters.year}-${String(filters.month).padStart(2, '0')}-01`;
        const endOfMonth = filters.month === 12
            ? `${filters.year + 1}-01-01`
            : `${filters.year}-${String(filters.month + 1).padStart(2, '0')}-01`;
        conditions.push(sql`${academicEvents.startDate} >= ${startOfMonth}`);
        conditions.push(sql`${academicEvents.startDate} < ${endOfMonth}`);
    }

    return db.select().from(academicEvents).where(and(...conditions)).orderBy(asc(academicEvents.startDate));
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

    const [event] = await db.insert(academicEvents).values({
        tenantId,
        title: data.title,
        description: data.description,
        eventType: data.eventType as any,
        startDate: data.startDate,
        endDate: data.endDate,
        isAllDay: data.isAllDay ?? true,
        startTime: data.startTime,
        endTime: data.endTime,
        venue: data.venue,
        audienceType: (data.audienceType || 'ALL') as any,
        createdBy: userId,
        color: data.color,
    }).returning();

    return { success: true, event };
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

    await db.update(academicEvents)
        .set({ ...data, eventType: data.eventType as any, audienceType: data.audienceType as any, updatedAt: new Date() })
        .where(and(eq(academicEvents.id, eventId), eq(academicEvents.tenantId, tenantId)));

    return { success: true };
}

// ─── Delete Event ────────────────────────────────────────────

export async function deleteEvent(eventId: string) {
    const { tenantId } = await requireAuth('calendar:write');

    await db.delete(academicEvents)
        .where(and(eq(academicEvents.id, eventId), eq(academicEvents.tenantId, tenantId)));

    return { success: true };
}

// ─── Get Academic Years ──────────────────────────────────────

export async function getAcademicYears() {
    const { tenantId } = await requireAuth('calendar:read');

    return db.select().from(academicYears)
        .where(eq(academicYears.tenantId, tenantId))
        .orderBy(desc(academicYears.startDate));
}

// ─── Get Upcoming Events ─────────────────────────────────────

export async function getUpcomingEvents(limit: number = 10) {
    const { tenantId } = await requireAuth('calendar:read');

    const today = new Date().toISOString().split('T')[0];

    return db.select().from(academicEvents)
        .where(and(eq(academicEvents.tenantId, tenantId), gte(academicEvents.startDate, today)))
        .orderBy(asc(academicEvents.startDate))
        .limit(limit);
}
