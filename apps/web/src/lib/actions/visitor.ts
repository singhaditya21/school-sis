'use server';

import { db } from '@/lib/db';
import { visitors } from '@/lib/db/schema';
import { eq, and, count, sql, asc, desc } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';

// ─── Get Visitors ────────────────────────────────────────────

export async function getVisitors(filters?: { status?: string; purpose?: string }) {
    const { tenantId } = await requireAuth('visitor:read');

    const conditions = [eq(visitors.tenantId, tenantId)];
    if (filters?.status) conditions.push(eq(visitors.status, filters.status as any));
    if (filters?.purpose) conditions.push(eq(visitors.purpose, filters.purpose as any));

    return db.select().from(visitors).where(and(...conditions)).orderBy(desc(visitors.checkInTime));
}

// ─── Check In Visitor ────────────────────────────────────────

export async function checkInVisitor(data: {
    name: string;
    phone: string;
    email?: string;
    company?: string;
    purpose: string;
    purposeDetails?: string;
    hostName: string;
    hostDepartment: string;
    idProof: string;
    idNumber: string;
    vehicleNumber?: string;
}) {
    const { tenantId } = await requireAuth('visitor:write');

    // Generate pass number
    const passNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const visitorPass = `VP-${passNum}`;

    const [visitor] = await db.insert(visitors).values({
        tenantId,
        name: data.name,
        phone: data.phone,
        email: data.email,
        company: data.company,
        purpose: data.purpose as any,
        purposeDetails: data.purposeDetails,
        hostName: data.hostName,
        hostDepartment: data.hostDepartment,
        idProof: data.idProof,
        idNumber: data.idNumber,
        vehicleNumber: data.vehicleNumber,
        status: 'CHECKED_IN',
        visitorPass,
    }).returning();

    return { success: true, visitor };
}

// ─── Check Out Visitor ───────────────────────────────────────

export async function checkOutVisitor(visitorId: string) {
    const { tenantId } = await requireAuth('visitor:write');

    await db.update(visitors)
        .set({ status: 'CHECKED_OUT', checkOutTime: new Date() })
        .where(and(eq(visitors.id, visitorId), eq(visitors.tenantId, tenantId)));

    return { success: true };
}

// ─── Pre-approve Visitor ─────────────────────────────────────

export async function preApproveVisitor(data: {
    name: string;
    phone: string;
    email?: string;
    company?: string;
    purpose: string;
    purposeDetails?: string;
    hostName: string;
    hostDepartment: string;
    idProof: string;
    idNumber: string;
    expectedDate: string;
}) {
    const { tenantId, userId } = await requireAuth('visitor:write');

    const [visitor] = await db.insert(visitors).values({
        tenantId,
        name: data.name,
        phone: data.phone,
        email: data.email,
        company: data.company,
        purpose: data.purpose as any,
        purposeDetails: data.purposeDetails,
        hostName: data.hostName,
        hostDepartment: data.hostDepartment,
        idProof: data.idProof,
        idNumber: data.idNumber,
        status: 'PRE_APPROVED',
        preApprovedBy: userId,
        preApprovedDate: new Date(),
    }).returning();

    return { success: true, visitor };
}

// ─── Get Visitor Stats ───────────────────────────────────────

export async function getVisitorStats() {
    const { tenantId } = await requireAuth('visitor:read');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const allToday = await db.select().from(visitors)
        .where(and(eq(visitors.tenantId, tenantId), sql`${visitors.checkInTime} >= ${today}`));

    return {
        todayTotal: allToday.length,
        currentlyIn: allToday.filter(v => v.status === 'CHECKED_IN').length,
        checkedOut: allToday.filter(v => v.status === 'CHECKED_OUT').length,
        preApproved: allToday.filter(v => v.status === 'PRE_APPROVED').length,
    };
}
