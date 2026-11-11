import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { pool, RLS_BYPASS_JUSTIFICATIONS, runWithRlsBypass, runWithTenantContext } from '@/lib/db';
import type { PaymentProviderName } from './providers';

type InvoiceForPayment = {
    id: string;
    tenantId: string;
    studentId: string;
    invoiceNumber: string;
    totalAmount: string;
    paidAmount: string | null;
    dueDate?: string | Date | null;
    status: string;
};

export type PaymentOrderRow = {
    id: string;
    tenantId: string;
    invoiceId: string;
    studentId: string;
    provider: PaymentProviderName;
    providerOrderId: string | null;
    providerPaymentId: string | null;
    amount: string;
    amountMinor: number;
    currency: string;
    status: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown> | null;
    createdAt?: Date | string | null;
    checkoutUrl?: string | null;
};

type ProviderEventRow = {
    id: string;
    status: string;
    processedAt: Date | string | null;
};

export type CreatePaymentOrderInput = {
    tenantId: string;
    invoice: InvoiceForPayment;
    provider: PaymentProviderName;
    amountMinor: number;
    currency: string;
    providerOrderId: string;
    createdBy: string;
    metadata?: Record<string, unknown>;
};

export type CompleteProviderPaymentInput = {
    tenantId: string;
    invoiceId: string;
    provider: PaymentProviderName;
    providerOrderId?: string;
    providerPaymentId: string;
    amountMinor: number;
    currency: string;
    actorUserId?: string;
    providerEventId?: string;
    metadata?: Record<string, unknown>;
};

export type ManualPaymentInput = {
    tenantId: string;
    invoiceId: string;
    amount: number;
    method: string;
    actorUserId: string;
    /** UPI/NEFT reference, card auth code, or other provider-side identifier. */
    reference?: string;
    chequeNumber?: string;
    bankName?: string;
    metadata?: Record<string, unknown>;
};

export type ManualPaymentResult = {
    paymentId: string;
    receiptId: string;
    receiptNumber: string;
};

const DECIMAL_SCALE = 100;
const ORDER_REUSE_MAX_AGE_MS = 23 * 60 * 60 * 1000;

export const PAYABLE_INVOICE_STATUSES = new Set(['PENDING', 'PARTIAL', 'OVERDUE']);
const TERMINAL_SETTLEMENT_INVOICE_STATUSES = new Set(['WAIVED', 'CANCELLED']);

export function isPayableInvoiceStatus(status: string): boolean {
    return PAYABLE_INVOICE_STATUSES.has(status);
}

function amountFromMinor(amountMinor: number): string {
    return (amountMinor / DECIMAL_SCALE).toFixed(2);
}

export function minorFromAmount(amount: number): number {
    return Math.round(amount * DECIMAL_SCALE);
}

export function outstandingMinor(invoice: Pick<InvoiceForPayment, 'totalAmount' | 'paidAmount'>): number {
    return Math.max(0, minorFromAmount(Number(invoice.totalAmount) - Number(invoice.paidAmount || 0)));
}

export function paymentOrderIdempotencyKey(
    provider: PaymentProviderName,
    invoiceId: string,
    amountMinor: number,
    currency: string,
): string {
    return `${provider}:${invoiceId}:${amountMinor}:${currency.toUpperCase()}`;
}

function isUniqueViolation(error: unknown): boolean {
    const candidate = error as { code?: string; cause?: { code?: string } };
    return candidate?.code === '23505' || candidate?.cause?.code === '23505';
}

function isInvoiceOverdue(invoice: Pick<InvoiceForPayment, 'status' | 'dueDate'>, now = new Date()): boolean {
    if (invoice.status === 'OVERDUE') return true;
    if (!invoice.dueDate) return false;
    const dueStr = invoice.dueDate instanceof Date
        ? invoice.dueDate.toISOString().slice(0, 10)
        : String(invoice.dueDate).slice(0, 10);
    const todayStr = now.toISOString().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(dueStr) && dueStr < todayStr;
}

export function isReusablePaymentOrder(order: PaymentOrderRow | null | undefined, nowMs = Date.now()): boolean {
    if (!order || order.status !== 'CREATED') return false;

    if (order.createdAt) {
        const createdMs = new Date(order.createdAt).getTime();
        if (!Number.isFinite(createdMs) || nowMs - createdMs >= ORDER_REUSE_MAX_AGE_MS) {
            return false;
        }
    }

    if (order.provider === 'RAZORPAY') {
        return Boolean(order.providerOrderId);
    }

    const checkoutUrl = order.checkoutUrl
        ?? (typeof order.metadata?.checkoutUrl === 'string' ? order.metadata.checkoutUrl : null);
    return Boolean(order.providerOrderId && checkoutUrl);
}

