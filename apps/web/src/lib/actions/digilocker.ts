'use server';

import { db } from '@/lib/db';
import { digilockerSyncLogs, students, issuedCertificates } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth/middleware';
import { eq, and, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export async function getDigilockerSyncLogs() {
    const { tenantId } = await requireAuth('certificate:read');

    const rows = await db.select({
        id: digilockerSyncLogs.id,
        documentType: digilockerSyncLogs.documentType,
        studentId: digilockerSyncLogs.studentId,
        studentName: students.firstName,
        studentLastName: students.lastName,
        apaarId: students.apaarId,
        referenceId: digilockerSyncLogs.referenceId,
        status: digilockerSyncLogs.status,
        syncAttemptedAt: digilockerSyncLogs.syncAttemptedAt,
        errorMessage: digilockerSyncLogs.errorMessage,
        digiLockerUri: digilockerSyncLogs.responseHash,
        documentNumber: issuedCertificates.certificateNumber,
        issueDate: issuedCertificates.issuedDate,
    })
    .from(digilockerSyncLogs)
    .leftJoin(students, eq(digilockerSyncLogs.studentId, students.id))
    .leftJoin(issuedCertificates, eq(digilockerSyncLogs.referenceId, issuedCertificates.id))
    .where(eq(digilockerSyncLogs.tenantId, tenantId))
    .orderBy(desc(digilockerSyncLogs.syncAttemptedAt));

    return rows;
}

export async function pushToDigilocker(studentId: string, documentType: string) {
    const { tenantId } = await requireAuth('certificate:write');

    const mockXmlPayload = `<Certificate><StudentId>${studentId}</StudentId><Type>${documentType}</Type><Data>Mock Digilocker Content</Data></Certificate>`;

    const [log] = await db.insert(digilockerSyncLogs)
        .values({
            tenantId,
            studentId,
            documentType,
            xmlPayload: mockXmlPayload,
            status: 'SUCCESS',
            responseHash: `dl://${documentType.toLowerCase()}/${randomUUID()}`,
        })
        .returning();

    return { success: true, uri: log.responseHash };
}

export async function getStudentsWithApaar() {
    const { tenantId } = await requireAuth('certificate:read');
    
    return db.select({
        studentId: students.id,
        firstName: students.firstName,
        lastName: students.lastName,
        apaarId: students.apaarId,
    })
    .from(students)
    .where(eq(students.tenantId, tenantId))
    .orderBy(students.firstName);
}

export async function verifyAPAARId(studentId: string, apaarId: string) {
    const { tenantId } = await requireAuth('certificate:write');
    
    const isValid = apaarId.startsWith('APAAR') && apaarId.length >= 10;
    if (!isValid) {
        return { success: false, message: 'Invalid APAAR ID format.' };
    }

    await db.update(students)
        .set({ apaarId })
        .where(and(eq(students.id, studentId), eq(students.tenantId, tenantId)));
        
    return { success: true, message: 'APAAR ID verified and linked successfully.' };
}
