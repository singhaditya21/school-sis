'use server';

import { db } from '@/lib/db';
import { studentDocuments, students } from '@/lib/db/schema';
import { eq, and, count, sql, desc } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';

export async function getStudentDocuments(studentId?: string) {
    const { tenantId } = await requireAuth('documents:read');
    const conditions = [eq(studentDocuments.tenantId, tenantId)];
    if (studentId) conditions.push(eq(studentDocuments.studentId, studentId));
    return db.select({
        id: studentDocuments.id, studentId: studentDocuments.studentId,
        studentName: sql<string>`${students.firstName} || ' ' || ${students.lastName}`,
        documentType: studentDocuments.documentType, fileName: studentDocuments.fileName,
        fileSize: studentDocuments.fileSize, isVerified: studentDocuments.isVerified,
        createdAt: studentDocuments.createdAt,
    }).from(studentDocuments)
        .leftJoin(students, eq(studentDocuments.studentId, students.id))
        .where(and(...conditions)).orderBy(desc(studentDocuments.createdAt));
}

export async function verifyDocument(documentId: string) {
    const { tenantId, userId } = await requireAuth('documents:write');
    await db.update(studentDocuments).set({ isVerified: true, verifiedBy: userId, verifiedAt: new Date() })
        .where(and(eq(studentDocuments.id, documentId), eq(studentDocuments.tenantId, tenantId)));
    return { success: true };
}

export async function getDocumentStats() {
    const { tenantId } = await requireAuth('documents:read');
    const [total] = await db.select({ c: count() }).from(studentDocuments).where(eq(studentDocuments.tenantId, tenantId));
    const [verified] = await db.select({ c: count() }).from(studentDocuments)
        .where(and(eq(studentDocuments.tenantId, tenantId), eq(studentDocuments.isVerified, true)));
    return {
        total: total?.c || 0, verified: verified?.c || 0,
        pending: (total?.c || 0) - (verified?.c || 0),
    };
}
