import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { pool, runWithRlsBypass, runWithTenantContext } from '@/lib/db';
import type { PaymentProviderName } from './providers';

type InvoiceForPayment = {
    id: string;
    tenantId: string;
    studentId: string;
    invoiceNumber: string;
    totalAmount: string;
    paidAmount: string | null;
    status: string;
};

type PaymentOrderRow = {
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
    metadata?: Record<string, unknown>;
};

const DECIMAL_SCALE = 100;

function amountFromMinor(amountMinor: number): string {
    return (amountMinor / DECIMAL_SCALE).toFixed(2);
}

export function minorFromAmount(amount: number): number {
    return Math.round(amount * DECIMAL_SCALE);
}

export function outstandingMinor(invoice: Pick<InvoiceForPayment, 'totalAmount' | 'paidAmount'>): number {
    return Math.max(0, minorFromAmount(Number(invoice.totalAmount) - Number(invoice.paidAmount || 0)));
}

export function paymentOrderIdempotencyKey(provider: PaymentProviderName, invoiceId: string, amountMinor: number, currency: string): string {
    return `${provider}:${invoiceId}:${amountMinor}:${currency.toUpperCase()}`;
}

export async function findInvoiceForPayment(
    invoiceId: string,
    tenantId: string,
    userId: string,
    role: string,
): Promise<InvoiceForPayment | null> {
    const parentOnlyClause = role === 'PARENT'
        ? 'AND EXISTS (SELECT 1 FROM guardians g WHERE g.student_id = i.student_id AND g.tenant_id = i.tenant_id AND g.user_id = $3)'
        : '';

    const { rows } = await pool.query<InvoiceForPayment>(
        `SELECT
            i.id,
            i.tenant_id AS "tenantId",
            i.student_id AS "studentId",
            i.invoice_number AS "invoiceNumber",
            i.total_amount AS "totalAmount",
            i.paid_amount AS "paidAmount",
            i.status
         FROM invoices i
         WHERE i.id = $1
           AND i.tenant_id = $2
           ${parentOnlyClause}
         LIMIT 1`,
        role === 'PARENT' ? [invoiceId, tenantId, userId] : [invoiceId, tenantId],
    );

    return rows[0] || null;
}

async function insertMoneyAudit(
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

export async function createPaymentOrderRecord(input: CreatePaymentOrderInput): Promise<PaymentOrderRow> {
    const amount = amountFromMinor(input.amountMinor);
    const idempotencyKey = paymentOrderIdempotencyKey(input.provider, input.invoice.id, input.amountMinor, input.currency);

    return runWithTenantContext(input.tenantId, async () => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const existing = await client.query<PaymentOrderRow>(
                `SELECT
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
                    idempotency_key AS "idempotencyKey"
                 FROM payment_orders
                 WHERE tenant_id = $1 AND idempotency_key = $2
                 LIMIT 1`,
                [input.tenantId, idempotencyKey],
            );

            if (existing.rows[0]) {
                await client.query('COMMIT');
                return existing.rows[0];
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
                 RETURNING
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
                    idempotency_key AS "idempotencyKey"`,
                [
                    input.tenantId,
                    input.invoice.id,
                    input.invoice.studentId,
                    input.provider,
                    input.providerOrderId,
                    amount,
                    input.amountMinor,
                    input.currency.toUpperCase(),
                    idempotencyKey,
                    input.createdBy,
                    JSON.stringify(input.metadata || {}),
                ],
            );

            await insertMoneyAudit(client, {
                tenantId: input.tenantId,
                invoiceId: input.invoice.id,
                paymentOrderId: inserted.rows[0].id,
                actorUserId: input.createdBy,
                provider: input.provider,
                action: 'ORDER_CREATED',
                amount,
                currency: input.currency,
                metadata: input.metadata,
            });

            await client.query('COMMIT');
            return inserted.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
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
        `SELECT
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
            idempotency_key AS "idempotencyKey"
         FROM payment_orders
         WHERE tenant_id = $1
           AND provider = $2
           AND idempotency_key = $3
         LIMIT 1`,
        [tenantId, provider, idempotencyKey],
    );

    return rows[0] || null;
}

export async function getPaymentOrderByProviderOrder(
    tenantId: string,
    provider: PaymentProviderName,
    providerOrderId: string,
): Promise<PaymentOrderRow | null> {
    const { rows } = await pool.query<PaymentOrderRow>(
        `SELECT
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
            idempotency_key AS "idempotencyKey"
         FROM payment_orders
         WHERE tenant_id = $1 AND provider = $2 AND provider_order_id = $3
         LIMIT 1`,
        [tenantId, provider, providerOrderId],
    );

    return rows[0] || null;
}

export async function completeProviderPayment(input: CompleteProviderPaymentInput): Promise<{ paymentId: string; alreadyProcessed: boolean }> {
    const amount = amountFromMinor(input.amountMinor);

    return runWithTenantContext(input.tenantId, async () => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

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
                    currency: input.currency,
                    metadata: input.metadata,
                });
                await client.query('COMMIT');
                return { paymentId: duplicate.rows[0].id, alreadyProcessed: true };
            }

            const invoiceResult = await client.query<InvoiceForPayment>(
                `SELECT
                    id,
                    tenant_id AS "tenantId",
                    student_id AS "studentId",
                    invoice_number AS "invoiceNumber",
                    total_amount AS "totalAmount",
                    paid_amount AS "paidAmount",
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

            const outstanding = outstandingMinor(invoice);
            if (input.amountMinor <= 0 || input.amountMinor > outstanding) {
                throw new Error('Provider payment amount does not match invoice balance.');
            }

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
                    JSON.stringify({
                        provider: input.provider,
                        providerOrderId: input.providerOrderId,
                        ...input.metadata,
                    }),
                ],
            );

            const newPaidMinor = Math.min(minorFromAmount(Number(invoice.totalAmount)), minorFromAmount(Number(invoice.paidAmount || 0)) + input.amountMinor);
            const newStatus = newPaidMinor >= minorFromAmount(Number(invoice.totalAmount)) ? 'PAID' : 'PARTIAL';

            await client.query(
                `UPDATE invoices
                 SET paid_amount = $1,
                     status = $2,
                     updated_at = NOW()
                 WHERE id = $3 AND tenant_id = $4`,
                [amountFromMinor(newPaidMinor), newStatus, invoice.id, input.tenantId],
            );

            let paymentOrderId: string | undefined;
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
                paymentOrderId = orderUpdate.rows[0]?.id;
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
                action: 'PAYMENT_COMPLETED',
                amount,
                currency: input.currency,
                metadata: input.metadata,
            });

            await client.query('COMMIT');
            return { paymentId: paymentResult.rows[0].id, alreadyProcessed: false };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    });
}

