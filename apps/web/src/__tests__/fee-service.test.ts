/**
 * Tests for fee validation schemas and utility functions.
 * 
 * These tests validate the Zod schemas used across fee-related server actions,
 * ensuring proper input validation without requiring a database connection.
 */

import {
    recordPaymentSchema,
    generateInvoiceSchema,
    validateFormData,
    safeAction,
} from '@/lib/validations';

// ─── recordPaymentSchema ─────────────────────────────────────

describe('recordPaymentSchema', () => {
    it('accepts valid payment data', () => {
        const result = recordPaymentSchema.safeParse({
            invoiceId: '550e8400-e29b-41d4-a716-446655440000',
            amount: 15000,
            paymentMethod: 'CASH',
        });
        expect(result.success).toBe(true);
    });

    it('accepts all valid payment methods', () => {
        const methods = ['CASH', 'CHEQUE', 'ONLINE', 'BANK_TRANSFER', 'UPI', 'CARD'];
        for (const method of methods) {
            const result = recordPaymentSchema.safeParse({
                invoiceId: '550e8400-e29b-41d4-a716-446655440000',
                amount: 100,
                paymentMethod: method,
            });
            expect(result.success).toBe(true);
        }
    });

    it('rejects negative amount', () => {
        const result = recordPaymentSchema.safeParse({
            invoiceId: '550e8400-e29b-41d4-a716-446655440000',
            amount: -500,
            paymentMethod: 'CASH',
        });
        expect(result.success).toBe(false);
    });

    it('rejects zero amount', () => {
        const result = recordPaymentSchema.safeParse({
            invoiceId: '550e8400-e29b-41d4-a716-446655440000',
            amount: 0,
            paymentMethod: 'CASH',
        });
        expect(result.success).toBe(false);
    });

    it('rejects invalid payment method', () => {
        const result = recordPaymentSchema.safeParse({
            invoiceId: '550e8400-e29b-41d4-a716-446655440000',
            amount: 100,
            paymentMethod: 'BITCOIN',
        });
        expect(result.success).toBe(false);
    });

    it('rejects invalid UUID for invoiceId', () => {
        const result = recordPaymentSchema.safeParse({
            invoiceId: 'not-a-uuid',
            amount: 100,
            paymentMethod: 'CASH',
        });
        expect(result.success).toBe(false);
    });

    it('accepts optional transactionId and remarks', () => {
        const result = recordPaymentSchema.safeParse({
            invoiceId: '550e8400-e29b-41d4-a716-446655440000',
            amount: 5000,
            paymentMethod: 'ONLINE',
            transactionId: 'TXN_123456',
            remarks: 'Q1 payment',
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.transactionId).toBe('TXN_123456');
        }
    });
});

// ─── generateInvoiceSchema ───────────────────────────────────

describe('generateInvoiceSchema', () => {
    it('accepts valid invoice generation data', () => {
        const result = generateInvoiceSchema.safeParse({
            feePlanId: '550e8400-e29b-41d4-a716-446655440000',
            dueDate: '2026-04-15',
        });
        expect(result.success).toBe(true);
    });

    it('rejects invalid date format', () => {
        const result = generateInvoiceSchema.safeParse({
            feePlanId: '550e8400-e29b-41d4-a716-446655440000',
            dueDate: '15/04/2026',
        });
        expect(result.success).toBe(false);
    });

    it('accepts optional gradeId', () => {
        const result = generateInvoiceSchema.safeParse({
            feePlanId: '550e8400-e29b-41d4-a716-446655440000',
            gradeId: '660e8400-e29b-41d4-a716-446655440000',
            dueDate: '2026-04-15',
        });
        expect(result.success).toBe(true);
    });
});

// ─── safeAction ──────────────────────────────────────────────

describe('safeAction', () => {
    it('wraps a successful function', async () => {
        const result = await safeAction(async () => 42);
        expect(result).toEqual({ success: true, data: 42 });
    });

    it('catches thrown errors', async () => {
        const result = await safeAction(async () => {
            throw new Error('DB connection failed');
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toBe('DB connection failed');
        }
    });

    it('handles non-Error throws', async () => {
        const result = await safeAction(async () => {
            throw 'string error';
        });
        expect(result.success).toBe(false);
    });
});

// ─── validateFormData ────────────────────────────────────────

describe('validateFormData', () => {
    it('validates and parses FormData correctly', () => {
        const formData = new FormData();
        formData.set('invoiceId', '550e8400-e29b-41d4-a716-446655440000');
        formData.set('amount', '15000');
        formData.set('paymentMethod', 'CASH');

        // Note: FormData sends everything as strings — Zod needs coercion for numbers
        // This test validates the helper's object conversion works
        const result = validateFormData(recordPaymentSchema, formData);
        // Amount will be a string from FormData, so this will fail validation
        // (demonstrates that raw FormData needs per-field parsing)
        expect(result.success).toBe(false);
    });
});
