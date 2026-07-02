import {
    amountFromMinor,
    buildInvoiceApprovalPayload,
    buildRefundApprovalPayload,
    computeInvoiceStatusAfterRefund,
    financeResultHttpStatus,
    type InvoiceSnapshot,
    type PaymentSnapshot,
} from '@/lib/finance/approval-execution';
import type { WorkflowApprovalSummary } from '@school-sis/api';

const TENANT_ID = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';

const invoice: InvoiceSnapshot = {
    id: '11111111-1111-4111-8111-111111111111',
    tenantId: TENANT_ID,
    studentId: '22222222-2222-4222-8222-222222222222',
    invoiceNumber: 'INV-2026-001',
    totalAmount: '100.00',
    paidAmount: '20.00',
    dueDate: '2026-07-10',
    status: 'PARTIAL',
};

const payment: PaymentSnapshot = {
    id: '33333333-3333-4333-8333-333333333333',
    tenantId: TENANT_ID,
    invoiceId: invoice.id,
    studentId: invoice.studentId,
    amount: '20.00',
    method: 'ONLINE',
    status: 'COMPLETED',
    transactionId: 'txn_sensitive_reference',
    razorpayPaymentId: null,
    invoiceNumber: invoice.invoiceNumber,
    invoiceTotalAmount: invoice.totalAmount,
    invoicePaidAmount: invoice.paidAmount,
    invoiceStatus: invoice.status,
    invoiceDueDate: invoice.dueDate,
};

function approvalSummary(status: WorkflowApprovalSummary['status']): WorkflowApprovalSummary {
    return {
        id: '44444444-4444-4444-8444-444444444444',
        tenantId: TENANT_ID,
        policyId: 'payments.refund',
        title: 'Refund payment',
        description: 'Refund payment',
        priority: 'HIGH',
        status,
        resourceType: 'payments.payment',
        resourceId: payment.id,
        requestedByUserId: '55555555-5555-4555-8555-555555555555',
        requiredApproverRoles: ['FINANCE_LEAD'],
        approvalsReceived: status === 'APPROVED' ? 1 : 0,
        approvalsRequired: 1,
        dueAt: '2026-07-02T08:00:00.000Z',
        expiresAt: '2026-07-04T00:00:00.000Z',
        isOverdue: false,
        requestedByRole: 'ACCOUNTANT',
        createdAt: '2026-07-02T00:00:00.000Z',
        updatedAt: '2026-07-02T00:00:00.000Z',
    };
}

describe('finance approval execution helpers', () => {
    it('computes invoice status after a full refund from paid amount and due date', () => {
        expect(computeInvoiceStatusAfterRefund({
            totalAmountMinor: 10000,
            paidAmountMinor: 10000,
            dueDate: '2026-07-10',
            now: new Date('2026-07-02T00:00:00.000Z'),
        })).toBe('PAID');

        expect(computeInvoiceStatusAfterRefund({
            totalAmountMinor: 10000,
            paidAmountMinor: 2500,
            dueDate: '2026-07-10',
            now: new Date('2026-07-02T00:00:00.000Z'),
        })).toBe('PARTIAL');

        expect(computeInvoiceStatusAfterRefund({
            totalAmountMinor: 10000,
            paidAmountMinor: 0,
            dueDate: '2026-07-01',
            now: new Date('2026-07-02T00:00:00.000Z'),
        })).toBe('OVERDUE');

        expect(computeInvoiceStatusAfterRefund({
            totalAmountMinor: 10000,
            paidAmountMinor: 0,
            dueDate: '2026-07-10',
            now: new Date('2026-07-02T00:00:00.000Z'),
        })).toBe('PENDING');
    });

    it('builds approval payloads from immutable finance state', () => {
        expect(buildInvoiceApprovalPayload('WAIVE_INVOICE', invoice, 'Financial hardship')).toMatchObject({
            action: 'WAIVE_INVOICE',
            invoiceId: invoice.id,
            invoiceNumber: 'INV-2026-001',
            reason: 'Financial hardship',
            currentStatus: 'PARTIAL',
            totalAmountMinor: 10000,
            paidAmountMinor: 2000,
            outstandingAmountMinor: 8000,
        });

        expect(buildRefundApprovalPayload(payment, 'Duplicate payment', 2000)).toMatchObject({
            action: 'REFUND_PAYMENT',
            paymentId: payment.id,
            invoiceId: invoice.id,
            reason: 'Duplicate payment',
            currentPaymentStatus: 'COMPLETED',
            currentInvoiceStatus: 'PARTIAL',
            paymentAmountMinor: 2000,
            refundAmountMinor: 2000,
            invoicePaidAmountMinor: 2000,
        });
        expect(buildRefundApprovalPayload(payment, 'Duplicate payment', 2000)).not.toHaveProperty('transactionId');
    });

    it('maps approval execution results to deterministic HTTP statuses', () => {
        expect(amountFromMinor(12345)).toBe('123.45');
        expect(financeResultHttpStatus({
            status: 'EXECUTED',
            action: 'PAYMENT_REFUNDED',
            approvalRequestId: 'approval-id',
            invoiceId: invoice.id,
            paymentId: payment.id,
            amount: '20.00',
            currency: 'INR',
        })).toBe(200);
        expect(financeResultHttpStatus({
            status: 'APPROVAL_REQUIRED',
            approval: approvalSummary('PENDING'),
        })).toBe(202);
        expect(financeResultHttpStatus({
            status: 'APPROVAL_REQUIRED',
            approval: approvalSummary('REJECTED'),
        })).toBe(409);
    });
});
