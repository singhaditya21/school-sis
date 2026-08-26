'use server';

/**
 * Admissions workspace actions (colocated with the /admissions route group).
 *
 * Everything here runs against real tables:
 *   admission_leads → admission_applications → admission_documents
 * plus grades/sections/users for enrolment and lead ownership.
 */

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';

import { requireAuth } from '@/lib/auth/middleware';
import { pool } from '@/lib/db';
import { notificationProviderForChannel } from '@/lib/integrations/runtime-mode';
import { convertLeadToStudent, triggerStageNotification } from '@/lib/actions/admissions';

import { NOTIFIABLE_STAGES, PIPELINE_STAGES, REQUIRED_DOCUMENT_TYPES, STAGE_LABELS } from './constants';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Roles that can realistically own an admissions lead. */
const LEAD_OWNER_ROLES = [
    'SUPER_ADMIN',
    'SCHOOL_ADMIN',
    'PRINCIPAL',
    'REGISTRAR',
    'ADMISSION_COUNSELOR',
];

function isUuid(value: string): boolean {
    return UUID_RE.test(value);
}

// ─── Lead stage management ───────────────────────────────────

export interface StageMoveResult {
    success: boolean;
    error?: string;
    stage?: string;
    /** true when a parent email was actually accepted by the provider */
    notified?: boolean;
    /** set when notification was requested but could not be delivered */
    notifyError?: string;
}

/**
 * Move a lead to a new pipeline stage, optionally emailing the parent.
 * The stage change is committed even if the notification fails — the caller
 * is told separately so it can surface a partial result honestly.
 */
export async function moveLeadStage(
    leadId: string,
    newStage: string,
    notifyParent = false,
): Promise<StageMoveResult> {
    const { tenantId } = await requireAuth('admissions:write');

    if (!isUuid(leadId)) return { success: false, error: 'Invalid lead reference.' };
    if (!(PIPELINE_STAGES as readonly string[]).includes(newStage)) {
        return { success: false, error: 'Invalid pipeline stage.' };
    }

    const { rows } = await pool.query(
        `UPDATE admission_leads
         SET stage = $1, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3
         RETURNING id`,
        [newStage, leadId, tenantId],
    );
    if (!rows.length) return { success: false, error: 'Lead not found.' };

    const result: StageMoveResult = { success: true, stage: newStage };

    if (notifyParent) {
        if (notificationProviderForChannel('EMAIL') === 'unconfigured') {
            result.notifyError = 'No email provider is configured, so the parent was not notified.';
        } else {
            const notify: { success: boolean; sent?: boolean; error?: string } =
                await triggerStageNotification(leadId, newStage);
            if (notify.success && notify.sent) {
                result.notified = true;
            } else if (!notify.success) {
                result.notifyError = notify.error || 'The parent notification could not be sent.';
            } else {
                result.notifyError = `There is no parent email template for the ${newStage.replace(/_/g, ' ').toLowerCase()} stage.`;
            }
        }
    }

    revalidatePath('/admissions');
    revalidatePath(`/admissions/${leadId}`);
    return result;
}

/** Whether stage-change emails can actually leave the building. */
export async function getParentEmailChannelStatus(): Promise<{
    configured: boolean;
    provider: string;
}> {
    await requireAuth('admissions:read');
    const provider = notificationProviderForChannel('EMAIL');
    return { configured: provider !== 'unconfigured', provider };
}

/**
 * Send the parent the templated email for the lead's *current* stage.
 * Fails loudly rather than pretending, when there is no provider or template.
 */
