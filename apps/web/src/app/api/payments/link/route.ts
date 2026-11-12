import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sqlFor, withTenant } from '@/lib/db';
import { consumeRateLimit } from '@/lib/auth/rate-limit';
import { verifyInvoicePaymentToken } from '@/lib/payments/payment-links';
import {
    completeProviderPayment,
    createPaymentOrderRecord,
    getPaymentOrderByIdempotency,
    getPaymentOrderByProviderOrder,
    isPayableInvoiceStatus,
    outstandingMinor,
} from '@/lib/payments/ledger';
import {
    getRazorpayGateway,
    isRazorpayConfigured,
    resolveRazorpayRouteAccountId,
} from '@/lib/payments/providers';
import { logger } from '@/lib/observability/logger';
import { extractTrustedClientIp } from '@/lib/security/client-ip';
import { isDemoTenantCode, isDemoTenantId } from '@/lib/tenant/demo-guard';

export const dynamic = 'force-dynamic';

const LinkPaymentActionSchema = z.discriminatedUnion('action', [
    z.object({
        action: z.literal('create_order'),
        token: z.string().min(16).max(1024),
    }),
    z.object({
        action: z.literal('verify_payment'),
        token: z.string().min(16).max(1024),
        razorpayOrderId: z.string().min(1).max(128),
        razorpayPaymentId: z.string().min(1).max(128),
        razorpaySignature: z.string().regex(/^[0-9a-f]{64}$/i, 'Invalid payment signature format'),
    }),
]);