export async function recordManualPayment(input: ManualPaymentInput): Promise<{ paymentId: string }> {
    return runWithTenantContext(input.tenantId, async () => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const invoiceResult = await client.query<InvoiceForPayment>(
                `SELECT
                    id,
                    tenant_id AS "tenantId",
                    student_id AS "studentId",
                    invoice_number AS "invoiceNumber",
                    total_amount AS "totalAmount",
                    paid_amount AS "paidAmount",
                    status
                 FROM invoices
                 WHERE id = $1 AND tenant_id = $2
                 FOR UPDATE`,
                [input.invoiceId, input.tenantId],
            );
            const invoice = invoiceResult.rows[0];
            if (!invoice) throw new Error('Invoice not found');

            const amountMinor = minorFromAmount(input.amount);
            const outstanding = outstandingMinor(invoice);
            if (amountMinor <= 0 || amountMinor > outstanding) {
                throw new Error('Payment amount exceeds invoice balance.');
            }

            const paymentResult = await client.query<{ id: string }>(
                `INSERT INTO payments (tenant_id, invoice_id, student_id, amount, method, status, notes)
                 VALUES ($1, $2, $3, $4, $5, 'COMPLETED', $6)
                 RETURNING id`,
                [
                    input.tenantId,
                    invoice.id,
                    invoice.studentId,
                    input.amount.toFixed(2),
                    input.method,
                    JSON.stringify(input.metadata || {}),
                ],
            );

            const newPaidMinor = Math.min(minorFromAmount(Number(invoice.totalAmount)), minorFromAmount(Number(invoice.paidAmount || 0)) + amountMinor);
            const newStatus = newPaidMinor >= minorFromAmount(Number(invoice.totalAmount)) ? 'PAID' : 'PARTIAL';
            await client.query(
                `UPDATE invoices
                 SET paid_amount = $1,
                     status = $2,
                     updated_at = NOW()
                 WHERE id = $3 AND tenant_id = $4`,
                [amountFromMinor(newPaidMinor), newStatus, invoice.id, input.tenantId],
            );

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
                actorUserId: input.actorUserId,
                provider: 'MANUAL',
                action: 'MANUAL_PAYMENT_RECORDED',
                amount: input.amount.toFixed(2),
                currency: 'INR',
                metadata: input.metadata,
            });

            await client.query('COMMIT');
            return { paymentId: paymentResult.rows[0].id };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    });
}

export async function recordProviderEvent(input: {
    provider: PaymentProviderName;
    eventId: string;
    eventType: string;
    tenantId?: string | null;
    payload: Record<string, unknown>;
}): Promise<{ event: ProviderEventRow; duplicate: boolean }> {
    return runWithRlsBypass(async () => {
        const inserted = await pool.query<ProviderEventRow>(
            `INSERT INTO payment_provider_events (tenant_id, provider, event_id, event_type, payload, status)
             VALUES ($1, $2, $3, $4, $5::jsonb, 'PROCESSING')
             ON CONFLICT (provider, event_id) DO NOTHING
             RETURNING id, status, processed_at AS "processedAt"`,
            [
                input.tenantId || null,
                input.provider,
                input.eventId,
                input.eventType,
                JSON.stringify(input.payload),
            ],
        );

        if (inserted.rows[0]) {
            return { event: inserted.rows[0], duplicate: false };
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
    await runWithRlsBypass(() => pool.query(
        `UPDATE payment_provider_events
         SET status = $1,
             error = $2,
             processed_at = NOW()
         WHERE id = $3`,
        [status, error || null, providerEventId],
    ));
}
