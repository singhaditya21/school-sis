import Stripe from 'stripe';
import { pool, RLS_BYPASS_JUSTIFICATIONS, runWithRlsBypass } from '@/lib/db';
import { modulesForSubscriptionTier } from '@/lib/auth/platform-owner';
import {
    completeProviderPayment,
    markProviderEventProcessed,
    recordProviderEvent,
} from './ledger';

const ALLOWED_SUBSCRIPTION_TIERS = new Set(['CORE', 'AI_PRO', 'ENTERPRISE']);

function safeStripePayload(event: Stripe.Event): Record<string, unknown> {
    return {
        id: event.id,
        type: event.type,
        account: event.account || null,
        created: event.created,
        livemode: event.livemode,
    };
}

async function handleInvoiceCheckoutCompleted(
    session: Stripe.Checkout.Session,
    providerEventId: string,
    eventAccount?: string,
): Promise<void> {
    const invoiceId = session.metadata?.invoiceId;
    const tenantId = session.metadata?.tenantId;
    if (!invoiceId || !tenantId) {
        throw new Error('Invoice checkout session is missing invoiceId or tenantId metadata.');
    }

    const tenantLookup = (await runWithRlsBypass(
        RLS_BYPASS_JUSTIFICATIONS.PROVIDER_PAYMENT_LOOKUP,
        () =>
            pool.query<{ stripeConnectAccountId: string | null }>(
                `SELECT stripe_connect_account_id AS "stripeConnectAccountId"
                 FROM tenants
                 WHERE id = $1
                 LIMIT 1`,
                [tenantId],
            ),
    )) as { rows?: Array<{ stripeConnectAccountId?: string | null }> } | undefined;
    const expectedConnectAccount = tenantLookup?.rows?.[0]?.stripeConnectAccountId?.trim() || null;
    if (expectedConnectAccount && (eventAccount?.trim() || null) !== expectedConnectAccount) {
        throw new Error('Stripe webhook account does not match tenant Stripe Connect account.');
    }

    await completeProviderPayment({
        tenantId,
        invoiceId,
        provider: 'STRIPE',
        providerOrderId: session.id,
        providerPaymentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.id,
        amountMinor: session.amount_total || 0,
        currency: String(session.currency || '').trim().toUpperCase(),
        providerEventId,
        metadata: {
            checkoutSessionId: session.id,
            stripeAccount: eventAccount || undefined,
            customer: typeof session.customer === 'string' ? session.customer : undefined,
        },
    });
}

async function handleSubscriptionCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const companyId = session.client_reference_id;
    const subscriptionId = session.subscription as string | null;
    const rawPlanType = session.metadata?.planType || 'CORE';
    const planType = ALLOWED_SUBSCRIPTION_TIERS.has(rawPlanType) ? rawPlanType : 'CORE';

    if (!companyId || !subscriptionId) {
        throw new Error('Subscription checkout session is missing company or subscription metadata.');
    }

    const activeModules = modulesForSubscriptionTier(planType);

    await runWithRlsBypass(RLS_BYPASS_JUSTIFICATIONS.STRIPE_SUBSCRIPTION_UPDATE, async () => {
        await pool.query(
            `UPDATE companies
             SET stripe_subscription_id = $1,
                 subscription_tier = $2,
                 active_modules = $3::text[],
                 billing_status = 'ACTIVE',
                 is_active = true,
                 updated_at = NOW()
             WHERE id = $4`,
            [subscriptionId, planType, activeModules, companyId],
        );
        await pool.query(
            `UPDATE tenants
             SET is_active = true,
                 updated_at = NOW()
             WHERE company_id = $1`,
            [companyId],
        );
    });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    const status = subscription.status === 'active' || subscription.status === 'trialing'
        ? 'ACTIVE'
        : subscription.status === 'past_due'
            ? 'PAST_DUE'
            : subscription.status === 'canceled'
                ? 'CANCELED'
                : 'UNPAID';

    await runWithRlsBypass(RLS_BYPASS_JUSTIFICATIONS.STRIPE_SUBSCRIPTION_UPDATE, () => pool.query(
        `UPDATE companies
         SET billing_status = $1,
             is_active = $2,
             stripe_current_period_end = $3,
             updated_at = NOW()
         WHERE stripe_subscription_id = $4`,
        [
            status,
            status === 'ACTIVE',
            new Date(((subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end || 0) * 1000),
            subscription.id,
        ],
    ));
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    await runWithRlsBypass(RLS_BYPASS_JUSTIFICATIONS.STRIPE_SUBSCRIPTION_UPDATE, () => pool.query(
        `UPDATE companies
         SET billing_status = 'CANCELED',
             is_active = false,
             updated_at = NOW()
         WHERE stripe_subscription_id = $1`,
        [subscription.id],
    ));
}

export async function handleStripeWebhookEvent(event: Stripe.Event): Promise<{ duplicate: boolean }> {
    const isCheckoutEvent =
        event.type === 'checkout.session.completed' ||
        event.type === 'checkout.session.async_payment_succeeded';

    const tenantId = isCheckoutEvent
        ? (event.data.object as Stripe.Checkout.Session).metadata?.tenantId || null
        : null;

    const providerEvent = await recordProviderEvent({
        provider: 'STRIPE',
        eventId: event.id,
        eventType: event.type,
        tenantId,
        payload: safeStripePayload(event),
    });

    if (providerEvent.duplicate) {
        return { duplicate: true };
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed':
            case 'checkout.session.async_payment_succeeded': {
                const session = event.data.object as Stripe.Checkout.Session;
                if (session.payment_status !== 'paid') {
                    break;
                }
                if (session.metadata?.invoiceId) {
                    await handleInvoiceCheckoutCompleted(session, providerEvent.event.id, event.account);
                } else {
                    await handleSubscriptionCheckoutCompleted(session);
                }
                break;
            }
            case 'customer.subscription.updated':
                await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
                break;
            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
                break;
            case 'payment_intent.payment_failed':
                break;
            default:
                break;
        }

        await markProviderEventProcessed(providerEvent.event.id, 'PROCESSED');
        return { duplicate: false };
    } catch (error) {
        await markProviderEventProcessed(
            providerEvent.event.id,
            'FAILED',
            error instanceof Error ? error.message : 'Stripe webhook processing failed',
        );
        throw error;
    }
}
