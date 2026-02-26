'use server';

import { db } from '@/lib/db';
import { admissionLeads, admissionApplications, admissionDocuments, users } from '@/lib/db/schema';
import { eq, and, count, asc, desc } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';

export interface AdmissionLeadItem {
    id: string;
    childFirstName: string;
    childLastName: string;
    childDob: string | null;
    applyingForGrade: string;
    parentName: string;
    parentEmail: string;
    parentPhone: string;
    source: string;
    stage: string;
    assignedToName: string | null;
    createdAt: Date;
}

export async function getAdmissionLeads(options?: {
    stage?: string;
    limit?: number;
}): Promise<{ leads: AdmissionLeadItem[]; total: number }> {
    const { tenantId } = await requireAuth('admissions:read');
    const limit = options?.limit || 50;

    const conditions = [eq(admissionLeads.tenantId, tenantId)];
    if (options?.stage) {
        conditions.push(eq(admissionLeads.stage, options.stage as any));
    }

    const [countResult] = await db
        .select({ count: count() })
        .from(admissionLeads)
        .where(and(...conditions));

    const rows = await db
        .select({
            id: admissionLeads.id,
            childFirstName: admissionLeads.childFirstName,
            childLastName: admissionLeads.childLastName,
            childDob: admissionLeads.childDob,
            applyingForGrade: admissionLeads.applyingForGrade,
            parentName: admissionLeads.parentName,
            parentEmail: admissionLeads.parentEmail,
            parentPhone: admissionLeads.parentPhone,
            source: admissionLeads.source,
            stage: admissionLeads.stage,
            assignedFirstName: users.firstName,
            assignedLastName: users.lastName,
            createdAt: admissionLeads.createdAt,
        })
        .from(admissionLeads)
        .leftJoin(users, eq(admissionLeads.assignedTo, users.id))
        .where(and(...conditions))
        .orderBy(desc(admissionLeads.createdAt))
        .limit(limit);

    return {
        leads: rows.map(r => ({
            id: r.id,
            childFirstName: r.childFirstName,
            childLastName: r.childLastName,
            childDob: r.childDob,
            applyingForGrade: r.applyingForGrade,
            parentName: r.parentName,
            parentEmail: r.parentEmail,
            parentPhone: r.parentPhone,
            source: r.source,
            stage: r.stage,
            assignedToName: r.assignedFirstName ? `${r.assignedFirstName} ${r.assignedLastName}` : null,
            createdAt: r.createdAt,
        })),
        total: countResult.count,
    };
}

export async function getAdmissionPipelineCounts() {
    const { tenantId } = await requireAuth('admissions:read');

    const stages = ['NEW', 'CONTACTED', 'FORM_SUBMITTED', 'DOCUMENTS_PENDING', 'INTERVIEW_SCHEDULED', 'INTERVIEW_DONE', 'OFFERED', 'ACCEPTED', 'ENROLLED', 'REJECTED', 'WITHDRAWN'] as const;

    const result: Record<string, number> = {};
    for (const stage of stages) {
        const [row] = await db
            .select({ count: count() })
            .from(admissionLeads)
            .where(and(eq(admissionLeads.tenantId, tenantId), eq(admissionLeads.stage, stage)));
        result[stage] = row.count;
    }

    return result;
}
