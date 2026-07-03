/**
 * DPDPA (Digital Personal Data Protection Act, 2023) Compliance Module
 *
 * India's data protection law requires:
 * 1. Consent verification before processing personal data
 * 2. Right to Erasure (anonymization/deletion)
 * 3. Right to Portability (data export)
 * 4. PII encryption at rest
 * 5. Breach notification within 72 hours
 *
 * This module provides the core primitives for compliance.
 */

import crypto from 'crypto';
import { db, } from '@/lib/db';
import { students, guardians, users, healthRecords } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';

// ═══════════════════════════════════════════════════════════
// PII Encryption (AES-256-GCM)
// ═══════════════════════════════════════════════════════════

function getEncryptionKey(): Buffer {
    const secret = process.env.PII_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
    if (!secret || secret.length < 32) {
        throw new Error(
            'PII_ENCRYPTION_KEY environment variable is required (min 32 chars). ' +
            'ENCRYPTION_KEY is supported only as a legacy fallback.'
        );
    }
    if (process.env.NODE_ENV === 'production') {
        const lowered = secret.toLowerCase();
        if (
            lowered.includes('mock') ||
            lowered.includes('dummy') ||
            lowered.includes('changeme') ||
            lowered.includes('build-time') ||
            lowered === 'dev-secret'
        ) {
            throw new Error('PII_ENCRYPTION_KEY must not use a placeholder value in production.');
        }
    }
    return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt a PII field value using AES-256-GCM.
 * Returns a string in the format: iv:authTag:ciphertext (all hex-encoded)
 */
export function encryptPII(plaintext: string): string {
    if (!plaintext) return plaintext;

    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12); // 96-bit IV for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a PII field value encrypted with encryptPII().
 */
export function decryptPII(encryptedValue: string): string {
    if (!encryptedValue || !encryptedValue.includes(':')) return encryptedValue;

    const key = getEncryptionKey();
    const [ivHex, authTagHex, ciphertext] = encryptedValue.split(':');

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

// ═══════════════════════════════════════════════════════════
// Right to Erasure (DPDPA Section 12(1))
// ═══════════════════════════════════════════════════════════

export interface ErasureResult {
    tablesAnonymized: string[];
    recordsAffected: number;
    completedAt: Date;
}

/**
 * Anonymize a student's personal data.
 * Does NOT delete — replaces PII with anonymized values for audit trail integrity.
 * Financial records are retained for regulatory compliance (up to 8 years).
 */
export async function anonymizeStudent(
    tenantId: string,
    studentId: string,
): Promise<ErasureResult> {
    await (tenantId);

    const anonymizedName = `REDACTED_${studentId.slice(-8)}`;
    const tablesAnonymized: string[] = [];
    let recordsAffected = 0;

    // Anonymize student record
    const studentResult = await db.update(students)
        .set({
            firstName: anonymizedName,
            lastName: 'REDACTED',
            aadhaarNumber: null,
            apaarId: null,
            address: null,
            city: null,
            state: null,
            pincode: null,
            photoUrl: null,
            medicalNotes: null,
            religion: null,
            status: 'INACTIVE',
        })
        .where(and(
            eq(students.id, studentId),
            eq(students.tenantId, tenantId)
        ));
    tablesAnonymized.push('students');
    recordsAffected += 1;

    // Anonymize guardian records
    await db.update(guardians)
        .set({
            firstName: anonymizedName,
            lastName: 'REDACTED',
            email: null,
            phone: null,
            alternatePhone: null,
            occupation: null,
            annualIncome: null,
            address: null,
        })
        .where(and(
            eq(guardians.studentId, studentId),
            eq(guardians.tenantId, tenantId)
        ));
    tablesAnonymized.push('guardians');
    recordsAffected += 1;

    // Anonymize health records
    await db.execute(sql`
        UPDATE health_records
        SET notes = 'REDACTED', allergies = NULL, medications = NULL
        WHERE student_id = ${studentId} AND tenant_id = ${tenantId}
    `);
    tablesAnonymized.push('health_records');

    return {
        tablesAnonymized,
        recordsAffected,
        completedAt: new Date(),
    };
}

// ═══════════════════════════════════════════════════════════
// Right to Portability (DPDPA Section 12(2))
// ═══════════════════════════════════════════════════════════

export interface PortabilityExport {
    student: Record<string, any>;
    guardians: Record<string, any>[];
    attendance: Record<string, any>[];
    fees: Record<string, any>[];
    exams: Record<string, any>[];
    exportedAt: string;
    format: string;
}

/**
 * Export all personal data for a student in a portable format.
 * Returns structured JSON that can be provided to the data principal.
 */
export async function exportStudentData(
    tenantId: string,
    studentId: string,
): Promise<PortabilityExport> {
    await (tenantId);

    // Fetch all student data across tables
    const [studentData] = await db.select()
        .from(students)
        .where(and(eq(students.id, studentId), eq(students.tenantId, tenantId)))
        .limit(1);

    const guardianData = await db.select()
        .from(guardians)
        .where(and(eq(guardians.studentId, studentId), eq(guardians.tenantId, tenantId)));

    const attendanceData = await db.execute(sql`
        SELECT date, status, remarks FROM attendance_records
        WHERE student_id = ${studentId} AND tenant_id = ${tenantId}
        ORDER BY date DESC
    `);

    const feeData = await db.execute(sql`
        SELECT i.invoice_number, i.total_amount, i.paid_amount, i.due_date, i.status,
               p.amount as payment_amount, p.method, p.paid_at
        FROM invoices i
        LEFT JOIN payments p ON p.invoice_id = i.id
        WHERE i.student_id = ${studentId} AND i.tenant_id = ${tenantId}
        ORDER BY i.due_date DESC
    `);

    const examData = await db.execute(sql`
        SELECT e.name as exam_name, sub.name as subject, er.marks_obtained, es.max_marks as total_marks, er.grade
        FROM student_results er
        JOIN exam_schedules es ON es.id = er.exam_schedule_id
        JOIN subjects sub ON sub.id = es.subject_id
        JOIN exams e ON e.id = es.exam_id
        WHERE er.student_id = ${studentId}
        ORDER BY e.created_at DESC
    `);

    return {
        student: studentData || {},
        guardians: guardianData,
        attendance: attendanceData as any[],
        fees: feeData as any[],
        exams: examData as any[],
        exportedAt: new Date().toISOString(),
        format: 'JSON (DPDPA Section 12(2) compliant)',
    };
}

// ═══════════════════════════════════════════════════════════
// Consent Verification
// ═══════════════════════════════════════════════════════════

/**
 * Verify that a user has given consent for data processing.
 * DPDPA requires explicit consent before processing personal data.
 */
export async function verifyConsent(
    tenantId: string,
    userId: string,
    purpose: string,
): Promise<boolean> {
    await (tenantId);

    const result = await db.execute(sql`
        SELECT id FROM consent_records
        WHERE tenant_id = ${tenantId}
        AND user_id = ${userId}
        AND purpose = ${purpose}
        AND is_active = true
        AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1
    `);

    return (result as any[]).length > 0;
}

/**
 * Record explicit consent from a user.
 */
export async function recordConsent(
    tenantId: string,
    userId: string,
    purpose: string,
    ipAddress: string,
): Promise<void> {
    await (tenantId);

    await db.execute(sql`
        INSERT INTO consent_records (tenant_id, user_id, purpose, is_active, consented_at, ip_address, created_at)
        VALUES (${tenantId}, ${userId}, ${purpose}, true, NOW(), ${ipAddress}, NOW())
        ON CONFLICT (tenant_id, user_id, purpose)
        DO UPDATE SET is_active = true, consented_at = NOW(), ip_address = ${ipAddress}
    `);
}
