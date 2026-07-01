import Stripe from 'stripe';
import { pool, runWithRlsBypass } from '@/lib/db';
import {
    completeProviderPayment,
    markProviderEventProcessed,
    recordProviderEvent,
} from './ledger';

function safeStripePayload(event: Stripe.Event): Record<string, unknown> {
    return {
        id: event.id,
        type: event.type,
        created: event.created,
        livemode: event.livemode,
    };
}

async function handleInvoiceCheckoutCompleted(
    session: Stripe.Checkout.Session,
    providerEventId: string,
): Promise<void> {
    const invoiceId = session.metadata?.invoiceId;
    const tenantId = session.metadata?.tenantId;
    if (!invoiceId || !tenantId) {
        throw new Error('Invoice checkout session is missing invoiceId or tenantId metadata.');
    }

    await completeProviderPayment({
        tenantId,
        invoiceId,
        provider: 'STRIPE',
        providerOrderId: session.id,
        providerPaymentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.id,
        amountMinor: session.amount_total || 0,
        currency: (session.currency || 'usd').toUpperCase(),
        providerEventId,
        metadata: {
            checkoutSessionId: session.id,
            customer: typeof session.customer === 'string' ? session.customer : undefined,
        },
    });
}

async function handleSubscriptionCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const companyId = session.client_reference_id;
    const subscriptionId = session.subscription as string | null;
    const planType = session.metadata?.planType || 'CORE';

    if (!companyId || !subscriptionId) {
        throw new Error('Subscription checkout session is missing company or subscription metadata.');
    }

    await runWithRlsBypass(() => pool.query(
        `UPDATE companies
         SET stripe_subscription_id = $1,
             subscription_tier = $2,
             billing_status = 'ACTIVE',
             is_active = true,
             updated_at = NOW()
         WHERE id = $3`,
        [subscriptionId, planType, companyId],
    ));
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    const status = subscription.status === 'active' || subscription.status === 'trialing'
        ? 'ACTIVE'
        : subscription.status === 'past_due'
            ? 'PAST_DUE'
            : subscription.status === 'canceled'
                ? 'CANCELED'
                : 'UNPAID';

    await runWithRlsBypass(() => pool.query(
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
    await runWithRlsBypass(() => pool.query(
        `UPDATE companies
         SET billing_status = 'CANCELED',
             is_active = false,
             updated_at = NOW()
         WHERE stripe_subscription_id = $1`,
        [subscription.id],
    ));
}

export async function handleStripeWebhookEvent(event: Stripe.Event): Promise<{ duplicate: boolean }> {
    const tenantId = event.type === 'checkout.session.completed'
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
            case 'checkout.session.completed': {
                const session = event.data.object as Stripe.Checkout.Session;
                if (session.metadata?.invoiceId) {
                    await handleInvoiceCheckoutCompleted(session, providerEvent.event.id);
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