async function withClientTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export async function findInvoiceForPayment(
    invoiceId: string,
    tenantId: string,
    userId: string,
    role: string,
): Promise<InvoiceForPayment | null> {
    if ((role === 'PARENT' || role === 'STUDENT') && !userId) {
        return null;
    }

    const actorScopeClause = role === 'PARENT'
        ? 'AND EXISTS (SELECT 1 FROM guardians g WHERE g.student_id = i.student_id AND g.tenant_id = i.tenant_id AND g.user_id = $3)'
        : role === 'STUDENT'
            ? 'AND EXISTS (SELECT 1 FROM students s WHERE s.id = i.student_id AND s.tenant_id = i.tenant_id AND s.user_id = $3)'
            : '';

    const params = role === 'PARENT' || role === 'STUDENT'
        ? [invoiceId, tenantId, userId]
        : [invoiceId, tenantId];

    const { rows } = await pool.query<InvoiceForPayment>(
        `SELECT
            i.id,
            i.tenant_id AS "tenantId",
            i.student_id AS "studentId",
            i.invoice_number AS "invoiceNumber",
            i.total_amount AS "totalAmount",
            i.paid_amount AS "paidAmount",
            i.due_date AS "dueDate",
            i.status
         FROM invoices i
         WHERE i.id = $1
           AND i.tenant_id = $2
           ${actorScopeClause}
         LIMIT 1`,
        params,
    );

    return rows[0] || null;
}

