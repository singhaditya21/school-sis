'use server';

import { db } from '@/lib/db';
import { issuedCertificates, certificateTemplates } from '@/lib/db/schema/certificate';
import { students } from '@/lib/db/schema/students';
import { users } from '@/lib/db/schema/core';
import { getSession } from '@/lib/auth/session';
import { eq, desc } from 'drizzle-orm';

/**
 * Fetch all credentials logged in the trust ledger
 */
export async function getCredentialRegistryAction() {
    const session = await getSession();
    if (!session.tenantId) throw new Error('Unauthorized');

    const credentials = await db
        .select({
            id: issuedCertificates.id,
            certificateNumber: issuedCertificates.certificateNumber,
            status: issuedCertificates.status,
            issuedDate: issuedCertificates.issuedDate,
            templateName: certificateTemplates.name,
            studentName: students.firstName,
            issuedBy: users.name,
        })
        .from(issuedCertificates)
        .leftJoin(certificateTemplates, eq(issuedCertificates.templateId, certificateTemplates.id))
        .leftJoin(students, eq(issuedCertificates.studentId, students.id))
        .leftJoin(users, eq(issuedCertificates.issuedBy, users.id))
        .where(eq(issuedCertificates.tenantId, session.tenantId))
        .orderBy(desc(issuedCertificates.issuedDate));

    return credentials;
}
