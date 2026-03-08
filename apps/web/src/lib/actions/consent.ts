'use server';

import { db } from '@/lib/db';
import { consentForms, consentResponses, students } from '@/lib/db/schema';
import { eq, and, count, sql, desc } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';

export async function getConsentForms() {
    const { tenantId } = await requireAuth('consent:read');
    return db.select().from(consentForms).where(eq(consentForms.tenantId, tenantId)).orderBy(desc(consentForms.createdAt));
}

export async function createConsentForm(data: {
    title: string; description?: string; formType: string; audience?: string; dueDate?: string;
}) {
    const { tenantId, userId } = await requireAuth('consent:write');
    const [form] = await db.insert(consentForms).values({
        tenantId, title: data.title, description: data.description,
        formType: data.formType, audience: data.audience || 'ALL',
        dueDate: data.dueDate, createdBy: userId,
    }).returning();
    return { success: true, form };
}

export async function getConsentResponses(formId: string) {
    const { tenantId } = await requireAuth('consent:read');
    return db.select({
        id: consentResponses.id, studentId: consentResponses.studentId,
        studentName: sql<string>`${students.firstName} || ' ' || ${students.lastName}`,
        respondentName: consentResponses.respondentName,
        response: consentResponses.response, respondedAt: consentResponses.respondedAt,
    }).from(consentResponses)
        .leftJoin(students, eq(consentResponses.studentId, students.id))
        .where(and(eq(consentResponses.formId, formId), eq(consentResponses.tenantId, tenantId)));
}

export async function getConsentStats() {
    const { tenantId } = await requireAuth('consent:read');
    const [formCount] = await db.select({ c: count() }).from(consentForms).where(eq(consentForms.tenantId, tenantId));
    const [responseCount] = await db.select({ c: count() }).from(consentResponses).where(eq(consentResponses.tenantId, tenantId));
    const [accepted] = await db.select({ c: count() }).from(consentResponses)
        .where(and(eq(consentResponses.tenantId, tenantId), eq(consentResponses.response, 'ACCEPTED')));
    return {
        totalForms: formCount?.c || 0, totalResponses: responseCount?.c || 0,
        accepted: accepted?.c || 0, declined: (responseCount?.c || 0) - (accepted?.c || 0),
    };
}
