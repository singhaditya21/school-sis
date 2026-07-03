import {
    completeProviderPayment,
    getPaymentOrderByProviderOrderAnyTenant,
    markProviderEventProcessed,
    recordProviderEvent,
} from './ledger';

type RazorpayPaymentEntity = {
    id?: string;
    order_id?: string;
    amount?: number;
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
    };
};

function paymentEntityFrom(payload: RazorpayWebhookPayload): RazorpayPaymentEntity {
    return payload.payload?.payment?.entity || {};
}

function eventIdFor(eventType: string, payment: RazorpayPaymentEntity): string {
    return `${eventType}:${payment.id || payment.order_id || 'unknown'}`;
}

function safeRazorpayPayload(payload: RazorpayWebhookPayload, payment: RazorpayPaymentEntity): Record<string, unknown> {
    return {
        event: payload.event,
        paymentId: payment.id,
        orderId: payment.order_id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
    };
}

export async function handleRazorpayWebhookPayload(
    payload: RazorpayWebhookPayload,
): Promise<{ duplicate: boolean }> {
    const eventType = payload.event || 'unknown';
    const payment = paymentEntityFrom(payload);
    const providerOrderId = payment.order_id;

    const order = providerOrderId
        ? await getPaymentOrderByProviderOrderAnyTenant('RAZORPAY', providerOrderId)
        : null;

    const providerEvent = await recordProviderEvent({
        provider: 'RAZORPAY',
        eventId: eventIdFor(eventType, payment),
        eventType,
        tenantId: order?.tenantId || null,
        payload: safeRazorpayPayload(payload, payment),
    });

    if (providerEvent.duplicate) {
        return { duplicate: true };
    }

    try {
        if (eventType === 'payment.captured') {
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
