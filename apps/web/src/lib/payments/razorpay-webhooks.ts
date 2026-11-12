import crypto from 'crypto';
import { pool, RLS_BYPASS_JUSTIFICATIONS, runWithRlsBypass } from '@/lib/db';
import { modulesForSubscriptionTier } from '@/lib/auth/platform-owner';
import type { HeaderReader } from '@/lib/security/client-ip';
import {
    completeProviderPayment,
    getPaymentOrderByProviderOrderAnyTenant,
    markProviderEventProcessed,
    recordProviderEvent,
} from './ledger';

const ALLOWED_SUBSCRIPTION_TIERS = new Set(['CORE', 'AI_PRO', 'ENTERPRISE']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RazorpayPaymentEntity = {
    id?: string;
    order_id?: string;
    amount?: number;
    currency?: string;
    status?: string;
    notes?: Record<string, unknown>;
};

type RazorpayPaymentLinkEntity = {
    id?: string;
    reference_id?: string;
    amount?: number;
    amount_paid?: number;
    currency?: string;
    status?: string;
    notes?: Record<string, unknown>;
};

type RazorpayWebhookPayload = {
    event?: string;
    payload?: {
        payment?: {
            entity?: RazorpayPaymentEntity;
        };
        payment_link?: {
            entity?: RazorpayPaymentLinkEntity;
        };
    };
};

export type RazorpayWebhookContext = {
    rawBody?: string;
    headers?: HeaderReader | null;
};

type PendingCheckoutMeta = {
    linkId?: string;
    referenceId?: string;
    planType?: string;
    amountMinor?: number;
    currency?: string;
    gstin?: string | null;
};

function paymentEntityFrom(payload: RazorpayWebhookPayload): RazorpayPaymentEntity {
    return payload.payload?.payment?.entity || {};
}

function paymentLinkEntityFrom(payload: RazorpayWebhookPayload): RazorpayPaymentLinkEntity {
    return payload.payload?.payment_link?.entity || {};
}

function resolveRazorpayEventId(
    eventType: string,
    payment: RazorpayPaymentEntity,
    paymentLink: RazorpayPaymentLinkEntity,
    context?: RazorpayWebhookContext,
): string {
    const headerEventId = context?.headers?.get('x-razorpay-event-id')?.trim();
    if (headerEventId && headerEventId.length > 0 && headerEventId.length <= 160) {
        return headerEventId;
    }

    if (context?.rawBody && context.rawBody.length > 0) {
        const digest = crypto.createHash('sha256').update(context.rawBody).digest('hex');
        return `sha256:${digest}`;
    }

    return `${eventType}:${paymentLink.id || payment.id || payment.order_id || 'unknown'}`;
}

function safeRazorpayPayload(
    payload: RazorpayWebhookPayload,
    payment: RazorpayPaymentEntity,
    paymentLink: RazorpayPaymentLinkEntity,
): Record<string, unknown> {
    return {
        event: payload.event,
        paymentId: payment.id,
        orderId: payment.order_id,
        paymentLinkId: paymentLink.id,
        referenceId: paymentLink.reference_id,
        amount: payment.amount ?? paymentLink.amount_paid ?? paymentLink.amount,
        currency: payment.currency ?? paymentLink.currency,
        status: payment.status ?? paymentLink.status,
    };
}

function isSaasSubscriptionRazorpayEvent(
    eventType: string,
    payment: RazorpayPaymentEntity,
    paymentLink: RazorpayPaymentLinkEntity,
    hasTenantInvoiceOrder: boolean,
): boolean {
    if (hasTenantInvoiceOrder) {
        return false;
    }
    if (eventType === 'payment_link.paid') {
        const ref = String(paymentLink.reference_id || '');
        return ref.startsWith('saas_') || Boolean(paymentLink.notes?.companyId);
    }
    if (eventType === 'payment.captured') {
        const ref = String(
            paymentLink.reference_id ||
            payment.notes?.reference_id ||
            payment.notes?.referenceId ||
            '',
        );
        return ref.startsWith('saas_') || Boolean(payment.notes?.companyId || paymentLink.notes?.companyId);
    }
    return false;
}

async function fulfillSaasRazorpayCheckout(
    payment: RazorpayPaymentEntity,
    paymentLink: RazorpayPaymentLinkEntity,
): Promise<void> {
    const linkId = String(
        paymentLink.id ||
        payment.notes?.payment_link_id ||
        payment.notes?.linkId ||
        '',
    ).trim();
    const referenceId = String(
        paymentLink.reference_id ||
        payment.notes?.reference_id ||
        payment.notes?.referenceId ||
        '',
    ).trim();
    const rawCompanyId = String(
        paymentLink.notes?.companyId ||
        payment.notes?.companyId ||
        '',
    ).trim();
    const companyId = UUID_RE.test(rawCompanyId) ? rawCompanyId : null;
    const paidAmountMinor = Number(paymentLink.amount_paid ?? payment.amount ?? paymentLink.amount ?? 0);
    const paidCurrency = String(payment.currency || paymentLink.currency || 'INR').trim().toUpperCase();

    if (paidCurrency !== 'INR') {
        throw new Error('Unsupported SaaS Razorpay settlement currency.');
    }
    if (!Number.isFinite(paidAmountMinor) || paidAmountMinor <= 0) {
        throw new Error('SaaS Razorpay settlement amount must be positive.');
    }
    if (!linkId && !referenceId) {
        throw new Error('SaaS Razorpay settlement is missing link identifier.');
    }

    await runWithRlsBypass(RLS_BYPASS_JUSTIFICATIONS.RAZORPAY_SUBSCRIPTION_UPDATE, async () => {
        const companyLookup = companyId
            ? await pool.query<{ id: string; pendingCheckoutMeta: PendingCheckoutMeta | null }>(
                  `SELECT id, pending_checkout_meta AS "pendingCheckoutMeta"
                   FROM companies
                   WHERE id = $1
                   LIMIT 1`,
                  [companyId],
              )
            : await pool.query<{ id: string; pendingCheckoutMeta: PendingCheckoutMeta | null }>(
                  `SELECT id, pending_checkout_meta AS "pendingCheckoutMeta"
                   FROM companies
                   WHERE pending_checkout_meta->>'linkId' = $1
                   LIMIT 1`,
                  [linkId],
              );

        const companyRow = companyLookup.rows[0];
        const pendingMeta = companyRow?.pendingCheckoutMeta;
        if (!companyRow || !pendingMeta || typeof pendingMeta !== 'object') {
            throw new Error('No matching pending SaaS checkout metadata found for company.');
        }

        const expectedLinkId = String(pendingMeta.linkId || '').trim();
        if (!expectedLinkId || (linkId && linkId !== expectedLinkId)) {
            throw new Error('SaaS Razorpay payment link id does not match pending checkout.');
        }
        if (!linkId && referenceId && String(pendingMeta.referenceId || '').trim() !== referenceId) {
            throw new Error('SaaS Razorpay reference id does not match pending checkout.');
        }
        if (referenceId && pendingMeta.referenceId && String(pendingMeta.referenceId).trim() !== referenceId) {
            throw new Error('SaaS Razorpay reference id does not match pending checkout.');
        }

        const expectedAmountMinor = Number(pendingMeta.amountMinor || 0);
        if (!Number.isFinite(expectedAmountMinor) || expectedAmountMinor <= 0 || paidAmountMinor !== expectedAmountMinor) {
            throw new Error('SaaS Razorpay paid amount does not match pending checkout amount.');
        }

        const planType = String(pendingMeta.planType || '');
        if (!ALLOWED_SUBSCRIPTION_TIERS.has(planType) || planType === 'CORE') {
            throw new Error('Invalid SaaS subscription tier in pending checkout metadata.');
        }

        const activeModules = modulesForSubscriptionTier(planType);

        const updateResult = await pool.query<{ id: string }>(
            `UPDATE companies
             SET subscription_tier = $1,
                 billing_status = 'ACTIVE',
                 active_modules = $2::text[],
                 is_active = true,
                 pending_checkout_meta = NULL,
                 updated_at = NOW()
             WHERE id = $3
               AND pending_checkout_meta->>'linkId' = $4
             RETURNING id`,
            [planType, activeModules, companyRow.id, expectedLinkId],
        );

        if (!updateResult.rows[0]) {
            throw new Error('Pending SaaS checkout was already fulfilled or superseded.');
        }

        await pool.query(
            `UPDATE tenants
             SET is_active = true,
                 updated_at = NOW()
             WHERE company_id = $1`,
            [companyRow.id],
        );
    });
}

export async function handleRazorpayWebhookPayload(
    payload: RazorpayWebhookPayload,
    context?: RazorpayWebhookContext,
): Promise<{ duplicate: boolean }> {
    const eventType = payload.event || 'unknown';
    const payment = paymentEntityFrom(payload);
    const paymentLink = paymentLinkEntityFrom(payload);
    const providerOrderId = payment.order_id;

    const order = providerOrderId
        ? await getPaymentOrderByProviderOrderAnyTenant('RAZORPAY', providerOrderId)
        : null;

    const providerEvent = await recordProviderEvent({
        provider: 'RAZORPAY',
        eventId: resolveRazorpayEventId(eventType, payment, paymentLink, context),
        eventType,
        tenantId: order?.tenantId || null,
        payload: safeRazorpayPayload(payload, payment, paymentLink),
    });

    if (providerEvent.duplicate) {
        return { duplicate: true };
    }

    try {
        if (isSaasSubscriptionRazorpayEvent(eventType, payment, paymentLink, Boolean(order))) {
            await fulfillSaasRazorpayCheckout(payment, paymentLink);
        } else if (eventType === 'payment.captured') {
            if (!order || !providerOrderId || !payment.id || !payment.amount) {
                throw new Error('Razorpay payment capture is missing a known order, payment id, or amount.');
            }

            await completeProviderPayment({
                tenantId: order.tenantId,
                invoiceId: order.invoiceId,
                provider: 'RAZORPAY',
                providerOrderId,
                providerPaymentId: payment.id,
                amountMinor: payment.amount,
                currency: (payment.currency || order.currency || 'INR').toUpperCase(),
                providerEventId: providerEvent.event.id,
                metadata: {
                    source: 'razorpay_webhook',
                    status: payment.status,
                },
            });
        }

        await markProviderEventProcessed(providerEvent.event.id, 'PROCESSED');
        return { duplicate: false };
    } catch (error) {
        await markProviderEventProcessed(
            providerEvent.event.id,
            'FAILED',
            error instanceof Error ? error.message : 'Razorpay webhook processing failed',
        );
        throw error;
    }
}
