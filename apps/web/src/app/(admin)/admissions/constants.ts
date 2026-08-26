/**
 * Shared admissions constants. Kept out of `actions.ts` because a 'use server'
 * module may only export async functions.
 */

/** Mirrors the `pipeline_stage` enum in drizzle/0000_init_baseline.sql. */
export const PIPELINE_STAGES = [
    'NEW',
    'CONTACTED',
    'FORM_SUBMITTED',
    'DOCUMENTS_PENDING',
    'INTERVIEW_SCHEDULED',
    'INTERVIEW_DONE',
    'OFFERED',
    'ACCEPTED',
    'ENROLLED',
    'REJECTED',
    'WITHDRAWN',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/** Stages that sit on the forward path, in order. */
export const ACTIVE_PIPELINE_STAGES: readonly PipelineStage[] = [
    'NEW',
    'CONTACTED',
    'FORM_SUBMITTED',
    'DOCUMENTS_PENDING',
    'INTERVIEW_SCHEDULED',
    'INTERVIEW_DONE',
    'OFFERED',
    'ACCEPTED',
    'ENROLLED',
];

/** Terminal stages a lead leaves the pipeline through. */
export const CLOSED_PIPELINE_STAGES: readonly PipelineStage[] = ['REJECTED', 'WITHDRAWN'];

export const STAGE_LABELS: Record<string, string> = {
    NEW: 'New',
    CONTACTED: 'Contacted',
    FORM_SUBMITTED: 'Form Submitted',
    DOCUMENTS_PENDING: 'Docs Pending',
    INTERVIEW_SCHEDULED: 'Interview Scheduled',
    INTERVIEW_DONE: 'Interview Done',
    OFFERED: 'Offered',
    ACCEPTED: 'Accepted',
    ENROLLED: 'Enrolled',
    REJECTED: 'Rejected',
    WITHDRAWN: 'Withdrawn',
};

/**
 * Stages `triggerStageNotification` in @/lib/actions/admissions has a parent
 * email template for. Anything else has nothing to send.
 */
export const NOTIFIABLE_STAGES: readonly string[] = [
    'CONTACTED',
    'FORM_SUBMITTED',
    'INTERVIEW_SCHEDULED',
    'OFFERED',
    'REJECTED',
];

/**
 * Document types the admissions office collects. Kept in step with
 * REQUIRED_DOCUMENTS in @/lib/actions/admissions.
 */
export const REQUIRED_DOCUMENT_TYPES: readonly string[] = [
    'Birth Certificate',
    'Previous School TC',
    'Report Card (Last Year)',
    'Medical Certificate',
    'Passport Size Photos',
    'Address Proof',
    'Parent ID Proof',
];
