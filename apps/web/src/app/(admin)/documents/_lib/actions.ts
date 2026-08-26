'use server';

import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

/** Flat result shape — Next.js erases union narrowing across the 'use server' boundary. */
export interface DocumentActionResult {
    success: boolean;
    error?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): boolean {
    return typeof value === 'string' && UUID_RE.test(value);
}

export interface StudentDocumentItem {
    id: string;
    studentId: string;
    studentName: string | null;
    admissionNumber: string | null;
    gradeName: string | null;
    sectionName: string | null;
    documentType: string;
    fileName: string;
    fileUrl: string | null;
    fileSize: number | null;
    mimeType: string | null;
    isVerified: boolean;
    verifiedByName: string | null;
    verifiedAt: Date | null;
    uploadedByName: string | null;
    notes: string | null;
    createdAt: Date;
}

export interface DocumentFilters {
    verification?: string;
    documentType?: string;
    search?: string;
}

export async function listStudentDocuments(
    filters: DocumentFilters = {}
): Promise<StudentDocumentItem[]> {
    const { tenantId } = await requireAuth('documents:read');

    const params: string[] = [tenantId];
    let where = 'WHERE sd.tenant_id = $1';

    if (filters.verification === 'VERIFIED') where += ' AND sd.is_verified';
    if (filters.verification === 'PENDING') where += ' AND NOT sd.is_verified';

    if (filters.documentType && filters.documentType !== 'ALL') {
        params.push(filters.documentType);
        where += ` AND sd.document_type = $${params.length}`;
    }

    if (filters.search?.trim()) {
        params.push(`%${filters.search.trim()}%`);
        where += ` AND (sd.file_name ILIKE $${params.length}
                     OR s.admission_number ILIKE $${params.length}
                     OR (s.first_name || ' ' || s.last_name) ILIKE $${params.length})`;
    }

    const { rows } = await pool.query(
        `SELECT
             sd.id,
             sd.student_id AS "studentId",
             (s.first_name || ' ' || s.last_name) AS "studentName",
             s.admission_number AS "admissionNumber",
             g.name AS "gradeName",
             sec.name AS "sectionName",
             sd.document_type AS "documentType",
             sd.file_name AS "fileName",
             sd.file_url AS "fileUrl",
             sd.file_size AS "fileSize",
             sd.mime_type AS "mimeType",
             sd.is_verified AS "isVerified",
             NULLIF(TRIM(COALESCE(v.first_name, '') || ' ' || COALESCE(v.last_name, '')), '') AS "verifiedByName",
             sd.verified_at AS "verifiedAt",
             NULLIF(TRIM(COALESCE(up.first_name, '') || ' ' || COALESCE(up.last_name, '')), '') AS "uploadedByName",
             sd.notes,
             sd.created_at AS "createdAt"
         FROM student_documents sd
         LEFT JOIN students s ON s.id = sd.student_id AND s.tenant_id = sd.tenant_id
         LEFT JOIN grades g ON g.id = s.grade_id AND g.tenant_id = sd.tenant_id
         LEFT JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = sd.tenant_id
         LEFT JOIN users v ON v.id = sd.verified_by AND v.tenant_id = sd.tenant_id
         LEFT JOIN users up ON up.id = sd.uploaded_by AND up.tenant_id = sd.tenant_id
         ${where}
         ORDER BY sd.created_at DESC
         LIMIT 500`,
        params
    );

    return rows as StudentDocumentItem[];
}

export interface DocumentStats {
    total: number;
    verified: number;
    pending: number;
    studentsCovered: number;
    activeStudents: number;
}

export async function getDocumentStats(): Promise<DocumentStats> {
    const { tenantId } = await requireAuth('documents:read');

    const { rows } = await pool.query(
        `SELECT
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE is_verified)::int AS verified,
             COUNT(*) FILTER (WHERE NOT is_verified)::int AS pending,
             COUNT(DISTINCT student_id)::int AS "studentsCovered"
         FROM student_documents
         WHERE tenant_id = $1`,
        [tenantId]
    );

    const active = await pool.query(
        `SELECT COUNT(*)::int AS c FROM students WHERE tenant_id = $1 AND status = 'ACTIVE'`,
        [tenantId]
    );

    return {
        ...(rows[0] as Omit<DocumentStats, 'activeStudents'>),
        activeStudents: active.rows[0].c as number,
    };
}

/** Types already present in this tenant's data, for the filter dropdown. */
export async function listDocumentTypesInUse(): Promise<string[]> {
    const { tenantId } = await requireAuth('documents:read');

    const { rows } = await pool.query(
        `SELECT DISTINCT document_type AS t
         FROM student_documents
         WHERE tenant_id = $1
         ORDER BY 1`,
        [tenantId]
    );

    return (rows as Array<{ t: string }>).map(row => row.t);
}