export async function notifyParentOfStage(
    leadId: string,
): Promise<{ success: boolean; error?: string; message?: string }> {
    const { tenantId } = await requireAuth('admissions:write');
    if (!isUuid(leadId)) return { success: false, error: 'Invalid lead reference.' };

    const { rows } = await pool.query(
        `SELECT stage, parent_email AS "parentEmail"
         FROM admission_leads
         WHERE id = $1 AND tenant_id = $2`,
        [leadId, tenantId],
    );
    if (!rows.length) return { success: false, error: 'Lead not found.' };

    const stage: string = rows[0].stage;
    if (!rows[0].parentEmail) {
        return { success: false, error: 'This lead has no parent email address on record.' };
    }
    if (!NOTIFIABLE_STAGES.includes(stage)) {
        return {
            success: false,
            error: `There is no parent email template for the "${STAGE_LABELS[stage] || stage}" stage.`,
        };
    }
    if (notificationProviderForChannel('EMAIL') === 'unconfigured') {
        return {
            success: false,
            error: 'No email provider is configured for this deployment, so nothing was sent.',
        };
    }

    const notify: { success: boolean; sent?: boolean; error?: string } =
        await triggerStageNotification(leadId, stage);
    if (notify.success && notify.sent) {
        return { success: true, message: `Parent emailed about the "${STAGE_LABELS[stage] || stage}" stage.` };
    }
    return { success: false, error: notify.error || 'The parent notification could not be sent.' };
}

// ─── Lead ownership ──────────────────────────────────────────

export interface LeadOwnerOption {
    id: string;
    name: string;
    role: string;
}

export async function listLeadOwners(): Promise<LeadOwnerOption[]> {
    const { tenantId } = await requireAuth('admissions:read');

    const { rows } = await pool.query(
        `SELECT id, first_name AS "firstName", last_name AS "lastName", role
         FROM users
         WHERE tenant_id = $1
           AND is_active = true
           AND role::text = ANY($2::text[])
         ORDER BY first_name ASC, last_name ASC`,
        [tenantId, LEAD_OWNER_ROLES],
    );

    return rows.map((r: { id: string; firstName: string; lastName: string; role: string }) => ({
        id: r.id,
        name: `${r.firstName} ${r.lastName}`.trim(),
        role: r.role,
    }));
}

export async function getLeadAssignedTo(leadId: string): Promise<string | null> {
    const { tenantId } = await requireAuth('admissions:read');
    if (!isUuid(leadId)) return null;

    const { rows } = await pool.query(
        `SELECT assigned_to AS "assignedTo" FROM admission_leads WHERE id = $1 AND tenant_id = $2`,
        [leadId, tenantId],
    );
    return rows.length ? (rows[0].assignedTo as string | null) : null;
}

