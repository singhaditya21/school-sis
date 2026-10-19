'use server';

import { sql } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { encryptDeterministic } from '@/lib/encryption';
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
    const stageFilter = options?.stage ? sql`AND l.stage = ${options.stage}` : sql``;

    const countResult = await sql<{ count: string }>`
        SELECT COUNT(*) AS count
        FROM admission_leads l
        WHERE l.tenant_id = ${tenantId} ${stageFilter}
    `;

    type LeadRow = {
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
        notes: string | null;
        previousSchool: string | null;
        assignedFirstName: string | null;
        assignedLastName: string | null;
        createdAt: Date;
    };

    const rows = await sql<LeadRow>`
        SELECT 
            l.id, 
            l.child_first_name AS "childFirstName", 
            l.child_last_name AS "childLastName", 
            l.child_dob AS "childDob", 
            l.applying_for_grade AS "applyingForGrade", 
            l.parent_name AS "parentName", 
            l.parent_email AS "parentEmail", 
            l.parent_phone AS "parentPhone", 
            l.source, 
            l.stage, 
            l.notes, 
            l.previous_school AS "previousSchool", 
            u.first_name AS "assignedFirstName", 
            u.last_name AS "assignedLastName", 
            l.created_at AS "createdAt"
        FROM admission_leads l
        LEFT JOIN users u ON l.assigned_to = u.id
        WHERE l.tenant_id = ${tenantId} ${stageFilter}
        ORDER BY l.created_at DESC
        LIMIT ${limit}
    `;

    return {
        leads: rows.map((r: LeadRow) => ({
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
        total: parseInt(countResult[0].count, 10),
    };
}

export async function getAdmissionPipelineCounts() {
    const { tenantId } = await requireAuth('admissions:read');

    const stages = ['NEW', 'CONTACTED', 'FORM_SUBMITTED', 'DOCUMENTS_PENDING', 'INTERVIEW_SCHEDULED', 'INTERVIEW_DONE', 'OFFERED', 'ACCEPTED', 'ENROLLED', 'REJECTED', 'WITHDRAWN'] as const;

    const result: Record<string, number> = {};
    const rows = await sql<{ stage: string; count: string }>`
        SELECT stage, COUNT(*) AS count
        FROM admission_leads
        WHERE tenant_id = ${tenantId}
        GROUP BY stage
    `;

    for (const stage of stages) {
        result[stage] = 0;
    }
    for (const row of rows) {
        result[row.stage] = parseInt(row.count, 10);
    }

    return result;
}

export async function createLead(formData: FormData): Promise<void> {
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

    if (!childFirstName || !childLastName || !applyingForGrade || !parentName || !parentEmail || !parentPhone) {
        throw new Error('Missing required fields');
    }

    await sql`
        INSERT INTO admission_leads (id, tenant_id, child_first_name, child_last_name, child_dob, applying_for_grade, parent_name, parent_email, parent_phone, source, stage, notes, previous_school)
        VALUES (${randomUUID()}, ${tenantId}, ${childFirstName}, ${childLastName}, ${childDob || null}, ${applyingForGrade}, ${parentName}, ${parentEmail}, ${parentPhone}, ${source}, ${'NEW'}, ${notes || null}, ${previousSchool || null})
    `;

    redirect('/admissions');
}

export async function getLeadById(leadId: string): Promise<AdmissionLeadItem | null> {
    const { tenantId } = await requireAuth('admissions:read');

    const rows = await sql<{
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
        notes: string | null;
        previousSchool: string | null;
        assignedFirstName: string | null;
        assignedLastName: string | null;
        createdAt: Date;
    }>`
        SELECT 
            l.id, 
            l.child_first_name AS "childFirstName", 
            l.child_last_name AS "childLastName", 
            l.child_dob AS "childDob", 
            l.applying_for_grade AS "applyingForGrade", 
            l.parent_name AS "parentName", 
            l.parent_email AS "parentEmail", 
            l.parent_phone AS "parentPhone", 
            l.source, 
            l.stage, 
            l.notes, 
            l.previous_school AS "previousSchool", 
            u.first_name AS "assignedFirstName", 
            u.last_name AS "assignedLastName", 
            l.created_at AS "createdAt"
        FROM admission_leads l
        LEFT JOIN users u ON l.assigned_to = u.id
        WHERE l.id = ${leadId} AND l.tenant_id = ${tenantId}
    `;

    if (!rows.length) return null;
    const row = rows[0];

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

export async function convertLeadToStudent(
    leadId: string,
    gradeId: string,
    sectionId: string,
): Promise<{ success: boolean; studentId?: string; error?: string }> {
    const { tenantId } = await requireAuth('admissions:write');

    const leadRows = await sql<{
        id: string;
        childFirstName: string;
        childLastName: string;
        childDob: string | null;
        stage: string;
        parentName: string;
        parentPhone: string;
        parentEmail: string;
    }>`
        SELECT id, child_first_name AS "childFirstName", child_last_name AS "childLastName", child_dob AS "childDob", stage, parent_name AS "parentName", parent_phone AS "parentPhone", parent_email AS "parentEmail"
        FROM admission_leads
        WHERE id = ${leadId} AND tenant_id = ${tenantId}
    `;

    if (!leadRows.length) return { success: false, error: 'Lead not found' };
    const lead = leadRows[0];
    if (lead.stage === 'ENROLLED') return { success: false, error: 'Lead already enrolled' };

    const admissionNumber = `ADM-${Date.now().toString(36).toUpperCase()}`;
    const studentId = randomUUID();
    const today = new Date().toISOString().split('T')[0];

    await sql`
        INSERT INTO students (id, tenant_id, admission_number, first_name, last_name, date_of_birth, gender, grade_id, section_id, status, admission_date)
        VALUES (${studentId}, ${tenantId}, ${admissionNumber}, ${lead.childFirstName}, ${lead.childLastName}, ${lead.childDob || today}, ${'OTHER'}, ${gradeId}, ${sectionId}, ${'ACTIVE'}, ${today})
    `;

    const [parentFirstName, ...lastParts] = lead.parentName.split(' ');
    const parentLastName = lastParts.join(' ') || lead.parentName;

    await sql`
        INSERT INTO guardians (id, tenant_id, student_id, first_name, last_name, relation, phone_enc, email_enc, is_primary)
        VALUES (${randomUUID()}, ${tenantId}, ${studentId}, ${parentFirstName}, ${parentLastName}, ${'PARENT'}, ${encryptDeterministic(lead.parentPhone, 'guardians.phone')}, ${encryptDeterministic(lead.parentEmail, 'guardians.email')}, ${true})
    `;

    await sql`
        UPDATE admission_leads
        SET stage = 'ENROLLED', updated_at = NOW()
        WHERE id = ${leadId}
    `;

    return { success: true, studentId };
}

export interface AdmissionsAnalytics {
    totalLeads: number;
    enrolled: number;
    rejected: number;
    withdrawn: number;
    conversionRate: number; 
    activeInPipeline: number;
    sourceBreakdown: { source: string; count: number }[];
    avgDaysToEnroll: number;
}

export async function getAdmissionsAnalytics(): Promise<AdmissionsAnalytics> {
    const { tenantId } = await requireAuth('admissions:read');

    const pipeline = await getAdmissionPipelineCounts();

    const totalLeads = Object.values(pipeline).reduce((sum, c) => sum + c, 0);
    const enrolled = pipeline['ENROLLED'] || 0;
    const rejected = pipeline['REJECTED'] || 0;
    const withdrawn = pipeline['WITHDRAWN'] || 0;
    const activeInPipeline = totalLeads - enrolled - rejected - withdrawn;

    const denominator = totalLeads - withdrawn;
    const conversionRate = denominator > 0 ? Math.round((enrolled / denominator) * 100) : 0;

    const sourceRows = await sql<{ source: string; count: string }>`
        SELECT source, COUNT(*) AS count
        FROM admission_leads
        WHERE tenant_id = ${tenantId}
        GROUP BY source
    `;

    const avgRow = await sql<{ avgDays: number }>`
        SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) / 86400, 0)::integer AS "avgDays"
        FROM admission_leads
        WHERE tenant_id = ${tenantId} AND stage = 'ENROLLED'
    `;

    return {
        totalLeads,
        enrolled,
        rejected,
        withdrawn,
        conversionRate,
        activeInPipeline,
        sourceBreakdown: sourceRows.map((r: { source: string; count: string }) => ({ source: r.source, count: parseInt(r.count, 10) })),
        avgDaysToEnroll: Number(avgRow[0]?.avgDays || 0),
    };
}

export async function scoreLead(leadId: string): Promise<{
    score: number;
    breakdown: { factor: string; score: number; maxScore: number }[];
}> {
    const { tenantId } = await requireAuth('admissions:read');

    const leadRows = await sql<{
        source: string;
        stage: string;
        childFirstName: string | null;
        childLastName: string | null;
        childDob: string | null;
        parentEmail: string | null;
        parentPhone: string | null;
        previousSchool: string | null;
        createdAt: Date;
    }>`
        SELECT source, stage, child_first_name AS "childFirstName", child_last_name AS "childLastName", child_dob AS "childDob", parent_email AS "parentEmail", parent_phone AS "parentPhone", previous_school AS "previousSchool", created_at AS "createdAt"
        FROM admission_leads
        WHERE id = ${leadId} AND tenant_id = ${tenantId}
    `;

    if (!leadRows.length) return { score: 0, breakdown: [] };
    const lead = leadRows[0];

    const breakdown: { factor: string; score: number; maxScore: number }[] = [];

    const sourceScores: Record<string, number> = {
        REFERRAL: 25, WALK_IN: 22, WEBSITE: 18, SOCIAL_MEDIA: 15, ADVERTISEMENT: 12, OTHER: 10,
    };
    breakdown.push({ factor: 'Source Quality', score: sourceScores[lead.source] || 10, maxScore: 25 });

    const stageScores: Record<string, number> = {
        NEW: 5, CONTACTED: 10, FORM_SUBMITTED: 15, DOCUMENTS_PENDING: 18,
        INTERVIEW_SCHEDULED: 20, INTERVIEW_DONE: 23, OFFERED: 25,
    };
    breakdown.push({ factor: 'Engagement Level', score: stageScores[lead.stage] || 5, maxScore: 25 });

    let completeness = 0;
    if (lead.childFirstName && lead.childLastName) completeness += 5;
    if (lead.childDob) completeness += 5;
    if (lead.parentEmail) completeness += 5;
    if (lead.parentPhone) completeness += 5;
    if (lead.previousSchool) completeness += 5;
    breakdown.push({ factor: 'Data Completeness', score: completeness, maxScore: 25 });

    const daysSinceCreated = Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60 * 24));
    const recencyScore = daysSinceCreated <= 3 ? 25 : daysSinceCreated <= 7 ? 20 : daysSinceCreated <= 14 ? 15 : daysSinceCreated <= 30 ? 10 : 5;
    breakdown.push({ factor: 'Recency', score: recencyScore, maxScore: 25 });

    const total = breakdown.reduce((sum, b) => sum + b.score, 0);

    return { score: total, breakdown };
}

export async function triggerStageNotification(leadId: string, newStage: string) {
    const { tenantId } = await requireAuth('admissions:write');

    const leadRows = await sql<{
        parentName: string;
        childFirstName: string;
        applyingForGrade: string;
        parentEmail: string | null;
    }>`
        SELECT parent_name AS "parentName", child_first_name AS "childFirstName", applying_for_grade AS "applyingForGrade", parent_email AS "parentEmail"
        FROM admission_leads
        WHERE id = ${leadId} AND tenant_id = ${tenantId}
    `;

    if (!leadRows.length) return { success: false, error: 'Lead not found' };
    const lead = leadRows[0];

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

    const { getEmailProvider } = await import('@/lib/providers/email');
    const emailProvider = getEmailProvider();
    const result = await emailProvider.send({
        to: lead.parentEmail,
        subject: template.subject,
        html: template.body,
    });

    if (!result.success) {
        return { success: false, sent: false, error: result.error || 'Email provider rejected delivery.' };
    }

    return { success: true, sent: true };
}