export async function POST(request: NextRequest) {
    try {
        const clientIp = extractTrustedClientIp(request.headers);
        const rateLimitMsg = await consumeRateLimit(clientIp, {
            scope: 'whatsapp_pay_link_ip',
            maxAttempts: 30,
            degradedMaxAttempts: 10,
            endpointClass: 'public-write',
            message: 'Too many payment attempts. Please wait a moment and try again.',
        });
        if (rateLimitMsg) {
            return NextResponse.json({ success: false, error: rateLimitMsg }, { status: 429 });
        }

        const rawJson = await request.json().catch(() => null);
        const parsed = LinkPaymentActionSchema.safeParse(rawJson);
        if (!parsed.success) {
            return NextResponse.json(
                { success: false, error: 'Invalid payment link request.' },
                { status: 400 },
            );
        }

        const verifiedToken = verifyInvoicePaymentToken(parsed.data.token);
        if (verifiedToken.ok === false) {
            return NextResponse.json(
                { success: false, error: verifiedToken.reason },
                { status: 403 },
            );
        }

        const { tenantId, invoiceId } = verifiedToken;

        if (await isDemoTenantId(tenantId)) {
            return NextResponse.json(
                { error: 'Live payment gateway checkout is disabled in the public demo sandbox.' },
                { status: 403 },
            );
        }

        if (!isRazorpayConfigured()) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Online UPI & card gateway credentials are not yet active for this school. Please contact the school fee desk.',
                },
                { status: 503 },
            );
        }

        const invoiceRow = await withTenant(tenantId, async (client) => {
            const q = sqlFor(client);
            return q<{
                id: string;
                tenantId: string;
                studentId: string;
                invoiceNumber: string;
                totalAmount: string;
                paidAmount: string | null;
                dueDate: string | Date | null;
                status: string;
                schoolName: string;
                tenantCode: string;
                tenantIsDemo: boolean | null;
            }>`
                SELECT
                    i.id,
                    i.tenant_id AS "tenantId",
                    i.student_id AS "studentId",
                    i.invoice_number AS "invoiceNumber",
                    i.total_amount AS "totalAmount",
                    i.paid_amount AS "paidAmount",
                    i.due_date AS "dueDate",
                    i.status,
                    t.name AS "schoolName",
                    t.code AS "tenantCode",
                    t.is_demo AS "tenantIsDemo"
                FROM invoices i
                JOIN tenants t ON t.id = i.tenant_id
                WHERE i.id = ${invoiceId}
                  AND i.tenant_id = ${tenantId}
                LIMIT 1
            `.maybeOne();
        });

        if (!invoiceRow) {
            return NextResponse.json({ success: false, error: 'Invoice not found.' }, { status: 404 });
        }

        if (Boolean(invoiceRow.tenantIsDemo) || isDemoTenantCode(invoiceRow.tenantCode)) {
            return NextResponse.json(
                { error: 'Live payment gateway checkout is disabled in the public demo sandbox.' },
                { status: 403 },
            );
        }

        if (parsed.data.action === 'create_order') {
            if (!isPayableInvoiceStatus(invoiceRow.status)) {
                return NextResponse.json(
                    { success: false, error: `Invoice is currently ${invoiceRow.status} and cannot accept payment.` },
                    { status: 400 },
                );
            }

            const amountInPaise = outstandingMinor(invoiceRow);
            if (amountInPaise <= 0) {
                return NextResponse.json(
                    { success: false, error: 'This invoice has already been paid in full.' },
                    { status: 400 },
                );
            }

            const existingOrder = await getPaymentOrderByIdempotency(
                tenantId,
                'RAZORPAY',
                invoiceRow.id,
                amountInPaise,
                'INR',
            );
            const gateway = getRazorpayGateway();

            if (existingOrder?.providerOrderId) {
                return NextResponse.json({
                    success: true,
                    data: {
                        orderId: existingOrder.providerOrderId,
                        amount: existingOrder.amountMinor,
                        currency: existingOrder.currency,
                        keyId: gateway.keyId,
                        schoolName: invoiceRow.schoolName,
                        description: `Fee Invoice ${invoiceRow.invoiceNumber}`,
                    },
                });
            }

            const routeAccountId = resolveRazorpayRouteAccountId();
            const providerOrder = await gateway.createOrder({
                amountMinor: amountInPaise,
                currency: 'INR',
                receipt: invoiceRow.invoiceNumber || invoiceRow.id,
                notes: {
                    invoiceId: invoiceRow.id,
                    tenantId,
                    studentId: invoiceRow.studentId,
                    channel: 'whatsapp_payment_link',
                },
                ...(routeAccountId
                    ? {
                        transfers: [
                            {
                                account: routeAccountId,
                                amount: amountInPaise,
                                currency: 'INR',
                                notes: {
                                    invoiceId: invoiceRow.id,
                                    tenantId,
                                },
                            },
                        ],
                    }
                    : {}),
            });

            await createPaymentOrderRecord({
                tenantId,
                invoice: invoiceRow,
                provider: 'RAZORPAY',
                amountMinor: providerOrder.amountMinor,
                currency: providerOrder.currency,
                providerOrderId: providerOrder.providerOrderId,
                createdBy: 'whatsapp_payment_link',
                metadata: {
                    channel: 'whatsapp_payment_link',
                },
            });

            return NextResponse.json({
                success: true,
                data: {
                    orderId: providerOrder.providerOrderId,
                    amount: providerOrder.amountMinor,
                    currency: providerOrder.currency,
                    keyId: providerOrder.publicKey,
                    schoolName: invoiceRow.schoolName,
                    description: `Fee Invoice ${invoiceRow.invoiceNumber}`,
                },
            });
        }

        // action === 'verify_payment'
        const order = await getPaymentOrderByProviderOrder(
            tenantId,
            'RAZORPAY',
            parsed.data.razorpayOrderId,
        );
        if (!order || order.invoiceId !== invoiceRow.id) {
            return NextResponse.json(
                { success: false, error: 'Matching payment order was not found.' },
                { status: 404 },
            );
        }

        const gateway = getRazorpayGateway();
        const sigValid = gateway.verifyPaymentSignature(
            parsed.data.razorpayOrderId,
            parsed.data.razorpayPaymentId,
            parsed.data.razorpaySignature,
        );
        if (!sigValid) {
            return NextResponse.json(
                { success: false, error: 'Payment signature verification failed.' },
                { status: 403 },
            );
        }

        const completion = await completeProviderPayment({
            tenantId,
            invoiceId: invoiceRow.id,
            provider: 'RAZORPAY',
            providerOrderId: parsed.data.razorpayOrderId,
            providerPaymentId: parsed.data.razorpayPaymentId,
            amountMinor: order.amountMinor,
            currency: order.currency,
            metadata: {
                source: 'whatsapp_link_verify',
            },
        });

        return NextResponse.json({
            success: true,
            data: {
                verified: true,
                paymentId: completion.paymentId,
                alreadyProcessed: completion.alreadyProcessed,
            },
        });
    } catch (error) {
        logger.error('payments.whatsapp_link_failed', 'WhatsApp payment link handler failed', {
            source: 'payments-link-api',
            metadata: { error: error instanceof Error ? error.message : String(error) },
        });
        return NextResponse.json(
            { success: false, error: 'Unable to process payment link request right now.' },
            { status: 500 },
        );
    }
}
