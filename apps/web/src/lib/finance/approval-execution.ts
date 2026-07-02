import type { PoolClient } from 'pg';
import { pool, runWithTenantContext } from '@/lib/db';
import {
    assertApprovalMatchesAction,
    requireApprovedWorkflowApprovalOrRequest,
    toWorkflowApprovalSummary,
    type WorkflowApprovalActor,
    type WorkflowApprovalRequest,
    type WorkflowApprovalSummary,
} from '@school-sis/api';
import { insertMoneyAudit, minorFromAmount, outstandingMinor } from '@/lib/payments/ledger';
import {
    getRazorpayGateway,
    getStripeGateway,
    type PaymentProviderName,
    type ProviderRefund,
} from '@/lib/payments/providers';

type InvoiceStatus = 'DRAFT' | 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'WAIVED';
type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';

export type InvoiceSnapshot = {
    id: string;
    tenantId: string;
    studentId: string;
    invoiceNumber: string;
    totalAmount: string;
    paidAmount: string | null;
    dueDate: string;
    status: InvoiceStatus;
};

export type PaymentSnapshot = {
    id: string;
    tenantId: string;
    invoiceId: string;
    studentId: string;
    amount: string;
    method: string;
    status: PaymentStatus;
    transactionId: string | null;
    razorpayPaymentId: string | null;
    invoiceNumber: string;
    invoiceTotalAmount: string;
    invoicePaidAmount: string | null;
    invoiceStatus: InvoiceStatus;
    invoiceDueDate: string;
};

export class FinanceApprovalExecutionError extends Error {
    constructor(message: string, public readonly status = 400) {
        super(message);
        this.name = 'FinanceApprovalExecutionError';
    }
}

export type FinanceApprovalExecutionResult =
    | {
        status: 'APPROVAL_REQUIRED';
        approval: WorkflowApprovalSummary;
    }
    | {
        status: 'EXECUTED';
        action: 'INVOICE_WAIVED' | 'INVOICE_CANCELLED' | 'PAYMENT_REFUNDED';
        approvalRequestId: string;
        invoiceId: string;
        paymentId?: string;
        amount: string;
        currency: 'INR';
        providerRefund?: ProviderRefundExecution | null;
    };

export type ProviderRefundExecution = {
    provider: PaymentProviderName | 'MANUAL';
    providerRefundId?: string;
    providerPaymentId?: string;
    status: string;
    executionMode: 'provider_native' | 'internal_ledger';
};

export type InvoiceFinanceActionInput = {
    tenantId: string;
    invoiceId: string;
    reason: string;
    approvalRequestId?: string;
    actor: WorkflowApprovalActor;
};

export type RefundPaymentInput = {
    tenantId: string;
    paymentId: string;
    reason: string;
    approvalRequestId?: string;
    refundAmount?: number;
    actor: WorkflowApprovalActor;
};

export const FINANCE_APPROVAL_POLICIES = {
    waiveInvoice: 'fees.invoice.waive',
    cancelInvoice: 'fees.invoice.cancel',
    refundPayment: 'payments.refund',
} as const;

const CURRENCY = 'INR' as const;
const WAIVABLE_INVOICE_STATUSES = new Set<InvoiceStatus>(['PENDING', 'PARTIAL', 'OVERDUE']);
const CANCELLABLE_INVOICE_STATUSES = new Set<InvoiceStatus>(['DRAFT', 'PENDING']);
const TERMINAL_INVOICE_STATUSES = new Set<InvoiceStatus>(['CANCELLED', 'WAIVED']);

export function amountFromMinor(amountMinor: number): string {
    return (amountMinor / 100).toFixed(2);
}

export function computeInvoiceStatusAfterRefund(input: {
    totalAmountMinor: number;
    paidAmountMinor: number;
    dueDate: string;
    now?: Date;
}): InvoiceStatus {
    if (input.paidAmountMinor >= input.totalAmountMinor) return 'PAID';
    if (input.paidAmountMinor > 0) return 'PARTIAL';
    return isPastDueDate(input.dueDate, input.now ?? new Date()) ? 'OVERDUE' : 'PENDING';
}

