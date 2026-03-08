'use server';

import { db } from '@/lib/db';
import { admissionLeads, admissionApplications, admissionDocuments, users, students, guardians } from '@/lib/db/schema';
import { eq, and, count, asc, desc, sql, ne } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { randomUUID } from 'crypto';
import { redirect } from 'next/navigation';

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
    notes: string | null;
    previousSchool: string | null;
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
            notes: admissionLeads.notes,
            previousSchool: admissionLeads.previousSchool,
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
            notes: r.notes,
            previousSchool: r.previousSchool,
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

// ─── Create Lead ─────────────────────────────────────────────

export async function createLead(formData: FormData) {
    const { tenantId } = await requireAuth('admissions:write');

    const childFirstName = formData.get('childFirstName') as string;
    const childLastName = formData.get('childLastName') as string;
    const childDob = formData.get('childDob') as string | null;
    const applyingForGrade = formData.get('applyingForGrade') as string;
    const parentName = formData.get('parentName') as string;
    const parentEmail = formData.get('parentEmail') as string;
    const parentPhone = formData.get('parentPhone') as string;
    const source = (formData.get('source') as string) || 'WEBSITE';
    const notes = formData.get('notes') as string | null;
    const previousSchool = formData.get('previousSchool') as string | null;

    // Validate required fields
    if (!childFirstName || !childLastName || !applyingForGrade || !parentName || !parentEmail || !parentPhone) {
        return { success: false, error: 'Missing required fields' };
    }

    await db.insert(admissionLeads).values({
        id: randomUUID(),
        tenantId,
        childFirstName,
        childLastName,
        childDob: childDob || null,
        applyingForGrade,
        parentName,
        parentEmail,
        parentPhone,
        source: source as any,
        stage: 'NEW',
        notes,
        previousSchool,
    });

    redirect('/admissions');
}

// ─── Update Lead Stage ───────────────────────────────────────

export async function updateLeadStage(leadId: string, newStage: string) {
    const { tenantId } = await requireAuth('admissions:write');

    const validStages = ['NEW', 'CONTACTED', 'FORM_SUBMITTED', 'DOCUMENTS_PENDING', 'INTERVIEW_SCHEDULED', 'INTERVIEW_DONE', 'OFFERED', 'ACCEPTED', 'ENROLLED', 'REJECTED', 'WITHDRAWN'];
    if (!validStages.includes(newStage)) {
        return { success: false, error: 'Invalid pipeline stage' };
    }

    await db.update(admissionLeads)
        .set({ stage: newStage as any, updatedAt: new Date() })
        .where(and(eq(admissionLeads.id, leadId), eq(admissionLeads.tenantId, tenantId)));

    return { success: true };
}

// ─── Get Lead By ID ──────────────────────────────────────────

export async function getLeadById(leadId: string): Promise<AdmissionLeadItem | null> {
    const { tenantId } = await requireAuth('admissions:read');

    const [row] = await db
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
            notes: admissionLeads.notes,
            previousSchool: admissionLeads.previousSchool,
            assignedFirstName: users.firstName,
            assignedLastName: users.lastName,
            createdAt: admissionLeads.createdAt,
        })
        .from(admissionLeads)
        .leftJoin(users, eq(admissionLeads.assignedTo, users.id))
        .where(and(eq(admissionLeads.id, leadId), eq(admissionLeads.tenantId, tenantId)));

    if (!row) return null;

    return {
        id: row.id,
        childFirstName: row.childFirstName,
        childLastName: row.childLastName,
        childDob: row.childDob,
        applyingForGrade: row.applyingForGrade,
        parentName: row.parentName,
        parentEmail: row.parentEmail,
        parentPhone: row.parentPhone,
        source: row.source,
        stage: row.stage,
        notes: row.notes,
        previousSchool: row.previousSchool,
        assignedToName: row.assignedFirstName ? `${row.assignedFirstName} ${row.assignedLastName}` : null,
        createdAt: row.createdAt,
    };
}

// ─── Convert Lead to Student ─────────────────────────────────

export async function convertLeadToStudent(
    leadId: string,
    gradeId: string,
    sectionId: string,
): Promise<{ success: boolean; studentId?: string; error?: string }> {
    const { tenantId } = await requireAuth('admissions:write');

    // Get lead data
    const [lead] = await db
        .select()
        .from(admissionLeads)
        .where(and(eq(admissionLeads.id, leadId), eq(admissionLeads.tenantId, tenantId)));

    if (!lead) return { success: false, error: 'Lead not found' };
    if (lead.stage === 'ENROLLED') return { success: false, error: 'Lead already enrolled' };

    // Generate admission number
    const admissionNumber = `ADM-${Date.now().toString(36).toUpperCase()}`;

    // Create student record
    const studentId = randomUUID();
    await db.insert(students).values({
        id: studentId,
        tenantId,
        admissionNumber,
        firstName: lead.childFirstName,
        lastName: lead.childLastName,
        dateOfBirth: lead.childDob || new Date().toISOString().split('T')[0],
        gender: 'OTHER' as any, // default — can be updated later
        gradeId,
        sectionId,
        status: 'ACTIVE' as any,
    });

    // Create guardian record
    const [parentFirstName, ...lastParts] = lead.parentName.split(' ');
    const parentLastName = lastParts.join(' ') || lead.parentName;

    await db.insert(guardians).values({
        id: randomUUID(),
        tenantId,
        studentId,
        firstName: parentFirstName,
        lastName: parentLastName,
        relationship: 'PARENT' as any,
        phone: lead.parentPhone,
        email: lead.parentEmail,
        isPrimary: true,
    });

    // Update lead stage to ENROLLED
    await db.update(admissionLeads)
        .set({ stage: 'ENROLLED' as any, updatedAt: new Date() })
        .where(eq(admissionLeads.id, leadId));

    return { success: true, studentId };
}

