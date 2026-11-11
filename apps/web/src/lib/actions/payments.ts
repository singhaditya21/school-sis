'use server';

import { sql } from '@/lib/db';
import { requireAuth, requireRole } from '@/lib/auth/middleware';
import {
    createPaymentOrderRecord,
    findInvoiceForPayment,
    getPaymentOrderByIdempotency,
    isPayableInvoiceStatus,
    outstandingMinor,
} from '@/lib/payments/ledger';
import {
    getStripeClient,
    isRazorpayConfigured,
    isStripeConfigured,
} from '@/lib/payments/providers';
import {
    buildWhatsAppFeeMessage,
    buildWhatsAppShareUrl,
    maskPhoneNumber,
    signInvoicePaymentToken,
} from '@/lib/payments/payment-links';
import { decryptFieldTolerant } from '@/lib/encryption';
import { formatCurrencyPrecise } from '@/lib/format/currency';

type MiddlewareUserRole = Parameters<typeof requireRole>[number];

const CONNECT_ADMIN_ROLES = [
    'PLATFORM_ADMIN',
    'SUPER_ADMIN',
    'SCHOOL_ADMIN',
] as unknown as readonly MiddlewareUserRole[];

function resolveTrustedOrigin(): string {
    const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (configured) {
        const parsed = new URL(configured);
        if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
            throw new Error('NEXT_PUBLIC_APP_URL must use HTTPS in production.');
        }
        return parsed.origin;
    }
    if (process.env.NODE_ENV === 'production') {
        throw new Error('NEXT_PUBLIC_APP_URL must be configured in production.');
    }
    return 'http://localhost:3000';
}

export async function createCheckoutSession(invoiceId: string) {
    const { tenantId, userId, session: authSession } = await requireAuth();

    const invoice = await findInvoiceForPayment(
        invoiceId,
        tenantId,
        userId,
        authSession.role,
    );

    if (!invoice) {
        throw new Error('Invoice not found');
    }

    if (!isPayableInvoiceStatus(invoice.status)) {
        throw new Error(`Invoice with status ${invoice.status} cannot accept payments`);
    }

    // Get tenant's Stripe Connect Account ID
    const tenantRows = await sql<{ stripe_connect_account_id: string | null }>`
        SELECT stripe_connect_account_id FROM tenants WHERE id = ${tenantId}
    `;
    if (tenantRows.length === 0 || !tenantRows[0].stripe_connect_account_id) {
        throw new Error('School has not configured payment processing yet.');
    }
    const stripeAccountId = tenantRows[0].stripe_connect_account_id;
    const amountInPaise = outstandingMinor(invoice);
    if (amountInPaise <= 0) {
        throw new Error('Invoice has no outstanding balance.');
    }

    const origin = resolveTrustedOrigin();
    const stripe = getStripeClient();
    const existingOrder = await getPaymentOrderByIdempotency(tenantId, 'STRIPE', invoice.id, amountInPaise, 'INR');
    if (existingOrder?.providerOrderId) {
        const existingSession = await stripe.checkout.sessions.retrieve(
            existingOrder.providerOrderId,
            {},
            { stripeAccount: stripeAccountId },
        );
        if (existingSession.status === 'open' && existingSession.url) {
            return { url: existingSession.url };
        }
    }

    const checkoutSession = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
            {
                price_data: {
                    currency: 'inr',
                    product_data: {
                        name: `Invoice #${invoice.invoiceNumber}`,
                    },
                    unit_amount: amountInPaise,
                },
                quantity: 1,
            },
        ],
        mode: 'payment',
        success_url: `${origin}/my-fees?success=true`,
        cancel_url: `${origin}/my-fees?canceled=true`,
        metadata: {
            invoiceId: invoice.id,
            tenantId,
            studentId: invoice.studentId,
            requestedBy: userId,
        },
    }, { stripeAccount: stripeAccountId });

    if (!checkoutSession.url) {
        throw new Error('Failed to create Stripe session');
    }

    await createPaymentOrderRecord({
        tenantId,
        invoice,
        provider: 'STRIPE',
        amountMinor: checkoutSession.amount_total || amountInPaise,
        currency: 'INR',
        providerOrderId: checkoutSession.id,
        createdBy: userId,
        metadata: {
            stripeConnectAccountId: stripeAccountId,
            checkoutUrl: checkoutSession.url,
            source: 'parent_server_action',
        },
    });

    return { url: checkoutSession.url };
}