export function buildInvoiceApprovalPayload(
    action: 'WAIVE_INVOICE' | 'CANCEL_INVOICE',
    invoice: InvoiceSnapshot,
    reason: string,
): Record<string, unknown> {
    return {
        action,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        reason,
        currentStatus: invoice.status,
        totalAmountMinor: minorFromAmount(Number(invoice.totalAmount)),
        paidAmountMinor: minorFromAmount(Number(invoice.paidAmount || 0)),
        outstandingAmountMinor: outstandingMinor(invoice),
    };
}

export function buildRefundApprovalPayload(
    payment: PaymentSnapshot,
    reason: string,
    refundAmountMinor: number,
): Record<string, unknown> {
    return {
        action: 'REFUND_PAYMENT',
        paymentId: payment.id,
        invoiceId: payment.invoiceId,
        invoiceNumber: payment.invoiceNumber,
        reason,
        currentPaymentStatus: payment.status,
        currentInvoiceStatus: payment.invoiceStatus,
        paymentAmountMinor: minorFromAmount(Number(payment.amount)),
        refundAmountMinor,
        invoicePaidAmountMinor: minorFromAmount(Number(payment.invoicePaidAmount || 0)),
    };
}

export function resolveRefundProvider(payment: Pick<PaymentSnapshot, 'transactionId' | 'razorpayPaymentId'>): {
    provider: PaymentProviderName | 'MANUAL';
    providerPaymentId?: string;
} {
    if (payment.razorpayPaymentId) {
        return { provider: 'RAZORPAY', providerPaymentId: payment.razorpayPaymentId };
    }
    if (payment.transactionId?.startsWith('pi_')) {
        return { provider: 'STRIPE', providerPaymentId: payment.transactionId };
    }
    return { provider: 'MANUAL' };
}

export function financeResultHttpStatus(result: FinanceApprovalExecutionResult): number {
    if (result.status === 'EXECUTED') return 200;
    if (result.approval.status === 'PENDING' || result.approval.status === 'ESCALATED') return 202;
    return 409;
}

export async function waiveInvoiceBalanceWithApproval(
    input: InvoiceFinanceActionInput,
): Promise<FinanceApprovalExecutionResult> {
    const reason = normalizeReason(input.reason);
    const invoice = await runWithTenantContext(
        input.tenantId,
        () => fetchInvoiceSnapshot(input.tenantId, input.invoiceId),
    );
    assertInvoiceWaivable(invoice);

    const payload = buildInvoiceApprovalPayload('WAIVE_INVOICE', invoice, reason);
    const gate = await requireApprovedWorkflowApprovalOrRequest({
        tenantId: input.tenantId,
        policyId: FINANCE_APPROVAL_POLICIES.waiveInvoice,
        title: `Waive invoice ${invoice.invoiceNumber}`,
        description: `Waive ${CURRENCY} ${amountFromMinor(outstandingMinor(invoice))} outstanding on invoice ${invoice.invoiceNumber}. Reason: ${reason}`,
        priority: invoice.status === 'OVERDUE' ? 'HIGH' : 'NORMAL',
        resource: {
            type: 'fees.invoice',
            id: input.invoiceId,
            label: invoice.invoiceNumber,
            tenantId: input.tenantId,
        },
        payload,
        reason,
        approvalRequestId: input.approvalRequestId,
        requestedBy: input.actor,
    });
    if (!gate.approved) return { status: 'APPROVAL_REQUIRED', approval: toWorkflowApprovalSummary(gate.request) };

    return executeInvoiceStateChange({
        tenantId: input.tenantId,
        invoiceId: input.invoiceId,
        actorUserId: input.actor.userId,
        reason,
        approvalRequestId: gate.request.id,
        approvalRequest: gate.request,
        expectedPolicyId: FINANCE_APPROVAL_POLICIES.waiveInvoice,
        targetStatus: 'WAIVED',
        auditAction: 'INVOICE_WAIVED',
    });
}