// ─── Admissions Analytics ────────────────────────────────────

export interface AdmissionsAnalytics {
    totalLeads: number;
    enrolled: number;
    rejected: number;
    withdrawn: number;
    conversionRate: number; // enrolled / (total - withdrawn)
    activeInPipeline: number;
    sourceBreakdown: { source: string; count: number }[];
    avgDaysToEnroll: number;
}

export async function getAdmissionsAnalytics(): Promise<AdmissionsAnalytics> {
    const { tenantId } = await requireAuth('admissions:read');

    // Get counts per stage
    const pipeline = await getAdmissionPipelineCounts();

    const totalLeads = Object.values(pipeline).reduce((sum, c) => sum + c, 0);
    const enrolled = pipeline['ENROLLED'] || 0;
    const rejected = pipeline['REJECTED'] || 0;
    const withdrawn = pipeline['WITHDRAWN'] || 0;
    const activeInPipeline = totalLeads - enrolled - rejected - withdrawn;

    const denominator = totalLeads - withdrawn;
    const conversionRate = denominator > 0 ? Math.round((enrolled / denominator) * 100) : 0;

    // Source breakdown
    const sourceRows = await db
        .select({
            source: admissionLeads.source,
            count: count(),
        })
        .from(admissionLeads)
        .where(eq(admissionLeads.tenantId, tenantId))
        .groupBy(admissionLeads.source);

    // Average days to enroll (for enrolled leads)
    const [avgRow] = await db
        .select({
            avgDays: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (${admissionLeads.updatedAt} - ${admissionLeads.createdAt})) / 86400)::integer, 0)`,
        })
        .from(admissionLeads)
        .where(and(eq(admissionLeads.tenantId, tenantId), eq(admissionLeads.stage, 'ENROLLED')));

    return {
        totalLeads,
        enrolled,
        rejected,
        withdrawn,
        conversionRate,
        activeInPipeline,
        sourceBreakdown: sourceRows.map(r => ({ source: r.source, count: r.count })),
        avgDaysToEnroll: Number(avgRow?.avgDays || 0),
    };
}

// ─── Lead Scoring ────────────────────────────────────────────

export async function scoreLead(leadId: string): Promise<{
    score: number;
    breakdown: { factor: string; score: number; maxScore: number }[];
}> {
    const { tenantId } = await requireAuth('admissions:read');

    const [lead] = await db
        .select()
        .from(admissionLeads)
        .where(and(eq(admissionLeads.id, leadId), eq(admissionLeads.tenantId, tenantId)));

    if (!lead) return { score: 0, breakdown: [] };

    const breakdown: { factor: string; score: number; maxScore: number }[] = [];

    // Source score (25 pts max) — referrals and walk-ins are stronger intent
    const sourceScores: Record<string, number> = {
        REFERRAL: 25, WALK_IN: 22, WEBSITE: 18, SOCIAL_MEDIA: 15, ADVERTISEMENT: 12, OTHER: 10,
    };
    breakdown.push({ factor: 'Source Quality', score: sourceScores[lead.source] || 10, maxScore: 25 });

    // Engagement score (25 pts max) — further stages = more engaged
    const stageScores: Record<string, number> = {
        NEW: 5, CONTACTED: 10, FORM_SUBMITTED: 15, DOCUMENTS_PENDING: 18,
        INTERVIEW_SCHEDULED: 20, INTERVIEW_DONE: 23, OFFERED: 25,
    };
    breakdown.push({ factor: 'Engagement Level', score: stageScores[lead.stage] || 5, maxScore: 25 });

    // Data completeness (25 pts max)
    let completeness = 0;
    if (lead.childFirstName && lead.childLastName) completeness += 5;
    if (lead.childDob) completeness += 5;
    if (lead.parentEmail) completeness += 5;
    if (lead.parentPhone) completeness += 5;
    if (lead.previousSchool) completeness += 5;
    breakdown.push({ factor: 'Data Completeness', score: completeness, maxScore: 25 });

    // Recency score (25 pts max) — newer leads get higher scores
    const daysSinceCreated = Math.floor((Date.now() - lead.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    const recencyScore = daysSinceCreated <= 3 ? 25 : daysSinceCreated <= 7 ? 20 : daysSinceCreated <= 14 ? 15 : daysSinceCreated <= 30 ? 10 : 5;
    breakdown.push({ factor: 'Recency', score: recencyScore, maxScore: 25 });

    const total = breakdown.reduce((sum, b) => sum + b.score, 0);

    return { score: total, breakdown };
}

// ─── Document Checklist ──────────────────────────────────────

const REQUIRED_DOCUMENTS = [
    'Birth Certificate',
    'Previous School TC',
    'Report Card (Last Year)',
    'Medical Certificate',
    'Passport Size Photos',
    'Address Proof',
    'Parent ID Proof',
];

export async function getDocumentChecklist(applicationId: string) {
    const { tenantId } = await requireAuth('admissions:read');

    // Fetch uploaded documents
    const uploaded = await db
        .select({
            documentType: admissionDocuments.documentType,
            fileName: admissionDocuments.fileName,
            fileUrl: admissionDocuments.fileUrl,
            isVerified: admissionDocuments.isVerified,
        })
        .from(admissionDocuments)
        .where(and(
            eq(admissionDocuments.applicationId, applicationId),
            eq(admissionDocuments.tenantId, tenantId),
        ));

    const uploadedMap = new Map(uploaded.map(d => [d.documentType, d]));

    return REQUIRED_DOCUMENTS.map(docType => ({
        documentType: docType,
        isUploaded: uploadedMap.has(docType),
        isVerified: uploadedMap.get(docType)?.isVerified ? true : false,
        fileName: uploadedMap.get(docType)?.fileName || null,
        fileUrl: uploadedMap.get(docType)?.fileUrl || null,
    }));
}

// ─── Stage Notification ──────────────────────────────────────

export async function triggerStageNotification(leadId: string, newStage: string) {
    const { tenantId } = await requireAuth('admissions:write');

    const [lead] = await db
        .select()
        .from(admissionLeads)
        .where(and(eq(admissionLeads.id, leadId), eq(admissionLeads.tenantId, tenantId)));

    if (!lead) return { success: false, error: 'Lead not found' };

    const stageMessages: Record<string, { subject: string; body: string }> = {
        CONTACTED: {
            subject: 'Thank you for your interest in ScholarMind',
            body: `<p>Dear ${lead.parentName},</p><p>Thank you for your interest in enrolling ${lead.childFirstName}. Our admissions team will be in touch shortly.</p>`,
        },
        FORM_SUBMITTED: {
            subject: 'Application Received',
            body: `<p>Dear ${lead.parentName},</p><p>We have received the application for ${lead.childFirstName} for ${lead.applyingForGrade}. Our team will review it and get back to you.</p>`,
        },
        INTERVIEW_SCHEDULED: {
            subject: 'Interview Scheduled',
            body: `<p>Dear ${lead.parentName},</p><p>An interview has been scheduled for ${lead.childFirstName}. Please check your portal for details.</p>`,
        },
        OFFERED: {
            subject: 'Admission Offer',
            body: `<p>Dear ${lead.parentName},</p><p>We are pleased to offer admission to ${lead.childFirstName} for ${lead.applyingForGrade}. Please log in to accept.</p>`,
        },
        REJECTED: {
            subject: 'Application Update',
            body: `<p>Dear ${lead.parentName},</p><p>Thank you for considering us. Unfortunately, we are unable to offer a seat at this time. We wish ${lead.childFirstName} the best.</p>`,
        },
    };

    const template = stageMessages[newStage];
    if (!template || !lead.parentEmail) return { success: true, sent: false };

    // Fire-and-forget via email provider
    const { getEmailProvider } = await import('@/lib/providers/email');
    const emailProvider = getEmailProvider();
    await emailProvider.send({
        to: lead.parentEmail,
        subject: template.subject,
        html: template.body,
    });

    return { success: true, sent: true };
}

// ─── Waitlist Management ─────────────────────────────────────

export async function getWaitlist(grade?: string) {
    const { tenantId } = await requireAuth('admissions:read');

    const conditions = [
        eq(admissionLeads.tenantId, tenantId),
        eq(admissionLeads.stage, 'OFFERED'),
    ];

    if (grade) conditions.push(eq(admissionLeads.applyingForGrade, grade));

    return db
        .select({
            id: admissionLeads.id,
            childName: sql<string>`${admissionLeads.childFirstName} || ' ' || ${admissionLeads.childLastName}`,
            grade: admissionLeads.applyingForGrade,
            parentName: admissionLeads.parentName,
            parentPhone: admissionLeads.parentPhone,
            createdAt: admissionLeads.createdAt,
        })
        .from(admissionLeads)
        .where(and(...conditions))
        .orderBy(asc(admissionLeads.createdAt)); // FIFO
}

export async function offerFromWaitlist(leadId: string) {
    const { tenantId } = await requireAuth('admissions:write');

    await db.update(admissionLeads)
        .set({ stage: 'OFFERED', updatedAt: new Date() })
        .where(and(eq(admissionLeads.id, leadId), eq(admissionLeads.tenantId, tenantId)));

    // Trigger notification
    await triggerStageNotification(leadId, 'OFFERED');

    return { success: true };
}