export async function assignLead(
    leadId: string,
    ownerId: string | null,
): Promise<{ success: boolean; error?: string }> {
    const { tenantId } = await requireAuth('admissions:write');

    if (!isUuid(leadId)) return { success: false, error: 'Invalid lead reference.' };
    if (ownerId !== null && !isUuid(ownerId)) {
        return { success: false, error: 'Invalid counsellor reference.' };
    }

    if (ownerId) {
        const { rows: owner } = await pool.query(
            `SELECT id FROM users WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
            [ownerId, tenantId],
        );
        if (!owner.length) return { success: false, error: 'That user is not available in this school.' };
    }

    const { rows } = await pool.query(
        `UPDATE admission_leads
         SET assigned_to = $1, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3
         RETURNING id`,
        [ownerId, leadId, tenantId],
    );
    if (!rows.length) return { success: false, error: 'Lead not found.' };

    revalidatePath(`/admissions/${leadId}`);
    revalidatePath('/admissions');
    return { success: true };
}

// ─── Enrolment ───────────────────────────────────────────────

export interface GradeWithSections {
    id: string;
    name: string;
    sections: { id: string; name: string }[];
}

export async function listGradeSections(): Promise<GradeWithSections[]> {
    const { tenantId } = await requireAuth('admissions:read');

    const { rows } = await pool.query(
        `SELECT g.id AS "gradeId",
                g.name AS "gradeName",
                g.display_order AS "displayOrder",
                s.id AS "sectionId",
                s.name AS "sectionName"
         FROM grades g
         LEFT JOIN sections s ON s.grade_id = g.id AND s.tenant_id = g.tenant_id
         WHERE g.tenant_id = $1
         ORDER BY g.display_order ASC, s.name ASC`,
        [tenantId],
    );

    const grades = new Map<string, GradeWithSections>();
    for (const row of rows as {
        gradeId: string;
        gradeName: string;
        sectionId: string | null;
        sectionName: string | null;
    }[]) {
        let grade = grades.get(row.gradeId);
        if (!grade) {
            grade = { id: row.gradeId, name: row.gradeName, sections: [] };
            grades.set(row.gradeId, grade);
        }
        if (row.sectionId && row.sectionName) {
            grade.sections.push({ id: row.sectionId, name: row.sectionName });
        }
    }
    return [...grades.values()];
}

export async function enrolLead(
    leadId: string,
    gradeId: string,
    sectionId: string,
): Promise<{ success: boolean; error?: string; studentId?: string }> {
    const { tenantId } = await requireAuth('admissions:write');

    if (!isUuid(leadId) || !isUuid(gradeId) || !isUuid(sectionId)) {
        return { success: false, error: 'Invalid grade or section selection.' };
    }

    const { rows: placement } = await pool.query(
        `SELECT s.id
         FROM sections s
         INNER JOIN grades g ON s.grade_id = g.id AND g.tenant_id = s.tenant_id
         WHERE s.id = $1 AND g.id = $2 AND s.tenant_id = $3`,
        [sectionId, gradeId, tenantId],
    );
    if (!placement.length) {
        return { success: false, error: 'That section does not belong to the selected grade.' };
    }

    const result = await convertLeadToStudent(leadId, gradeId, sectionId);
    if (!result.success) {
        return { success: false, error: result.error || 'Enrolment failed.' };
    }

    revalidatePath('/admissions');
    revalidatePath(`/admissions/${leadId}`);
    return { success: true, studentId: result.studentId };
}

// ─── Applications & document checklist ───────────────────────

export interface AdmissionDocumentRow {
    id: string;
    documentType: string;
    fileName: string;
    fileUrl: string;
    verifiedAt: string | null;
    verifiedByName: string | null;
    createdAt: string;
}

export interface DocumentChecklistItem {
    documentType: string;
    required: boolean;
    document: AdmissionDocumentRow | null;
}

export interface LeadDocumentPack {
    leadId: string;
    childName: string;
    applyingForGrade: string;
    stage: string;
    applicationId: string | null;
    applicationNumber: string | null;
    items: DocumentChecklistItem[];
    recordedCount: number;
    verifiedCount: number;
    requiredOutstanding: number;
}

async function findApplication(
    leadId: string,
    tenantId: string,
): Promise<{ id: string; applicationNumber: string } | null> {
    const { rows } = await pool.query(
        `SELECT id, application_number AS "applicationNumber"
         FROM admission_applications
         WHERE lead_id = $1 AND tenant_id = $2
         ORDER BY created_at ASC
         LIMIT 1`,
        [leadId, tenantId],
    );
    return rows.length ? { id: rows[0].id, applicationNumber: rows[0].applicationNumber } : null;
}

/**
 * Opens (or returns) the application record a lead's documents hang off.
 * admission_documents.application_id is NOT NULL, so a lead needs an
 * application row before any document can be filed against it.
 */
async function ensureApplication(
    leadId: string,
    tenantId: string,
): Promise<{ id: string; applicationNumber: string }> {
    const existing = await findApplication(leadId, tenantId);
    if (existing) return existing;

    const id = randomUUID();
    const applicationNumber = `APP-${Date.now().toString(36).toUpperCase()}`;
    await pool.query(
        `INSERT INTO admission_applications (id, tenant_id, lead_id, application_number)
         VALUES ($1, $2, $3, $4)`,
        [id, tenantId, leadId, applicationNumber],
    );
    return { id, applicationNumber };
}

export async function openApplication(
    leadId: string,
): Promise<{ success: boolean; error?: string; applicationNumber?: string }> {
    const { tenantId } = await requireAuth('admissions:write');
    if (!isUuid(leadId)) return { success: false, error: 'Invalid lead reference.' };

    const { rows } = await pool.query(
        `SELECT id FROM admission_leads WHERE id = $1 AND tenant_id = $2`,
        [leadId, tenantId],
    );
    if (!rows.length) return { success: false, error: 'Lead not found.' };

    const application = await ensureApplication(leadId, tenantId);
    revalidatePath(`/admissions/${leadId}/documents`);
    revalidatePath(`/admissions/${leadId}`);
    return { success: true, applicationNumber: application.applicationNumber };
}

export async function getLeadDocumentPack(leadId: string): Promise<LeadDocumentPack | null> {
    const { tenantId } = await requireAuth('admissions:read');
    if (!isUuid(leadId)) return null;

    const { rows: leadRows } = await pool.query(
        `SELECT id,
                child_first_name AS "childFirstName",
                child_last_name AS "childLastName",
                applying_for_grade AS "applyingForGrade",
                stage
         FROM admission_leads
         WHERE id = $1 AND tenant_id = $2`,
        [leadId, tenantId],
    );
    if (!leadRows.length) return null;
    const lead = leadRows[0];

    const application = await findApplication(leadId, tenantId);

    let documents: AdmissionDocumentRow[] = [];
    if (application) {
        const { rows } = await pool.query(
            `SELECT d.id,
                    d.document_type AS "documentType",
                    d.file_name AS "fileName",
                    d.file_url AS "fileUrl",
                    d.is_verified AS "verifiedAt",
                    d.created_at AS "createdAt",
                    u.first_name AS "verifiedByFirstName",
                    u.last_name AS "verifiedByLastName"
             FROM admission_documents d
             LEFT JOIN users u ON d.verified_by = u.id
             WHERE d.application_id = $1 AND d.tenant_id = $2
             ORDER BY d.created_at ASC`,
            [application.id, tenantId],
        );
        documents = (rows as {
            id: string;
            documentType: string;
            fileName: string;
            fileUrl: string;
            verifiedAt: Date | null;
            createdAt: Date;
            verifiedByFirstName: string | null;
            verifiedByLastName: string | null;
        }[]).map((r) => ({
            id: r.id,
            documentType: r.documentType,
            fileName: r.fileName,
            fileUrl: r.fileUrl,
            verifiedAt: r.verifiedAt ? new Date(r.verifiedAt).toISOString() : null,
            verifiedByName: r.verifiedByFirstName
                ? `${r.verifiedByFirstName} ${r.verifiedByLastName ?? ''}`.trim()
                : null,
            createdAt: new Date(r.createdAt).toISOString(),
        }));
    }

    const byType = new Map<string, AdmissionDocumentRow>();
    for (const doc of documents) byType.set(doc.documentType, doc);

    const items: DocumentChecklistItem[] = REQUIRED_DOCUMENT_TYPES.map(
        (documentType) => ({
            documentType,
            required: true,
            document: byType.get(documentType) ?? null,
        }),
    );
    for (const doc of documents) {
        if (!REQUIRED_DOCUMENT_TYPES.includes(doc.documentType)) {
            items.push({ documentType: doc.documentType, required: false, document: doc });
        }
    }

    const requiredOutstanding = items.filter(
        (i) => i.required && (!i.document || !i.document.verifiedAt),
    ).length;

    return {
        leadId: lead.id,
        childName: `${lead.childFirstName} ${lead.childLastName}`.trim(),
        applyingForGrade: lead.applyingForGrade,
        stage: lead.stage,
        applicationId: application?.id ?? null,
        applicationNumber: application?.applicationNumber ?? null,
        items,
        recordedCount: documents.length,
        verifiedCount: documents.filter((d) => d.verifiedAt).length,
        requiredOutstanding,
    };
}

export async function recordAdmissionDocument(
    leadId: string,
    documentType: string,
    fileName: string,
    fileUrl: string,
): Promise<{ success: boolean; error?: string }> {
    const { tenantId } = await requireAuth('admissions:write');

    if (!isUuid(leadId)) return { success: false, error: 'Invalid lead reference.' };

    const type = documentType.trim();
    const name = fileName.trim();
    const url = fileUrl.trim();
    if (!type) return { success: false, error: 'Pick a document type.' };
    if (type.length > 100) return { success: false, error: 'Document type is too long.' };
    if (!name) return { success: false, error: 'Give the document a name.' };
    if (name.length > 255) return { success: false, error: 'Document name is too long.' };
    if (!/^https?:\/\/\S+$/i.test(url)) {
        return { success: false, error: 'Enter a full http(s) link to the stored file.' };
    }

    const { rows: leadRows } = await pool.query(
        `SELECT id FROM admission_leads WHERE id = $1 AND tenant_id = $2`,
        [leadId, tenantId],
    );
    if (!leadRows.length) return { success: false, error: 'Lead not found.' };

    const application = await ensureApplication(leadId, tenantId);

    // One live record per document type — re-recording replaces the link and
    // clears any previous verification, because it is a different file.
    const { rows: existing } = await pool.query(
        `SELECT id FROM admission_documents
         WHERE application_id = $1 AND tenant_id = $2 AND document_type = $3`,
        [application.id, tenantId, type],
    );

    if (existing.length) {
        await pool.query(
            `UPDATE admission_documents
             SET file_name = $1, file_url = $2, is_verified = NULL, verified_by = NULL
             WHERE id = $3 AND tenant_id = $4`,
            [name, url, existing[0].id, tenantId],
        );
    } else {
        await pool.query(
            `INSERT INTO admission_documents (id, tenant_id, application_id, document_type, file_name, file_url)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [randomUUID(), tenantId, application.id, type, name, url],
        );
    }

    revalidatePath(`/admissions/${leadId}/documents`);
    revalidatePath(`/admissions/${leadId}`);
    return { success: true };
}