export async function cancelInvoiceWithApproval(
    input: InvoiceFinanceActionInput,
): Promise<FinanceApprovalExecutionResult> {
    const reason = normalizeReason(input.reason);
    const invoice = await runWithTenantContext(
        input.tenantId,
        () => fetchInvoiceSnapshot(input.tenantId, input.invoiceId),
    );
    assertInvoiceCancellable(invoice);

    const payload = buildInvoiceApprovalPayload('CANCEL_INVOICE', invoice, reason);
    const gate = await requireApprovedWorkflowApprovalOrRequest({
        tenantId: input.tenantId,
        policyId: FINANCE_APPROVAL_POLICIES.cancelInvoice,
        title: `Cancel invoice ${invoice.invoiceNumber}`,
        description: `Cancel invoice ${invoice.invoiceNumber}. Reason: ${reason}`,
        priority: 'NORMAL',
        resource: {
            type: 'fees.invoice',
            id: input.invoiceId,
            label: invoice.invoiceNumber,
            tenantId: input.tenantId,
        },
        payload,
        reason,
        approvalRequestId: input.approvalRequestId,
        requestedBy: input.actor,
    });
    if (!gate.approved) return { status: 'APPROVAL_REQUIRED', approval: toWorkflowApprovalSummary(gate.request) };

    return executeInvoiceStateChange({
        tenantId: input.tenantId,
        invoiceId: input.invoiceId,
        actorUserId: input.actor.userId,
        reason,
        approvalRequestId: gate.request.id,
        approvalRequest: gate.request,
        expectedPolicyId: FINANCE_APPROVAL_POLICIES.cancelInvoice,
        targetStatus: 'CANCELLED',
        auditAction: 'INVOICE_CANCELLED',
    });
}

