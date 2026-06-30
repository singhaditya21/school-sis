/**
 * Zod Validation Helpers — Reusable schemas for server action inputs.
 */

import { z } from 'zod';

// ─── Common Schemas ──────────────────────────────────────────

export const uuidSchema = z.string().uuid('Invalid UUID');
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
export const phoneSchema = z.string().min(10, 'Phone must be at least 10 digits');
export const emailSchema = z.string().email('Invalid email address');

// ─── Fee Schemas ─────────────────────────────────────────────

export const recordPaymentSchema = z.object({
    invoiceId: uuidSchema,
    amount: z.number().positive('Amount must be positive'),
    paymentMethod: z.enum(['CASH', 'CHEQUE', 'ONLINE', 'BANK_TRANSFER', 'UPI', 'CARD']),
    transactionId: z.string().optional(),
    remarks: z.string().max(500).optional(),
});

export const generateInvoiceSchema = z.object({
    feePlanId: uuidSchema,
    gradeId: uuidSchema.optional(),
    dueDate: dateSchema,
    description: z.string().max(500).optional(),
});

// ─── Admission Schemas ───────────────────────────────────────

export const createLeadSchema = z.object({
    childFirstName: z.string().min(1, 'First name is required').max(100),
    childLastName: z.string().min(1, 'Last name is required').max(100),
    childDob: dateSchema.optional(),
    applyingForGrade: z.string().min(1, 'Grade is required').max(50),
    parentName: z.string().min(1, 'Parent name is required').max(200),
    parentEmail: emailSchema,
    parentPhone: phoneSchema,
    source: z.enum(['WEBSITE', 'REFERRAL', 'WALK_IN', 'ADVERTISEMENT', 'SOCIAL_MEDIA', 'OTHER']).default('WEBSITE'),
    notes: z.string().max(2000).optional(),
    previousSchool: z.string().max(255).optional(),
});

export const updateLeadStageSchema = z.object({
    leadId: uuidSchema,
    stage: z.enum([
        'NEW', 'CONTACTED', 'FORM_SUBMITTED', 'DOCUMENTS_PENDING',
        'INTERVIEW_SCHEDULED', 'INTERVIEW_DONE', 'OFFERED',
        'ACCEPTED', 'ENROLLED', 'REJECTED', 'WITHDRAWN',
    ]),
});

// ─── Exam Schemas ────────────────────────────────────────────

export const createExamSchema = z.object({
    name: z.string().min(1, 'Exam name is required').max(255),
    type: z.enum(['UNIT_TEST', 'MID_TERM', 'FINAL', 'PRACTICE', 'BOARD_PREP']),
    academicYearId: uuidSchema,
    startDate: dateSchema,
    endDate: dateSchema,
    description: z.string().max(1000).optional(),
});

export const saveMarksSchema = z.object({
    examScheduleId: uuidSchema,
    marks: z.array(z.object({
        studentId: uuidSchema,
        marksObtained: z.number().min(0).nullable(),
        isAbsent: z.boolean(),
        remarks: z.string().max(500).optional(),
    })),
});

// ─── Helper: Validate FormData ───────────────────────────────

export function validateFormData<T>(
    schema: z.ZodSchema<T>,
    formData: FormData,
): { success: true; data: T } | { success: false; error: string } {
    const raw: Record<string, unknown> = {};
    formData.forEach((value, key) => {
        raw[key] = value;
    });

    const result = schema.safeParse(raw);
    if (!result.success) {
        const firstError = result.error.errors[0];
        return { success: false, error: `${firstError.path.join('.')}: ${firstError.message}` };
    }

    return { success: true, data: result.data };
}

// ─── Helper: Safe Server Action ──────────────────────────────

export type ActionResult<T = void> =
    | { success: true; data: T }
    | { success: false; error: string };

export async function safeAction<T>(
    fn: () => Promise<T>,
): Promise<ActionResult<T>> {
    try {
        const data = await fn();
        return { success: true, data };
    } catch (err: any) {
        console.error('[Action Error]', err);
        return { success: false, error: err.message || 'An unexpected error occurred' };
    }
}