export async function setAdmissionDocumentVerified(
    leadId: string,
    documentId: string,
    verified: boolean,
): Promise<{ success: boolean; error?: string }> {
    const { tenantId, userId } = await requireAuth('admissions:write');

    if (!isUuid(leadId) || !isUuid(documentId)) {
        return { success: false, error: 'Invalid document reference.' };
    }

    const { rows } = await pool.query(
        `UPDATE admission_documents d
         SET is_verified = $1, verified_by = $2
         FROM admission_applications a
         WHERE d.id = $3
           AND d.tenant_id = $4
           AND d.application_id = a.id
           AND a.lead_id = $5
         RETURNING d.id`,
        [verified ? new Date() : null, verified ? userId : null, documentId, tenantId, leadId],
    );
    if (!rows.length) return { success: false, error: 'Document not found.' };

    revalidatePath(`/admissions/${leadId}/documents`);
    revalidatePath(`/admissions/${leadId}`);
    return { success: true };
}

export async function removeAdmissionDocument(
    leadId: string,
    documentId: string,
): Promise<{ success: boolean; error?: string }> {
    const { tenantId } = await requireAuth('admissions:write');

    if (!isUuid(leadId) || !isUuid(documentId)) {
        return { success: false, error: 'Invalid document reference.' };
    }

    const { rows } = await pool.query(
        `DELETE FROM admission_documents d
         USING admission_applications a
         WHERE d.id = $1
           AND d.tenant_id = $2
           AND d.application_id = a.id
           AND a.lead_id = $3
         RETURNING d.id`,
        [documentId, tenantId, leadId],
    );
    if (!rows.length) return { success: false, error: 'Document not found.' };

    revalidatePath(`/admissions/${leadId}/documents`);
    revalidatePath(`/admissions/${leadId}`);
    return { success: true };
}