export async function refundPaymentWithApproval(
    input: RefundPaymentInput,
): Promise<FinanceApprovalExecutionResult> {
    const reason = normalizeReason(input.reason);
    const payment = await runWithTenantContext(
        input.tenantId,
        () => fetchPaymentSnapshot(input.tenantId, input.paymentId),
    );
    const paymentAmountMinor = minorFromAmount(Number(payment.amount));
    const refundAmountMinor = input.refundAmount == null
        ? paymentAmountMinor
        : minorFromAmount(input.refundAmount);

    assertPaymentRefundable(payment, refundAmountMinor);

    const payload = buildRefundApprovalPayload(payment, reason, refundAmountMinor);
    const gate = await requireApprovedWorkflowApprovalOrRequest({
        tenantId: input.tenantId,
        policyId: FINANCE_APPROVAL_POLICIES.refundPayment,
        title: `Refund payment ${payment.id}`,
        description: `Refund ${CURRENCY} ${amountFromMinor(refundAmountMinor)} for invoice ${payment.invoiceNumber}. Reason: ${reason}`,
        priority: 'HIGH',
        resource: {
            type: 'payments.payment',
            id: input.paymentId,
            label: payment.id,
            tenantId: input.tenantId,
        },
        payload,
        reason,
        approvalRequestId: input.approvalRequestId,
        requestedBy: input.actor,
    });
    if (!gate.approved) return { status: 'APPROVAL_REQUIRED', approval: toWorkflowApprovalSummary(gate.request) };

    return runWithTenantContext(input.tenantId, async () => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const lockedPayment = await fetchPaymentSnapshot(input.tenantId, input.paymentId, client, true);
            assertPaymentRefundable(lockedPayment, refundAmountMinor);

            const currentPayload = buildRefundApprovalPayload(lockedPayment, reason, refundAmountMinor);
            assertApprovalMatchesAction(gate.request, {
                tenantId: input.tenantId,
                policyId: FINANCE_APPROVAL_POLICIES.refundPayment,
                resource: {
                    type: 'payments.payment',
                    id: input.paymentId,
                    tenantId: input.tenantId,
                },
                payload: currentPayload,
            });

            const providerRefund = await executeProviderRefundIfAvailable({
                tenantId: input.tenantId,
                payment: lockedPayment,
                refundAmountMinor,
                reason,
                approvalRequestId: gate.request.id,
            });

            const currentPaidMinor = minorFromAmount(Number(lockedPayment.invoicePaidAmount || 0));
            const newPaidMinor = Math.max(0, currentPaidMinor - refundAmountMinor);
            const newInvoiceStatus = computeInvoiceStatusAfterRefund({
                totalAmountMinor: minorFromAmount(Number(lockedPayment.invoiceTotalAmount)),
                paidAmountMinor: newPaidMinor,
                dueDate: lockedPayment.invoiceDueDate,
            });

            await client.query(
                `UPDATE payments
                 SET status = 'REFUNDED'
                 WHERE tenant_id = $1 AND id = $2`,
                [input.tenantId, input.paymentId],
            );

            await client.query(
                `UPDATE invoices
                 SET paid_amount = $1,
                     status = $2,
                     updated_at = NOW()
                 WHERE tenant_id = $3 AND id = $4`,
                [amountFromMinor(newPaidMinor), newInvoiceStatus, input.tenantId, lockedPayment.invoiceId],
            );

            await insertMoneyAudit(client, {
                tenantId: input.tenantId,
                invoiceId: lockedPayment.invoiceId,
                paymentId: lockedPayment.id,
                actorUserId: input.actor.userId,
                provider: providerRefund.provider,
                action: 'PAYMENT_REFUNDED',
                amount: amountFromMinor(refundAmountMinor),
                currency: CURRENCY,
                metadata: {
                    approvalRequestId: gate.request.id,
                    reason,
                    previousPaymentStatus: lockedPayment.status,
                    previousInvoiceStatus: lockedPayment.invoiceStatus,
                    previousInvoicePaidAmount: lockedPayment.invoicePaidAmount,
                    newInvoicePaidAmount: amountFromMinor(newPaidMinor),
                    newInvoiceStatus,
                    providerRefund,
                },
            });

            await client.query('COMMIT');
            return {
                status: 'EXECUTED',
                action: 'PAYMENT_REFUNDED',
                approvalRequestId: gate.request.id,
                invoiceId: lockedPayment.invoiceId,
                paymentId: lockedPayment.id,
                amount: amountFromMinor(refundAmountMinor),
                currency: CURRENCY,
                providerRefund,
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    });
}

async function executeInvoiceStateChange(input: {
    tenantId: string;
    invoiceId: string;
    actorUserId: string;
    reason: string;
    approvalRequestId: string;
    approvalRequest: WorkflowApprovalRequest;
    expectedPolicyId: string;
    targetStatus: 'WAIVED' | 'CANCELLED';
    auditAction: 'INVOICE_WAIVED' | 'INVOICE_CANCELLED';
}): Promise<FinanceApprovalExecutionResult> {
    return runWithTenantContext(input.tenantId, async () => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const invoice = await fetchInvoiceSnapshot(input.tenantId, input.invoiceId, client, true);
            if (input.targetStatus === 'WAIVED') {
                assertInvoiceWaivable(invoice);
            } else {
                assertInvoiceCancellable(invoice);
            }

            const action = input.targetStatus === 'WAIVED' ? 'WAIVE_INVOICE' : 'CANCEL_INVOICE';
            const currentPayload = buildInvoiceApprovalPayload(action, invoice, input.reason);
            assertApprovalMatchesAction(input.approvalRequest, {
                tenantId: input.tenantId,
                policyId: input.expectedPolicyId,
                resource: {
                    type: 'fees.invoice',
                    id: input.invoiceId,
                    tenantId: input.tenantId,
                },
                payload: currentPayload,
            });

            await client.query(
                `UPDATE invoices
                 SET status = $1,
                     updated_at = NOW()
                 WHERE tenant_id = $2 AND id = $3`,
                [input.targetStatus, input.tenantId, input.invoiceId],
            );

            const amountMinor = input.targetStatus === 'WAIVED'
                ? outstandingMinor(invoice)
                : minorFromAmount(Number(invoice.totalAmount));

            await insertMoneyAudit(client, {
                tenantId: input.tenantId,
                invoiceId: invoice.id,
                actorUserId: input.actorUserId,
                provider: 'MANUAL',
                action: input.auditAction,
                amount: amountFromMinor(amountMinor),
                currency: CURRENCY,
                metadata: {
                    approvalRequestId: input.approvalRequestId,
                    reason: input.reason,
                    previousStatus: invoice.status,
                    newStatus: input.targetStatus,
                    paidAmount: invoice.paidAmount,
                    outstandingAmount: amountFromMinor(outstandingMinor(invoice)),
                },
            });

            await client.query('COMMIT');
            return {
                status: 'EXECUTED',
                action: input.auditAction,
                approvalRequestId: input.approvalRequestId,
                invoiceId: invoice.id,
                amount: amountFromMinor(amountMinor),
                currency: CURRENCY,
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    });
}

