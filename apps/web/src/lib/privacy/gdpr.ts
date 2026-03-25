/**
 * GDPR Compliance Module
 *
 * Extends DPDPA module for EU data protection requirements.
 * Required for international schools with EU students/staff.
 *
 * Key differences from DPDPA:
 * - Lawful basis tracking (consent, legitimate interest, contract)
 * - Data processing records (Article 30)
 * - DPO contact information
 * - Cross-border transfer controls
 */

import { db, setTenantContext } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { encryptPII, decryptPII, anonymizeStudent, exportStudentData } from './dpdpa';

// Re-export DPDPA functions that satisfy GDPR equivalents
export { encryptPII, decryptPII, anonymizeStudent, exportStudentData };

export type LawfulBasis = 'consent' | 'contract' | 'legal_obligation' | 'vital_interests' | 'public_task' | 'legitimate_interest';

/**
 * Record the lawful basis for processing personal data.
 * GDPR Article 6 requires documenting why you're processing data.
 */
export async function recordLawfulBasis(
    tenantId: string,
    userId: string,
    processingPurpose: string,
    basis: LawfulBasis,
): Promise<void> {
    await setTenantContext(tenantId);

    await db.execute(sql`
        INSERT INTO gdpr_processing_records (
            tenant_id, user_id, processing_purpose, lawful_basis, recorded_at
        ) VALUES (
            ${tenantId}, ${userId}, ${processingPurpose}, ${basis}, NOW()
        )
        ON CONFLICT (tenant_id, user_id, processing_purpose)
        DO UPDATE SET lawful_basis = ${basis}, recorded_at = NOW()
    `);
}

/**
 * Generate Article 30 Data Processing Records.
 * Required for organizations with more than 250 employees,
 * or whenever processing involves special category data.
 */
export async function getProcessingRecords(tenantId: string): Promise<{
    controller: string;
    records: any[];
    generatedAt: string;
}> {
    await setTenantContext(tenantId);

    const [tenant] = await db.execute(sql`
        SELECT name, email, address FROM tenants WHERE id = ${tenantId}
    `) as any[];

    const records = await db.execute(sql`
        SELECT processing_purpose, lawful_basis, COUNT(DISTINCT user_id) AS data_subjects,
               MIN(recorded_at) AS first_recorded
        FROM gdpr_processing_records
        WHERE tenant_id = ${tenantId}
        GROUP BY processing_purpose, lawful_basis
        ORDER BY processing_purpose
    `);

    return {
        controller: tenant?.name || 'Unknown',
        records: records as any[],
        generatedAt: new Date().toISOString(),
    };
}

/**
 * Right to Object (GDPR Article 21).
 * Records a user's objection to processing.
 */
export async function recordObjection(
    tenantId: string,
    userId: string,
    processingPurpose: string,
    reason: string,
): Promise<void> {
    await setTenantContext(tenantId);

    await db.execute(sql`
        INSERT INTO gdpr_objections (
            tenant_id, user_id, processing_purpose, reason, objected_at
        ) VALUES (
            ${tenantId}, ${userId}, ${processingPurpose}, ${reason}, NOW()
        )
    `);
}

/**
 * Data breach notification log.
 * GDPR requires notification to supervisory authority within 72 hours.
 */
export async function logDataBreach(
    tenantId: string,
    description: string,
    affectedCount: number,
    discoveredAt: Date,
    reportedBy: string,
): Promise<{ breachId: string; deadlineHours: number }> {
    await setTenantContext(tenantId);

    const result = await db.execute(sql`
        INSERT INTO data_breach_log (
            tenant_id, description, affected_data_subjects, discovered_at,
            reported_by, notification_deadline, created_at
        ) VALUES (
            ${tenantId}, ${description}, ${affectedCount}, ${discoveredAt.toISOString()},
            ${reportedBy}, ${new Date(discoveredAt.getTime() + 72 * 60 * 60 * 1000).toISOString()}, NOW()
        )
        RETURNING id
    `);

    return {
        breachId: (result as any[])[0]?.id,
        deadlineHours: 72,
    };
}
