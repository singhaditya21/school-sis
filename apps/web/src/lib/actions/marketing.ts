'use server';

import { createHmac } from 'node:crypto';
import { pool, runWithRlsBypass, RLS_BYPASS_JUSTIFICATIONS } from '@/lib/db';
import { encryptEmail } from '@/lib/encryption';
import type { LeadIntake } from '@/lib/marketing/lead-intake';
import { logger } from '@/lib/observability/logger';

type LeadRequestContext = {
    clientIp: string;
    referrer: string | null;
    userAgent: string | null;
};

function hashClientIp(clientIp: string): string {
    const key = process.env.LEAD_CAPTURE_HASH_KEY || process.env.SESSION_SECRET;
    if (!key || key.length < 32) {
        throw new Error('Lead-capture hashing requires LEAD_CAPTURE_HASH_KEY or SESSION_SECRET.');
    }
    return createHmac('sha256', key).update(clientIp).digest('hex');
}

export async function captureLeadAction(input: LeadIntake, context: LeadRequestContext) {
    try {
        const result = await runWithRlsBypass(RLS_BYPASS_JUSTIFICATIONS.PUBLIC_LEAD_CAPTURE, async () => {
            return pool.query<{ leadId: string; jobId: string }>(
                `WITH inserted AS (
                    INSERT INTO marketing_leads (
                        contact_name, contact_email, contact_email_enc, school_name,
                        student_capacity, pain_points, status, consented_at,
                        consent_version, consent_ip_hash, source_url, referrer,
                        user_agent, utm_source, utm_medium, utm_campaign, crm_status
                    ) VALUES ($1, NULL, $2, $3, $4, $5, 'NEW', NOW(), $6, $7, $8, $9, $10, $11, $12, $13, 'QUEUED')
                    RETURNING id
                ), queued AS (
                    INSERT INTO background_jobs (
                        tenant_id, scope, queue, task_name, status, priority, payload,
                        idempotency_key, max_attempts
                    )
                    SELECT NULL, 'PLATFORM', 'integrations', 'route-marketing-lead',
                           'QUEUED', 10, jsonb_build_object('scope', 'platform', 'leadId', id),
                           'marketing-lead:' || id::text || ':crm:v1', 5
                    FROM inserted
                    RETURNING id
                )
                SELECT inserted.id AS "leadId", queued.id AS "jobId"
                FROM inserted CROSS JOIN queued`,
                [
                    input.contactName,
                    encryptEmail(input.contactEmail),
                    input.schoolName,
                    input.studentCapacity,
                    input.painPoints,
                    input.consentVersion,
                    hashClientIp(context.clientIp),
                    input.sourceUrl,
                    context.referrer?.slice(0, 2_000) || null,
                    context.userAgent?.slice(0, 1_000) || null,
                    input.utmSource,
                    input.utmMedium,
                    input.utmCampaign,
                ],
            );
        });

        const lead = result.rows[0];
        if (!lead) throw new Error('Lead transaction returned no record.');
        logger.info('lead_capture.accepted', 'Lead captured and queued for CRM routing', {
            source: 'lead-capture',
            entityType: 'marketing_lead',
            entityId: lead.leadId,
            metadata: { jobId: lead.jobId, consentVersion: input.consentVersion },
        });
        return { success: true, leadId: lead.leadId };
    } catch (error) {
        logger.error('lead_capture.persistence_failed', 'Lead capture persistence failed', {
            source: 'lead-capture',
            metadata: { error: error instanceof Error ? error.message : String(error) },
        });
        return { error: 'Failed to submit application. Please try again or email sales directly.' };
    }
}
