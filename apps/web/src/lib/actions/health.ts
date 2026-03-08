'use server';

import { db } from '@/lib/db';
import { healthRecords, healthIncidents, immunizations, students } from '@/lib/db/schema';
import { eq, and, count, sql, asc, desc } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';

// ─── Get Health Record ───────────────────────────────────────

export async function getHealthRecord(studentId: string) {
    const { tenantId } = await requireAuth('health:read');

    const [record] = await db.select().from(healthRecords)
        .where(and(eq(healthRecords.studentId, studentId), eq(healthRecords.tenantId, tenantId)));

    return record || null;
}

// ─── Update Health Record ────────────────────────────────────

export async function updateHealthRecord(studentId: string, data: {
    bloodGroup?: string;
    height?: string;
    weight?: string;
    allergies?: string[];
    conditions?: string[];
    medications?: string[];
    emergencyContact?: string;
    emergencyPhone?: string;
    doctorName?: string;
    doctorPhone?: string;
    insuranceId?: string;
    insuranceProvider?: string;
    notes?: string;
}) {
    const { tenantId } = await requireAuth('health:write');

    const existing = await getHealthRecord(studentId);

    if (existing) {
        await db.update(healthRecords).set({ ...data, updatedAt: new Date() })
            .where(and(eq(healthRecords.studentId, studentId), eq(healthRecords.tenantId, tenantId)));
    } else {
        await db.insert(healthRecords).values({ tenantId, studentId, ...data });
    }

    return { success: true };
}

// ─── Log Incident ────────────────────────────────────────────

export async function logIncident(data: {
    studentId: string;
    type: string;
    description: string;
    actionTaken?: string;
    parentNotified?: boolean;
}) {
    const { tenantId, userId } = await requireAuth('health:write');

    const [incident] = await db.insert(healthIncidents).values({
        tenantId,
        studentId: data.studentId,
        type: data.type as any,
        description: data.description,
        actionTaken: data.actionTaken,
        reportedBy: userId,
        parentNotified: data.parentNotified || false,
        parentNotifiedAt: data.parentNotified ? new Date() : null,
    }).returning();

    return { success: true, incident };
}

// ─── Get Incidents ───────────────────────────────────────────

export async function getIncidents(studentId?: string) {
    const { tenantId } = await requireAuth('health:read');

    const conditions = [eq(healthIncidents.tenantId, tenantId)];
    if (studentId) conditions.push(eq(healthIncidents.studentId, studentId));

    return db
        .select({
            id: healthIncidents.id,
            studentId: healthIncidents.studentId,
            studentName: sql<string>`${students.firstName} || ' ' || ${students.lastName}`,
            incidentDate: healthIncidents.incidentDate,
            type: healthIncidents.type,
            description: healthIncidents.description,
            actionTaken: healthIncidents.actionTaken,
            parentNotified: healthIncidents.parentNotified,
        })
        .from(healthIncidents)
        .leftJoin(students, eq(healthIncidents.studentId, students.id))
        .where(and(...conditions))
        .orderBy(desc(healthIncidents.incidentDate));
}

// ─── Get Immunizations ──────────────────────────────────────

export async function getImmunizations(studentId: string) {
    const { tenantId } = await requireAuth('health:read');

    return db.select().from(immunizations)
        .where(and(eq(immunizations.studentId, studentId), eq(immunizations.tenantId, tenantId)))
        .orderBy(desc(immunizations.dateGiven));
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

    const [record] = await db.insert(immunizations).values({
        tenantId,
        studentId: data.studentId,
        vaccineName: data.vaccineName,
        doseNumber: data.doseNumber,
        dateGiven: data.dateGiven,
        nextDueDate: data.nextDueDate,
        administeredBy: data.administeredBy,
        batchNumber: data.batchNumber,
    }).returning();

    return { success: true, record };
}

// ─── Get Health Stats ────────────────────────────────────────

export async function getHealthStats() {
    const { tenantId } = await requireAuth('health:read');

    const [recordCount] = await db.select({ c: count() }).from(healthRecords)
        .where(eq(healthRecords.tenantId, tenantId));

    const [incidentCount] = await db.select({ c: count() }).from(healthIncidents)
        .where(eq(healthIncidents.tenantId, tenantId));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [todayIncidents] = await db.select({ c: count() }).from(healthIncidents)
        .where(and(eq(healthIncidents.tenantId, tenantId), sql`${healthIncidents.incidentDate} >= ${today}`));

    const [immunizationCount] = await db.select({ c: count() }).from(immunizations)
        .where(eq(immunizations.tenantId, tenantId));

    return {
        studentsWithRecords: recordCount?.c || 0,
        totalIncidents: incidentCount?.c || 0,
        todayIncidents: todayIncidents?.c || 0,
        totalImmunizations: immunizationCount?.c || 0,
    };
}