export interface DocumentStudentOption {
    id: string;
    firstName: string;
    lastName: string;
    admissionNumber: string;
    gradeName: string | null;
    sectionName: string | null;
}

export async function listStudentsForDocuments(): Promise<DocumentStudentOption[]> {
    const { tenantId } = await requireAuth('documents:read');

    const { rows } = await pool.query(
        `SELECT
             s.id,
             s.first_name AS "firstName",
             s.last_name AS "lastName",
             s.admission_number AS "admissionNumber",
             g.name AS "gradeName",
             sec.name AS "sectionName"
         FROM students s
         LEFT JOIN grades g ON g.id = s.grade_id AND g.tenant_id = s.tenant_id
         LEFT JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = s.tenant_id
         WHERE s.tenant_id = $1 AND s.status = 'ACTIVE'
         ORDER BY g.display_order NULLS LAST, sec.name, s.roll_number NULLS LAST, s.first_name`,
        [tenantId]
    );

    return rows as DocumentStudentOption[];
}

// ─── Verification ────────────────────────────────────────────

export async function setDocumentVerifiedAction(input: {
    documentId: string;
    verified: boolean;
}): Promise<DocumentActionResult> {
    const { tenantId, userId } = await requireAuth('documents:write');

    if (!isUuid(input.documentId)) return { success: false, error: 'Invalid document.' };

    const sql = input.verified
        ? `UPDATE student_documents
              SET is_verified = true, verified_by = $1, verified_at = NOW()
            WHERE id = $2 AND tenant_id = $3`
        : `UPDATE student_documents
              SET is_verified = false, verified_by = NULL, verified_at = NULL
            WHERE id = $2 AND tenant_id = $3`;

    const { rowCount } = await pool.query(sql, [userId, input.documentId, tenantId]);
    if (!rowCount) return { success: false, error: 'That document no longer exists.' };

    revalidatePath('/documents');
    return { success: true };
}

// ─── Registration of an uploaded file ────────────────────────

/**
 * Records a file that has already been stored by POST /api/upload, which is the
 * only component holding storage credentials. `fileUrl` is required to be the
 * tenant-scoped path that endpoint returns — this action never accepts an
 * arbitrary outside URL.
 */
export async function recordStudentDocumentAction(input: {
    studentId: string;
    documentType: string;
    fileName: string;
    fileUrl: string;
    fileSize?: number;
    mimeType?: string;
    notes?: string;
}): Promise<DocumentActionResult> {
    const { tenantId, userId } = await requireAuth('documents:write');

    if (!isUuid(input.studentId)) return { success: false, error: 'Pick a student.' };

    const documentType = input.documentType?.trim();
    if (!documentType) return { success: false, error: 'Pick or name a document type.' };
    if (documentType.length > 100) return { success: false, error: 'Document type must be 100 characters or fewer.' };

    const fileName = input.fileName?.trim();
    if (!fileName) return { success: false, error: 'The file has no name.' };
    if (fileName.length > 500) return { success: false, error: 'File name is too long.' };

    let storagePath: string;
    try {
        // Accepts both the absolute URL the upload route returns and a bare path.
        const parsed = new URL(input.fileUrl, 'http://internal.invalid');
        storagePath = parsed.pathname;
    } catch {
        return { success: false, error: 'The upload did not return a usable file location.' };
    }
    if (!storagePath.startsWith(`/api/files/${tenantId}/`)) {
        return { success: false, error: 'The upload did not return a file belonging to this school.' };
    }

    const notes = input.notes?.trim() || null;
    if (notes && notes.length > 2000) return { success: false, error: 'Notes must be 2000 characters or fewer.' };

    const student = await pool.query(
        `SELECT 1 FROM students WHERE id = $1 AND tenant_id = $2`,
        [input.studentId, tenantId]
    );
    if (student.rowCount === 0) return { success: false, error: 'That student no longer exists.' };

    try {
        await pool.query(
            `INSERT INTO student_documents (
                 tenant_id, student_id, document_type, file_name, file_url,
                 file_size, mime_type, uploaded_by, notes
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
                tenantId,
                input.studentId,
                documentType,
                fileName,
                storagePath,
                Number.isFinite(input.fileSize) ? Math.trunc(input.fileSize as number) : null,
                input.mimeType?.slice(0, 100) ?? null,
                userId,
                notes,
            ]
        );
    } catch {
        return { success: false, error: 'Could not save the document record.' };
    }

    revalidatePath('/documents');
    return { success: true };
}