export async function insertMoneyAudit(
    client: PoolClient,
    input: {
        tenantId: string;
        invoiceId?: string;
        paymentId?: string;
        paymentOrderId?: string;
        actorUserId?: string;
        providerEventId?: string;
        provider: PaymentProviderName | 'MANUAL';
        action: string;
        amount?: string;
        currency?: string;
        metadata?: Record<string, unknown>;
    },
): Promise<void> {
    await client.query(
        `INSERT INTO payment_audit_logs (
            tenant_id,
            invoice_id,
            payment_id,
            payment_order_id,
            actor_user_id,
            provider_event_id,
            provider,
            action,
            amount,
            currency,
            metadata
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
        [
            input.tenantId,
            input.invoiceId || null,
            input.paymentId || null,
            input.paymentOrderId || null,
            input.actorUserId || null,
            input.providerEventId || null,
            input.provider,
            input.action,
            input.amount || null,
            input.currency || 'INR',
            JSON.stringify(input.metadata || {}),
        ],
    );
}

const PAYMENT_ORDER_PROJECTION = `
    id,
    tenant_id AS "tenantId",
    invoice_id AS "invoiceId",
    student_id AS "studentId",
    provider,
    provider_order_id AS "providerOrderId",
    provider_payment_id AS "providerPaymentId",
    amount,
    amount_minor AS "amountMinor",
    currency,
    status,
    idempotency_key AS "idempotencyKey",
    metadata,
    created_at AS "createdAt"
`;

export async function createPaymentOrderRecord(input: CreatePaymentOrderInput): Promise<PaymentOrderRow> {
    if (!isPayableInvoiceStatus(input.invoice.status)) {
        throw new Error(`Invoice with status ${input.invoice.status} cannot accept new payment orders.`);
    }
    const normalizedCurrency = (input.currency || '').trim().toUpperCase();
    if (normalizedCurrency !== 'INR') {
        throw new Error(`Unsupported invoice order currency '${normalizedCurrency}'; only INR is allowed.`);
    }

    const amount = amountFromMinor(input.amountMinor);
    const idempotencyKey = paymentOrderIdempotencyKey(input.provider, input.invoice.id, input.amountMinor, normalizedCurrency);

    return runWithTenantContext(input.tenantId, async () => {
        try {
            return await withClientTransaction(async (client) => {
                const existing = await client.query<PaymentOrderRow>(
                    `SELECT ${PAYMENT_ORDER_PROJECTION}
                     FROM payment_orders
                     WHERE tenant_id = $1 AND idempotency_key = $2
                     LIMIT 1
                     FOR UPDATE`,
                    [input.tenantId, idempotencyKey],
                );

                const currentOrder = existing.rows[0];
                if (currentOrder) {
                    if (isReusablePaymentOrder(currentOrder)) {
                        return currentOrder;
                    }
                    const rotatedKey = `${idempotencyKey}:stale:${currentOrder.id}:${Date.now().toString(36)}`;
                    await client.query(
                        `UPDATE payment_orders
                         SET idempotency_key = $1,
                             status = CASE WHEN status = 'CREATED' THEN 'EXPIRED' ELSE status END,
                             updated_at = NOW()
                         WHERE tenant_id = $2 AND id = $3`,
                        [rotatedKey, input.tenantId, currentOrder.id],
                    );
                }

                const inserted = await client.query<PaymentOrderRow>(
                    `INSERT INTO payment_orders (
                        tenant_id,
                        invoice_id,
                        student_id,
                        provider,
                        provider_order_id,
                        amount,
                        amount_minor,
                        currency,
                        status,
                        idempotency_key,
                        created_by,
                        metadata
                     )
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'CREATED', $9, $10, $11::jsonb)
                     ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
                     RETURNING ${PAYMENT_ORDER_PROJECTION}`,
                    [
                        input.tenantId,
                        input.invoice.id,
                        input.invoice.studentId,
                        input.provider,
                        input.providerOrderId,
                        amount,
                        input.amountMinor,
                        normalizedCurrency,
                        idempotencyKey,
                        input.createdBy,
                        JSON.stringify(input.metadata || {}),
                    ],
                );

                if (!inserted.rows[0]) {
                    const winner = await client.query<PaymentOrderRow>(
                        `SELECT ${PAYMENT_ORDER_PROJECTION}
                         FROM payment_orders
                         WHERE tenant_id = $1 AND idempotency_key = $2
                         LIMIT 1`,
                        [input.tenantId, idempotencyKey],
                    );
                    if (winner.rows[0]) {
                        return winner.rows[0];
                    }
                    throw new Error('Failed to persist payment order record.');
                }

                await insertMoneyAudit(client, {
                    tenantId: input.tenantId,
                    invoiceId: input.invoice.id,
                    paymentOrderId: inserted.rows[0].id,
                    actorUserId: input.createdBy,
                    provider: input.provider,
                    action: 'ORDER_CREATED',
                    amount,
                    currency: normalizedCurrency,
                    metadata: input.metadata,
                });

                return inserted.rows[0];
            });
        } catch (error) {
            if (isUniqueViolation(error)) {
                const winner = await getPaymentOrderByIdempotency(
                    input.tenantId,
                    input.provider,
                    input.invoice.id,
                    input.amountMinor,
                    normalizedCurrency,
                );
                if (winner) return winner;
            }
            throw error;
        }
    });
}

export async function getPaymentOrderByIdempotency(
    tenantId: string,
    provider: PaymentProviderName,
    invoiceId: string,
    amountMinor: number,
    currency: string,
): Promise<PaymentOrderRow | null> {
    const idempotencyKey = paymentOrderIdempotencyKey(provider, invoiceId, amountMinor, currency);
    const { rows } = await pool.query<PaymentOrderRow>(
        `SELECT ${PAYMENT_ORDER_PROJECTION}
         FROM payment_orders
         WHERE tenant_id = $1
           AND provider = $2
           AND idempotency_key = $3
           AND status = 'CREATED'
           AND created_at > NOW() - INTERVAL '23 hours'
         LIMIT 1`,
        [tenantId, provider, idempotencyKey],
    );

    const row = rows[0] || null;
    return isReusablePaymentOrder(row) ? row : null;
}

export const findPaymentOrderByIdempotencyKey = getPaymentOrderByIdempotency;

export async function getPaymentOrderByProviderOrder(
    tenantId: string,
    provider: PaymentProviderName,
    providerOrderId: string,
): Promise<PaymentOrderRow | null> {
    const { rows } = await pool.query<PaymentOrderRow>(
        `SELECT ${PAYMENT_ORDER_PROJECTION}
         FROM payment_orders
         WHERE tenant_id = $1 AND provider = $2 AND provider_order_id = $3
         LIMIT 1`,
        [tenantId, provider, providerOrderId],
    );

    return rows[0] || null;
}

export async function getPaymentOrderByProviderOrderAnyTenant(
    provider: PaymentProviderName,
    providerOrderId: string,
): Promise<PaymentOrderRow | null> {
    return runWithRlsBypass(RLS_BYPASS_JUSTIFICATIONS.PROVIDER_PAYMENT_LOOKUP, async () => {
        const { rows } = await pool.query<PaymentOrderRow>(
            `SELECT ${PAYMENT_ORDER_PROJECTION}
             FROM payment_orders
             WHERE provider = $1 AND provider_order_id = $2
             LIMIT 1`,
            [provider, providerOrderId],
        );

        return rows[0] || null;
    });
}

export async function completeProviderPayment(
    input: CompleteProviderPaymentInput,
): Promise<{ paymentId: string; alreadyProcessed: boolean; reconciliationRequired?: boolean }> {
    const normalizedCurrency = (input.currency || '').trim().toUpperCase();
    if (normalizedCurrency !== 'INR') {
        throw new Error(`Unsupported settlement currency '${normalizedCurrency}'; only INR is accepted.`);
    }
    if (!Number.isFinite(input.amountMinor) || input.amountMinor <= 0) {
        throw new Error('Provider payment amount must be positive.');
    }

    const amount = amountFromMinor(input.amountMinor);

    return runWithTenantContext(input.tenantId, () =>
        withClientTransaction(async (client) => {
            const duplicate = await client.query<{ id: string }>(
                `SELECT id
                 FROM payments
                 WHERE tenant_id = $1
                   AND (transaction_id = $2 OR razorpay_payment_id = $2)
                 LIMIT 1`,
                [input.tenantId, input.providerPaymentId],
            );
            if (duplicate.rows[0]) {
                await insertMoneyAudit(client, {
                    tenantId: input.tenantId,
                    invoiceId: input.invoiceId,
                    paymentId: duplicate.rows[0].id,
                    providerEventId: input.providerEventId,
                    provider: input.provider,
                    action: 'PAYMENT_DUPLICATE_IGNORED',
                    amount,
                    currency: normalizedCurrency,
                    metadata: input.metadata,
                });
                return { paymentId: duplicate.rows[0].id, alreadyProcessed: true };
            }

            let matchedOrder: PaymentOrderRow | undefined;
            if (input.providerOrderId) {
                const orderResult = await client.query<PaymentOrderRow>(
                    `SELECT ${PAYMENT_ORDER_PROJECTION}
                     FROM payment_orders
                     WHERE tenant_id = $1
                       AND provider = $2
                       AND provider_order_id = $3
                     LIMIT 1
                     FOR UPDATE`,
                    [input.tenantId, input.provider, input.providerOrderId],
                );
                matchedOrder = orderResult.rows[0];
                if (matchedOrder) {
                    if ((matchedOrder.currency || '').toUpperCase() !== normalizedCurrency) {
                        throw new Error('Provider payment currency does not match payment order currency.');
                    }
                    if (Number(matchedOrder.amountMinor) !== input.amountMinor) {
                        throw new Error('Provider payment amount does not match payment order amount.');
                    }
                    if (matchedOrder.invoiceId !== input.invoiceId) {
                        throw new Error('Provider payment invoice does not match payment order invoice.');
                    }
                }
            }

            const invoiceResult = await client.query<InvoiceForPayment>(
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
                 WHERE id = $1 AND tenant_id = $2
                 FOR UPDATE`,
                [input.invoiceId, input.tenantId],
            );
            const invoice = invoiceResult.rows[0];
            if (!invoice) {
                throw new Error('Invoice not found for provider payment.');
            }

            if (invoice.status === 'DRAFT') {
                throw new Error('Cannot complete provider payment against a DRAFT invoice.');
            }

            const isTerminalInvoice = TERMINAL_SETTLEMENT_INVOICE_STATUSES.has(invoice.status);
            if (!isTerminalInvoice) {
                const outstanding = outstandingMinor(invoice);
                if (input.amountMinor > outstanding) {
                    throw new Error('Provider payment amount does not match invoice balance.');
                }
            }

            const paymentNotesPayload: Record<string, unknown> = {
                provider: input.provider,
                providerOrderId: input.providerOrderId,
                ...input.metadata,
                ...(isTerminalInvoice
                    ? {
                        reconciliationRequired: true,
                        terminalInvoiceStatus: invoice.status,
                    }
                    : {}),
            };

            const paymentResult = await client.query<{ id: string }>(
                `INSERT INTO payments (
                    tenant_id,
                    invoice_id,
                    student_id,
                    amount,
                    method,
                    status,
                    transaction_id,
                    razorpay_payment_id,
                    notes,
                    paid_at,
                    created_at
                 )
                 VALUES ($1, $2, $3, $4, 'ONLINE', 'COMPLETED', $5, $6, $7, NOW(), NOW())
                 RETURNING id`,
                [
                    input.tenantId,
                    invoice.id,
                    invoice.studentId,
                    amount,
                    input.providerPaymentId,
                    input.provider === 'RAZORPAY' ? input.providerPaymentId : null,
                    JSON.stringify(paymentNotesPayload),
                ],
            );

            if (!isTerminalInvoice) {
                const totalMinor = minorFromAmount(Number(invoice.totalAmount));
                const newPaidMinor = Math.min(totalMinor, minorFromAmount(Number(invoice.paidAmount || 0)) + input.amountMinor);
                const newStatus = newPaidMinor >= totalMinor
                    ? 'PAID'
                    : isInvoiceOverdue(invoice)
                        ? 'OVERDUE'
                        : 'PARTIAL';

                await client.query(
                    `UPDATE invoices
                     SET paid_amount = $1,
                         status = $2,
                         updated_at = NOW()
                     WHERE id = $3 AND tenant_id = $4`,
                    [amountFromMinor(newPaidMinor), newStatus, invoice.id, input.tenantId],
                );
            }

            let paymentOrderId = matchedOrder?.id;
            if (input.providerOrderId) {
                const orderUpdate = await client.query<{ id: string }>(
                    `UPDATE payment_orders
                     SET status = 'PAID',
                         provider_payment_id = $1,
                         updated_at = NOW()
                     WHERE tenant_id = $2
                       AND provider = $3
                       AND provider_order_id = $4
                     RETURNING id`,
                    [input.providerPaymentId, input.tenantId, input.provider, input.providerOrderId],
                );
                paymentOrderId = orderUpdate.rows[0]?.id ?? paymentOrderId;
            }

            const receiptNumber = `RCP-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
            await client.query(
                `INSERT INTO receipts (tenant_id, payment_id, receipt_number)
                 VALUES ($1, $2, $3)`,
                [input.tenantId, paymentResult.rows[0].id, receiptNumber],
            );

            await insertMoneyAudit(client, {
                tenantId: input.tenantId,
                invoiceId: invoice.id,
                paymentId: paymentResult.rows[0].id,
                paymentOrderId,
                actorUserId: input.actorUserId,
                providerEventId: input.providerEventId,
                provider: input.provider,
                action: isTerminalInvoice ? 'PAYMENT_RECONCILIATION_REQUIRED' : 'PAYMENT_COMPLETED',
                amount,
                currency: normalizedCurrency,
                metadata: {
                    ...input.metadata,
                    ...(isTerminalInvoice
                        ? {
                            reconciliationRequired: true,
                            terminalInvoiceStatus: invoice.status,
                        }
                        : {}),
                },
            });

            return {
                paymentId: paymentResult.rows[0].id,
                alreadyProcessed: false,
                ...(isTerminalInvoice ? { reconciliationRequired: true } : {}),
            };
        }),
    );
}

export async function recordManualPayment(input: ManualPaymentInput): Promise<ManualPaymentResult> {
    return runWithTenantContext(input.tenantId, () =>
        withClientTransaction(async (client) => {
            const invoiceResult = await client.query<InvoiceForPayment>(
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
                 WHERE id = $1 AND tenant_id = $2
                 FOR UPDATE`,
                [input.invoiceId, input.tenantId],
            );
            const invoice = invoiceResult.rows[0];
            if (!invoice) throw new Error('Invoice not found');

            if (!isPayableInvoiceStatus(invoice.status)) {
                throw new Error(`Invoice with status ${invoice.status} cannot accept manual payments.`);
            }

            const amountMinor = minorFromAmount(input.amount);
            const outstanding = outstandingMinor(invoice);
            if (amountMinor <= 0 || amountMinor > outstanding) {
                throw new Error('Payment amount exceeds invoice balance.');
            }

            const paymentResult = await client.query<{ id: string }>(
                `INSERT INTO payments (tenant_id, invoice_id, student_id, amount, method, status, transaction_id, cheque_number, bank_name, notes)
                 VALUES ($1, $2, $3, $4, $5, 'COMPLETED', $6, $7, $8, $9)
                 RETURNING id`,
                [
                    input.tenantId,
                    invoice.id,
                    invoice.studentId,
                    input.amount.toFixed(2),
                    input.method,
                    input.reference || null,
                    input.chequeNumber || null,
                    input.bankName || null,
                    JSON.stringify(input.metadata || {}),
                ],
            );

            const totalMinor = minorFromAmount(Number(invoice.totalAmount));
            const newPaidMinor = Math.min(totalMinor, minorFromAmount(Number(invoice.paidAmount || 0)) + amountMinor);
            const newStatus = newPaidMinor >= totalMinor
                ? 'PAID'
                : isInvoiceOverdue(invoice)
                    ? 'OVERDUE'
                    : 'PARTIAL';

            await client.query(
                `UPDATE invoices
                 SET paid_amount = $1,
                     status = $2,
                     updated_at = NOW()
                 WHERE id = $3 AND tenant_id = $4`,
                [amountFromMinor(newPaidMinor), newStatus, invoice.id, input.tenantId],
            );

            const receiptNumber = `RCP-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
            const receiptResult = await client.query<{ id: string }>(
                `INSERT INTO receipts (tenant_id, payment_id, receipt_number)
                 VALUES ($1, $2, $3)
                 RETURNING id`,
                [input.tenantId, paymentResult.rows[0].id, receiptNumber],
            );

            await insertMoneyAudit(client, {
                tenantId: input.tenantId,
                invoiceId: invoice.id,
                paymentId: paymentResult.rows[0].id,
                actorUserId: input.actorUserId,
                provider: 'MANUAL',
                action: 'MANUAL_PAYMENT_RECORDED',
                amount: input.amount.toFixed(2),
                currency: 'INR',
                metadata: input.metadata,
            });

            return {
                paymentId: paymentResult.rows[0].id,
                receiptId: receiptResult.rows[0].id,
                receiptNumber,
            };
        }),
    );
}

export async function recordProviderEvent(input: {
    provider: PaymentProviderName;
    eventId: string;
    eventType: string;
    tenantId?: string | null;
    payload: Record<string, unknown>;
}): Promise<{ event: ProviderEventRow; duplicate: boolean }> {
    return runWithRlsBypass(RLS_BYPASS_JUSTIFICATIONS.PROVIDER_EVENT_LEDGER, async () => {
        const claimed = await pool.query<ProviderEventRow>(
            `INSERT INTO payment_provider_events (tenant_id, provider, event_id, event_type, payload, status, error, processed_at)
             VALUES ($1, $2, $3, $4, $5::jsonb, 'PROCESSING', NULL, NULL)
             ON CONFLICT (provider, event_id) DO UPDATE
             SET status = 'PROCESSING',
                 error = NULL,
                 processed_at = NULL,
                 received_at = NOW(),
                 tenant_id = COALESCE(payment_provider_events.tenant_id, EXCLUDED.tenant_id),
                 payload = EXCLUDED.payload
             WHERE payment_provider_events.status = 'FAILED'
                OR (
                    payment_provider_events.status = 'PROCESSING'
                    AND payment_provider_events.received_at < NOW() - INTERVAL '10 minutes'
                )
             RETURNING id, status, processed_at AS "processedAt"`,
            [
                input.tenantId || null,
                input.provider,
                input.eventId,
                input.eventType,
                JSON.stringify(input.payload),
            ],
        );

        if (claimed.rows[0]) {
            return { event: claimed.rows[0], duplicate: false };
        }

        const existing = await pool.query<ProviderEventRow>(
            `SELECT id, status, processed_at AS "processedAt"
             FROM payment_provider_events
             WHERE provider = $1 AND event_id = $2
             LIMIT 1`,
            [input.provider, input.eventId],
        );
        return { event: existing.rows[0], duplicate: true };
    });
}

export async function markProviderEventProcessed(providerEventId: string, status: 'PROCESSED' | 'FAILED', error?: string): Promise<void> {
    await runWithRlsBypass(RLS_BYPASS_JUSTIFICATIONS.PROVIDER_EVENT_LEDGER, () => pool.query(
        `UPDATE payment_provider_events
         SET status = $1,
             error = $2,
             processed_at = NOW()
         WHERE id = $3`,
        [status, error || null, providerEventId],
    ));
}
