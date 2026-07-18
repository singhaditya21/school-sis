'use server';

import { pool } from '@/lib/db';
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

    const conditions: string[] = ['l.tenant_id = $1'];
    const params: string[] = [tenantId];

    if (options?.stage) {
        params.push(options.stage);
        conditions.push(`l.stage = $${params.length}`);
    }

    const { rows: countResult } = await pool.query(`
        SELECT COUNT(*) AS count
        FROM admission_leads l
        WHERE ${conditions.join(' AND ')}
    `, params);

    const { rows } = await pool.query(`
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
        WHERE ${conditions.join(' AND ')}
        ORDER BY l.created_at DESC
        LIMIT $${params.length + 1}
    `, [...params, limit]);

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
    const { rows } = await pool.query(`
        SELECT stage, COUNT(*) AS count
        FROM admission_leads
        WHERE tenant_id = $1
        GROUP BY stage
    `, [tenantId]);

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

    await pool.query(`
        INSERT INTO admission_leads (id, tenant_id, child_first_name, child_last_name, child_dob, applying_for_grade, parent_name, parent_email, parent_phone, source, stage, notes, previous_school)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
        randomUUID(),
        tenantId,
        childFirstName,
        childLastName,
        childDob || null,
        applyingForGrade,
        parentName,
        parentEmail,
        parentPhone,
        source,
        'NEW',
        notes || null,
        previousSchool || null,
    ]);

    redirect('/admissions');
}

export async function updateLeadStage(leadId: string, newStage: string) {
    const { tenantId } = await requireAuth('admissions:write');

    const validStages = ['NEW', 'CONTACTED', 'FORM_SUBMITTED', 'DOCUMENTS_PENDING', 'INTERVIEW_SCHEDULED', 'INTERVIEW_DONE', 'OFFERED', 'ACCEPTED', 'ENROLLED', 'REJECTED', 'WITHDRAWN'];
    if (!validStages.includes(newStage)) {
        return { success: false, error: 'Invalid pipeline stage' };
    }

    await pool.query(`
        UPDATE admission_leads
        SET stage = $1, updated_at = NOW()
        WHERE id = $2 AND tenant_id = $3
    `, [newStage, leadId, tenantId]);

    return { success: true };
}

export async function getLeadById(leadId: string): Promise<AdmissionLeadItem | null> {
    const { tenantId } = await requireAuth('admissions:read');

    const { rows } = await pool.query(`
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
        WHERE l.id = $1 AND l.tenant_id = $2
    `, [leadId, tenantId]);

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

    const { rows: leadRows } = await pool.query(`
        SELECT id, child_first_name AS "childFirstName", child_last_name AS "childLastName", child_dob AS "childDob", stage, parent_name AS "parentName", parent_phone AS "parentPhone", parent_email AS "parentEmail"
        FROM admission_leads
        WHERE id = $1 AND tenant_id = $2
    `, [leadId, tenantId]);

    if (!leadRows.length) return { success: false, error: 'Lead not found' };
    const lead = leadRows[0];
    if (lead.stage === 'ENROLLED') return { success: false, error: 'Lead already enrolled' };

    const admissionNumber = `ADM-${Date.now().toString(36).toUpperCase()}`;
    const studentId = randomUUID();

    await pool.query(`
        INSERT INTO students (id, tenant_id, admission_number, first_name, last_name, date_of_birth, gender, grade_id, section_id, status, admission_date)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
        studentId,
        tenantId,
        admissionNumber,
        lead.childFirstName,
        lead.childLastName,
        lead.childDob || new Date().toISOString().split('T')[0],
        'OTHER',
        gradeId,
        sectionId,
        'ACTIVE',
        new Date().toISOString().split("T")[0]
    ]);

    const [parentFirstName, ...lastParts] = lead.parentName.split(' ');
    const parentLastName = lastParts.join(' ') || lead.parentName;

    await pool.query(`
        INSERT INTO guardians (id, tenant_id, student_id, first_name, last_name, relation, phone, email, is_primary)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
        randomUUID(),
        tenantId,
        studentId,
        parentFirstName,
        parentLastName,
        'PARENT',
        lead.parentPhone,
        lead.parentEmail,
        true
    ]);

    await pool.query(`
        UPDATE admission_leads
        SET stage = 'ENROLLED', updated_at = NOW()
        WHERE id = $1
    `, [leadId]);

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

    const { rows: sourceRows } = await pool.query(`
        SELECT source, COUNT(*) AS count
        FROM admission_leads
        WHERE tenant_id = $1
        GROUP BY source
    `, [tenantId]);

    const { rows: avgRow } = await pool.query(`
        SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) / 86400, 0)::integer AS "avgDays"
        FROM admission_leads
        WHERE tenant_id = $1 AND stage = 'ENROLLED'
    `, [tenantId]);

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

    const { rows: leadRows } = await pool.query(`
        SELECT source, stage, child_first_name AS "childFirstName", child_last_name AS "childLastName", child_dob AS "childDob", parent_email AS "parentEmail", parent_phone AS "parentPhone", previous_school AS "previousSchool", created_at AS "createdAt"
        FROM admission_leads
        WHERE id = $1 AND tenant_id = $2
    `, [leadId, tenantId]);

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

    const { rows: uploaded } = await pool.query(`
        SELECT document_type AS "documentType", file_name AS "fileName", file_url AS "fileUrl", is_verified AS "isVerified"
        FROM admission_documents
        WHERE application_id = $1 AND tenant_id = $2
    `, [applicationId, tenantId]);

    type UploadedAdmissionDocument = {
        documentType: string;
        fileName: string | null;
        fileUrl: string | null;
        isVerified: boolean;
    };
    const uploadedMap = new Map<string, UploadedAdmissionDocument>(
        uploaded.map((d: UploadedAdmissionDocument) => [d.documentType, d])
    );

    return REQUIRED_DOCUMENTS.map(docType => ({
        documentType: docType,
        isUploaded: uploadedMap.has(docType),
        isVerified: uploadedMap.get(docType)?.isVerified ? true : false,
        fileName: uploadedMap.get(docType)?.fileName || null,
        fileUrl: uploadedMap.get(docType)?.fileUrl || null,
    }));
}

export async function triggerStageNotification(leadId: string, newStage: string) {
    const { tenantId } = await requireAuth('admissions:write');

    const { rows: leadRows } = await pool.query(`
        SELECT parent_name AS "parentName", child_first_name AS "childFirstName", applying_for_grade AS "applyingForGrade", parent_email AS "parentEmail"
        FROM admission_leads
        WHERE id = $1 AND tenant_id = $2
    `, [leadId, tenantId]);

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
    await emailProvider.send({
        to: lead.parentEmail,
        subject: template.subject,
        html: template.body,
    });

    return { success: true, sent: true };
}

export async function getWaitlist(grade?: string) {
    const { tenantId } = await requireAuth('admissions:read');

    let query = `
        SELECT id, child_first_name || ' ' || child_last_name AS "childName", applying_for_grade AS grade, parent_name AS "parentName", parent_phone AS "parentPhone", created_at AS "createdAt"
        FROM admission_leads
        WHERE tenant_id = $1 AND stage = 'OFFERED'
    `;
    const params: string[] = [tenantId];

    if (grade) {
        params.push(grade);
        query += ` AND applying_for_grade = $2`;
    }

    query += ` ORDER BY created_at ASC`;
    const { rows } = await pool.query(query, params);
    
    return rows;
}

export async function offerFromWaitlist(leadId: string) {
    const { tenantId } = await requireAuth('admissions:write');

    await pool.query(`
        UPDATE admission_leads
        SET stage = 'OFFERED', updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2
    `, [leadId, tenantId]);

    await triggerStageNotification(leadId, 'OFFERED');

    return { success: true };
}
