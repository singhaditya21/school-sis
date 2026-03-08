/**
 * Tests for validation schemas used across admissions and exams.
 * 
 * Validates Zod schemas for lead creation, stage updates, and exam creation
 * without requiring a database connection.
 */

import {
    createLeadSchema,
    updateLeadStageSchema,
    createExamSchema,
    saveMarksSchema,
    uuidSchema,
    dateSchema,
    phoneSchema,
    emailSchema,
} from '@/lib/validations';

// ─── Common Schemas ──────────────────────────────────────────

describe('Common validation schemas', () => {
    it('validates UUID format', () => {
        expect(uuidSchema.safeParse('550e8400-e29b-41d4-a716-446655440000').success).toBe(true);
        expect(uuidSchema.safeParse('not-a-uuid').success).toBe(false);
        expect(uuidSchema.safeParse('').success).toBe(false);
    });

    it('validates date format (YYYY-MM-DD)', () => {
        expect(dateSchema.safeParse('2026-03-08').success).toBe(true);
        expect(dateSchema.safeParse('08/03/2026').success).toBe(false);
        expect(dateSchema.safeParse('2026-3-8').success).toBe(false);
    });

    it('validates phone numbers', () => {
        expect(phoneSchema.safeParse('9876543210').success).toBe(true);
        expect(phoneSchema.safeParse('+919876543210').success).toBe(true);
        expect(phoneSchema.safeParse('123').success).toBe(false);
    });

    it('validates email addresses', () => {
        expect(emailSchema.safeParse('test@example.com').success).toBe(true);
        expect(emailSchema.safeParse('invalid-email').success).toBe(false);
    });
});

// ─── createLeadSchema ────────────────────────────────────────

describe('createLeadSchema', () => {
    const validLead = {
        childFirstName: 'Aanya',
        childLastName: 'Singh',
        applyingForGrade: 'Grade 1',
        parentName: 'Rahul Singh',
        parentEmail: 'rahul@example.com',
        parentPhone: '9876543210',
    };

    it('accepts valid lead data', () => {
        expect(createLeadSchema.safeParse(validLead).success).toBe(true);
    });

    it('rejects missing required fields', () => {
        const { childFirstName, ...incomplete } = validLead;
        expect(createLeadSchema.safeParse(incomplete).success).toBe(false);
    });

    it('rejects invalid email', () => {
        expect(createLeadSchema.safeParse({ ...validLead, parentEmail: 'bad' }).success).toBe(false);
    });

    it('rejects short phone', () => {
        expect(createLeadSchema.safeParse({ ...validLead, parentPhone: '123' }).success).toBe(false);
    });

    it('accepts all valid sources', () => {
        const sources = ['WEBSITE', 'REFERRAL', 'WALK_IN', 'ADVERTISEMENT', 'SOCIAL_MEDIA', 'OTHER'];
        for (const source of sources) {
            expect(createLeadSchema.safeParse({ ...validLead, source }).success).toBe(true);
        }
    });

    it('defaults source to WEBSITE', () => {
        const result = createLeadSchema.safeParse(validLead);
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.source).toBe('WEBSITE');
    });
});

// ─── updateLeadStageSchema ───────────────────────────────────

describe('updateLeadStageSchema', () => {
    it('accepts valid stage transitions', () => {
        const stages = ['NEW', 'CONTACTED', 'FORM_SUBMITTED', 'ENROLLED', 'REJECTED', 'WITHDRAWN'];
        for (const stage of stages) {
            expect(updateLeadStageSchema.safeParse({
                leadId: '550e8400-e29b-41d4-a716-446655440000',
                stage,
            }).success).toBe(true);
        }
    });

    it('rejects invalid stage', () => {
        expect(updateLeadStageSchema.safeParse({
            leadId: '550e8400-e29b-41d4-a716-446655440000',
            stage: 'INVALID_STAGE',
        }).success).toBe(false);
    });
});

// ─── createExamSchema ────────────────────────────────────────

describe('createExamSchema', () => {
    const validExam = {
        name: 'Mid-Term 2026',
        type: 'MID_TERM',
        academicYearId: '550e8400-e29b-41d4-a716-446655440000',
        startDate: '2026-03-15',
        endDate: '2026-03-25',
    };

    it('accepts valid exam data', () => {
        expect(createExamSchema.safeParse(validExam).success).toBe(true);
    });

    it('rejects invalid exam type', () => {
        expect(createExamSchema.safeParse({ ...validExam, type: 'HOMEWORK' }).success).toBe(false);
    });

    it('rejects missing name', () => {
        const { name, ...noName } = validExam;
        expect(createExamSchema.safeParse(noName).success).toBe(false);
    });
});

// ─── saveMarksSchema ─────────────────────────────────────────

describe('saveMarksSchema', () => {
    it('accepts valid marks data', () => {
        const result = saveMarksSchema.safeParse({
            examScheduleId: '550e8400-e29b-41d4-a716-446655440000',
            marks: [
                { studentId: '660e8400-e29b-41d4-a716-446655440000', marksObtained: 85, isAbsent: false },
                { studentId: '770e8400-e29b-41d4-a716-446655440000', marksObtained: null, isAbsent: true },
            ],
        });
        expect(result.success).toBe(true);
    });

    it('rejects negative marks', () => {
        const result = saveMarksSchema.safeParse({
            examScheduleId: '550e8400-e29b-41d4-a716-446655440000',
            marks: [
                { studentId: '660e8400-e29b-41d4-a716-446655440000', marksObtained: -5, isAbsent: false },
            ],
        });
        expect(result.success).toBe(false);
    });

    it('accepts null marks with isAbsent true', () => {
        const result = saveMarksSchema.safeParse({
            examScheduleId: '550e8400-e29b-41d4-a716-446655440000',
            marks: [
                { studentId: '660e8400-e29b-41d4-a716-446655440000', marksObtained: null, isAbsent: true, remarks: 'Medical leave' },
            ],
        });
        expect(result.success).toBe(true);
    });
});