async function fetchInvoiceSnapshot(
    tenantId: string,
    invoiceId: string,
    queryable: Pick<PoolClient, 'query'> | typeof pool = pool,
    forUpdate = false,
): Promise<InvoiceSnapshot> {
    const { rows } = await queryable.query<InvoiceSnapshot>(
        `SELECT
            id,
            tenant_id AS "tenantId",
            student_id AS "studentId",
            invoice_number AS "invoiceNumber",
            total_amount AS "totalAmount",
            paid_amount AS "paidAmount",
            due_date AS "dueDate",
            status
         FROM invoices
         WHERE tenant_id = $1 AND id = $2
         LIMIT 1
         ${forUpdate ? 'FOR UPDATE' : ''}`,
        [tenantId, invoiceId],
    );
    const invoice = rows[0];
    if (!invoice) throw new FinanceApprovalExecutionError('Invoice not found.', 404);
    return normalizeInvoiceSnapshot(invoice);
}

async function fetchPaymentSnapshot(
    tenantId: string,
    paymentId: string,
    queryable: Pick<PoolClient, 'query'> | typeof pool = pool,
    forUpdate = false,
): Promise<PaymentSnapshot> {
    const { rows } = await queryable.query<PaymentSnapshot>(
        `SELECT
            p.id,
            p.tenant_id AS "tenantId",
            p.invoice_id AS "invoiceId",
            p.student_id AS "studentId",
            p.amount,
            p.method,
            p.status,
            p.transaction_id AS "transactionId",
            p.razorpay_payment_id AS "razorpayPaymentId",
            i.invoice_number AS "invoiceNumber",
            i.total_amount AS "invoiceTotalAmount",
            i.paid_amount AS "invoicePaidAmount",
            i.status AS "invoiceStatus",
            i.due_date AS "invoiceDueDate"
         FROM payments p
         INNER JOIN invoices i
            ON i.id = p.invoice_id
           AND i.tenant_id = p.tenant_id
         WHERE p.tenant_id = $1 AND p.id = $2
         LIMIT 1
         ${forUpdate ? 'FOR UPDATE OF p, i' : ''}`,
        [tenantId, paymentId],
    );
    const payment = rows[0];
    if (!payment) throw new FinanceApprovalExecutionError('Payment not found.', 404);
    return normalizePaymentSnapshot(payment);
}

function normalizeInvoiceSnapshot(invoice: InvoiceSnapshot): InvoiceSnapshot {
    return {
        ...invoice,
        dueDate: normalizeDate(invoice.dueDate),
        status: invoice.status as InvoiceStatus,
    };
}

function normalizePaymentSnapshot(payment: PaymentSnapshot): PaymentSnapshot {
    return {
        ...payment,
        invoiceDueDate: normalizeDate(payment.invoiceDueDate),
        status: payment.status as PaymentStatus,
        invoiceStatus: payment.invoiceStatus as InvoiceStatus,
    };
}

