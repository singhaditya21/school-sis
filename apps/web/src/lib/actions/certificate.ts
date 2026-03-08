'use server';

import { db } from '@/lib/db';
import { certificateTemplates, issuedCertificates, idCards, students } from '@/lib/db/schema';
import { eq, and, count, sql, asc, desc } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';

// ─── Get Templates ───────────────────────────────────────────

export async function getCertificateTemplates(type?: string) {
    const { tenantId } = await requireAuth('certificate:read');

    const conditions = [eq(certificateTemplates.tenantId, tenantId)];
    if (type) conditions.push(eq(certificateTemplates.type, type as any));

    return db.select().from(certificateTemplates).where(and(...conditions)).orderBy(asc(certificateTemplates.name));
}

// ─── Create Template ─────────────────────────────────────────

export async function createCertificateTemplate(data: {
    name: string;
    type: string;
    htmlTemplate?: string;
    variables?: string[];
}) {
    const { tenantId } = await requireAuth('certificate:write');

    const [tpl] = await db.insert(certificateTemplates).values({
        tenantId,
        name: data.name,
        type: data.type as any,
        htmlTemplate: data.htmlTemplate,
        variables: data.variables || [],
    }).returning();

    return { success: true, template: tpl };
}

// ─── Issue Certificate ──────────────────────────────────────

export async function issueCertificate(data: {
    templateId: string;
    studentId: string;
    certificateNumber: string;
    issuedDate: string;
    data?: Record<string, string>;
}) {
    const { tenantId, userId } = await requireAuth('certificate:write');

    const [cert] = await db.insert(issuedCertificates).values({
        tenantId,
        templateId: data.templateId,
        studentId: data.studentId,
        certificateNumber: data.certificateNumber,
        issuedDate: data.issuedDate,
        issuedBy: userId,
        data: data.data || {},
        status: 'ISSUED',
    }).returning();

    return { success: true, certificate: cert };
}

// ─── Get Issued Certificates ────────────────────────────────

export async function getIssuedCertificates(studentId?: string) {
    const { tenantId } = await requireAuth('certificate:read');

    const conditions = [eq(issuedCertificates.tenantId, tenantId)];
    if (studentId) conditions.push(eq(issuedCertificates.studentId, studentId));

    return db
        .select({
            id: issuedCertificates.id,
            certificateNumber: issuedCertificates.certificateNumber,
            studentId: issuedCertificates.studentId,
            studentName: sql<string>`${students.firstName} || ' ' || ${students.lastName}`,
            templateName: certificateTemplates.name,
            type: certificateTemplates.type,
            issuedDate: issuedCertificates.issuedDate,
            status: issuedCertificates.status,
        })
        .from(issuedCertificates)
        .leftJoin(students, eq(issuedCertificates.studentId, students.id))
        .leftJoin(certificateTemplates, eq(issuedCertificates.templateId, certificateTemplates.id))
        .where(and(...conditions))
        .orderBy(desc(issuedCertificates.createdAt));
}

// ─── Get Certificate Stats ──────────────────────────────────

export async function getCertificateStats() {
    const { tenantId } = await requireAuth('certificate:read');

    const [templateCount] = await db.select({ c: count() }).from(certificateTemplates)
        .where(eq(certificateTemplates.tenantId, tenantId));

    const [issuedCount] = await db.select({ c: count() }).from(issuedCertificates)
        .where(eq(issuedCertificates.tenantId, tenantId));

    const [cardCount] = await db.select({ c: count() }).from(idCards)
        .where(eq(idCards.tenantId, tenantId));

    const [pendingCards] = await db.select({ c: count() }).from(idCards)
        .where(and(eq(idCards.tenantId, tenantId), eq(idCards.status, 'PENDING')));

    return {
        templates: templateCount?.c || 0,
        issued: issuedCount?.c || 0,
        idCards: cardCount?.c || 0,
        pendingCards: pendingCards?.c || 0,
    };
}

// ─── Get ID Cards ───────────────────────────────────────────

export async function getIDCards(personType?: string) {
    const { tenantId } = await requireAuth('certificate:read');

    const conditions = [eq(idCards.tenantId, tenantId)];
    if (personType) conditions.push(eq(idCards.personType, personType));

    return db.select().from(idCards).where(and(...conditions)).orderBy(desc(idCards.createdAt));
}