export async function createStripeConnectAccount() {
    const { tenantId, session } = await requireRole(...CONNECT_ADMIN_ROLES);
    if (!(CONNECT_ADMIN_ROLES as readonly string[]).includes(session.role)) {
        throw new Error('Forbidden: Administrator role required to configure Stripe Connect.');
    }

    const rows = await sql<{ stripe_connect_account_id: string | null }>`
        SELECT stripe_connect_account_id FROM tenants WHERE id = ${tenantId}
    `;
    let accountId = rows[0]?.stripe_connect_account_id;

    if (!accountId) {
        const stripe = getStripeClient();
        const account = await stripe.accounts.create({ type: 'standard' });
        accountId = account.id;
        await sql`
            UPDATE tenants SET stripe_connect_account_id = ${accountId} WHERE id = ${tenantId}
        `;
    }

    const origin = resolveTrustedOrigin();

    const stripe = getStripeClient();
    const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${origin}/settings/payments?refresh=true`,
        return_url: `${origin}/settings/payments?return=true`,
        type: 'account_onboarding',
    });

    return { url: accountLink.url };
}

export async function getOnlinePaymentCapabilities(): Promise<{
    razorpayReady: boolean;
    stripeConnectReady: boolean;
}> {
    const { tenantId } = await requireAuth();
    const razorpayReady = isRazorpayConfigured();

    let stripeConnectReady = false;
    if (isStripeConfigured()) {
        const rows = await sql<{ stripe_connect_account_id: string | null }>`
            SELECT stripe_connect_account_id FROM tenants WHERE id = ${tenantId} LIMIT 1
        `;
        stripeConnectReady = Boolean(rows[0]?.stripe_connect_account_id);
    }

    return { razorpayReady, stripeConnectReady };
}

export async function generateWhatsAppPaymentLinkAction(invoiceId: string): Promise<{
    paymentUrl?: string;
    whatsappShareUrl?: string;
    messageText?: string;
    guardianPhoneMasked?: string | null;
    error?: string;
}> {
    const { tenantId } = await requireAuth('fees:read');

    const rows = await sql<{
        id: string;
        invoiceNumber: string;
        totalAmount: string;
        paidAmount: string | null;
        dueDate: string | Date | null;
        status: string;
        studentFirstName: string;
        studentLastName: string;
        schoolName: string;
        guardianPhoneRaw: string | null;
    }>`
        SELECT
            i.id,
            i.invoice_number AS "invoiceNumber",
            i.total_amount AS "totalAmount",
            i.paid_amount AS "paidAmount",
            i.due_date AS "dueDate",
            i.status,
            s.first_name AS "studentFirstName",
            s.last_name AS "studentLastName",
            t.name AS "schoolName",
            (
                SELECT COALESCE(g.phone_enc, g.phone)
                FROM guardians g
                WHERE g.student_id = s.id AND g.tenant_id = i.tenant_id
                ORDER BY g.is_primary DESC, g.created_at ASC
                LIMIT 1
            ) AS "guardianPhoneRaw"
        FROM invoices i
        JOIN students s ON s.id = i.student_id AND s.tenant_id = i.tenant_id
        JOIN tenants t ON t.id = i.tenant_id
        WHERE i.id = ${invoiceId}
          AND i.tenant_id = ${tenantId}
        LIMIT 1
    `;

    const row = rows[0];
    if (!row) {
        return { error: 'Invoice not found for this school workspace.' };
    }

    const balancePaise = outstandingMinor({
        totalAmount: row.totalAmount,
        paidAmount: row.paidAmount,
    });
    if (balancePaise <= 0 || !isPayableInvoiceStatus(row.status)) {
        return { error: 'This invoice has no payable balance.' };
    }

    const origin = resolveTrustedOrigin();
    const token = signInvoicePaymentToken({
        tenantId,
        invoiceId: row.id,
    });
    const paymentUrl = `${origin}/pay/${token}`;
    const balanceFormatted = formatCurrencyPrecise(balancePaise / 100);

    const dueDateStr = row.dueDate ? String(row.dueDate).slice(0, 10) : null;
    const decryptedPhone = row.guardianPhoneRaw ? decryptFieldTolerant(row.guardianPhoneRaw) : null;

    const messageText = buildWhatsAppFeeMessage({
        schoolName: row.schoolName,
        studentName: `${row.studentFirstName} ${row.studentLastName}`.trim(),
        invoiceNumber: row.invoiceNumber,
        amountFormatted: balanceFormatted,
        dueDate: dueDateStr,
        paymentUrl,
    });

    return {
        paymentUrl,
        whatsappShareUrl: buildWhatsAppShareUrl(decryptedPhone, messageText),
        messageText,
        guardianPhoneMasked: maskPhoneNumber(decryptedPhone),
    };
}