function normalizeDate(value: string | Date): string {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
}

function normalizeReason(reason: string): string {
    const normalized = reason.trim();
    if (normalized.length < 3) {
        throw new FinanceApprovalExecutionError('An audit reason of at least 3 characters is required.', 400);
    }
    return normalized;
}

function assertInvoiceWaivable(invoice: InvoiceSnapshot): void {
    if (!WAIVABLE_INVOICE_STATUSES.has(invoice.status)) {
        throw new FinanceApprovalExecutionError(`Invoice status ${invoice.status} cannot be waived.`, 409);
    }
    if (outstandingMinor(invoice) <= 0) {
        throw new FinanceApprovalExecutionError('Invoice has no outstanding balance to waive.', 409);
    }
}

async function executeProviderRefundIfAvailable(input: {
    tenantId: string;
    payment: PaymentSnapshot;
    refundAmountMinor: number;
    reason: string;
    approvalRequestId: string;
}): Promise<ProviderRefundExecution> {
    const provider = resolveRefundProvider(input.payment);
    if (provider.provider === 'MANUAL' || !provider.providerPaymentId) {
        return {
            provider: 'MANUAL',
            status: 'ledger_only',
            executionMode: 'internal_ledger',
        };
    }

    const metadata = {
        tenantId: input.tenantId,
        invoiceId: input.payment.invoiceId,
        paymentId: input.payment.id,
        approvalRequestId: input.approvalRequestId,
    };

    const refund: ProviderRefund = provider.provider === 'RAZORPAY'
        ? await getRazorpayGateway().refundPayment({
            providerPaymentId: provider.providerPaymentId,
            amountMinor: input.refundAmountMinor,
            currency: CURRENCY,
            reason: input.reason,
            metadata,
        })
        : await getStripeGateway().refundPayment({
            providerPaymentId: provider.providerPaymentId,
            amountMinor: input.refundAmountMinor,
            currency: CURRENCY,
            reason: input.reason,
            metadata,
        });

    return {
        provider: refund.provider,
        providerRefundId: refund.providerRefundId,
        providerPaymentId: refund.providerPaymentId,
        status: refund.status,
        executionMode: 'provider_native',
    };
}

function assertInvoiceCancellable(invoice: InvoiceSnapshot): void {
    if (!CANCELLABLE_INVOICE_STATUSES.has(invoice.status)) {
        throw new FinanceApprovalExecutionError(`Invoice status ${invoice.status} cannot be cancelled.`, 409);
    }
    if (minorFromAmount(Number(invoice.paidAmount || 0)) > 0) {
        throw new FinanceApprovalExecutionError('Paid invoices must be refunded before cancellation.', 409);
    }
}

function assertPaymentRefundable(payment: PaymentSnapshot, refundAmountMinor: number): void {
    if (payment.status !== 'COMPLETED') {
        throw new FinanceApprovalExecutionError(`Payment status ${payment.status} cannot be refunded.`, 409);
    }
    if (TERMINAL_INVOICE_STATUSES.has(payment.invoiceStatus)) {
        throw new FinanceApprovalExecutionError(`Invoice status ${payment.invoiceStatus} cannot receive a refund adjustment.`, 409);
    }

    const paymentAmountMinor = minorFromAmount(Number(payment.amount));
    if (refundAmountMinor <= 0) {
        throw new FinanceApprovalExecutionError('Refund amount must be positive.', 400);
    }
    if (refundAmountMinor !== paymentAmountMinor) {
        throw new FinanceApprovalExecutionError('Partial refunds require refund ledger support before execution.', 400);
    }
    if (minorFromAmount(Number(payment.invoicePaidAmount || 0)) < refundAmountMinor) {
        throw new FinanceApprovalExecutionError('Invoice paid amount is lower than the requested refund.', 409);
    }
}

function isPastDueDate(dueDate: string, now: Date): boolean {
    const due = new Date(`${dueDate}T00:00:00.000Z`);
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return due.getTime() < today.getTime();
}
