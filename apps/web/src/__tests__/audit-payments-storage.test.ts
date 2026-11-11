import { NextRequest } from 'next/server';

const mockPoolQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockPoolConnect = jest.fn(async () => ({
    query: mockClientQuery,
    release: mockClientRelease,
}));

jest.mock('@/lib/db', () => ({
    pool: {
        query: (...args: unknown[]) => mockPoolQuery(...args),
        connect: () => mockPoolConnect(),
    },
    sql: jest.fn(),
    RLS_BYPASS_JUSTIFICATIONS: {
        PROVIDER_PAYMENT_LOOKUP: 'PROVIDER_PAYMENT_LOOKUP',
        PROVIDER_EVENT_LEDGER: 'PROVIDER_EVENT_LEDGER',
        STRIPE_SUBSCRIPTION_UPDATE: 'STRIPE_SUBSCRIPTION_UPDATE',
    },
    runWithRlsBypass: (_justification: string, fn: () => unknown) => fn(),
    runWithTenantContext: (_tenantId: string, fn: () => unknown) => fn(),
}));

const mockRequireApiAuth = jest.fn();
jest.mock('@/lib/auth/api', () => ({
    ROLE_GROUPS: {
        platform: ['PLATFORM_ADMIN'],
        tenantAdmins: ['PLATFORM_ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN'],
        finance: ['PLATFORM_ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN', 'ACCOUNTANT', 'FINANCE_LEAD'],
        staff: [
            'PLATFORM_ADMIN',
            'SUPER_ADMIN',
            'GROUP_EXECUTIVE',
            'SCHOOL_ADMIN',
            'PRINCIPAL',
            'REGISTRAR',
            'FINANCE_LEAD',
            'ACCOUNTANT',
            'ADMISSION_COUNSELOR',
            'STUDENT_SUCCESS_COUNSELOR',
            'TEACHER',
            'TRANSPORT_MANAGER',
            'TRUST_OFFICER',
            'CREDENTIAL_OFFICER',
        ],
        parents: ['PARENT'],
    },
    requireApiAuth: (...args: unknown[]) => mockRequireApiAuth(...args),
}));

const mockGetSession = jest.fn();
jest.mock('@/lib/auth/session', () => ({
    getSession: () => mockGetSession(),
}));

const mockCanAccessStudentDocument = jest.fn();
jest.mock('@/lib/auth/document-access', () => ({
    canAccessStudentDocument: (...args: unknown[]) => mockCanAccessStudentDocument(...args),
}));

const mockConsumeRateLimit = jest.fn();
jest.mock('@/lib/auth/rate-limit', () => ({
    consumeRateLimit: (...args: unknown[]) => mockConsumeRateLimit(...args),
}));

const mockS3Send = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
    PutObjectCommand: jest.fn((input: Record<string, unknown>) => ({ input })),
    S3Client: jest.fn(() => ({ send: (...args: unknown[]) => mockS3Send(...args) })),
}));

const mockStripeCheckoutCreate = jest.fn();
const mockStripeCheckoutRetrieve = jest.fn();
const mockStripeCustomersCreate = jest.fn();
const mockStripeRefundsCreate = jest.fn();
const mockStripeAccountsCreate = jest.fn();
const mockStripeAccountLinksCreate = jest.fn();

jest.mock('stripe', () => {
    return jest.fn().mockImplementation(() => ({
        checkout: {
            sessions: {
                create: (...args: unknown[]) => mockStripeCheckoutCreate(...args),
                retrieve: (...args: unknown[]) => mockStripeCheckoutRetrieve(...args),
            },
        },
        customers: {
            create: (...args: unknown[]) => mockStripeCustomersCreate(...args),
        },
        refunds: {
            create: (...args: unknown[]) => mockStripeRefundsCreate(...args),
        },
        accounts: {
            create: (...args: unknown[]) => mockStripeAccountsCreate(...args),
        },
        accountLinks: {
            create: (...args: unknown[]) => mockStripeAccountLinksCreate(...args),
        },
        webhooks: {
            constructEvent: jest.fn(),
        },
    }));
});

const mockRequireRole = jest.fn();
jest.mock('@/lib/auth/middleware', () => ({
    requireAuth: jest.fn(),
    requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockRequireApprovedApproval = jest.fn();
const mockAssertApprovalMatches = jest.fn();
jest.mock('@school-sis/api', () => ({
    AUTHORIZATION_ROLES: {
        PLATFORM_ADMIN: 'PLATFORM_ADMIN',
        SUPER_ADMIN: 'SUPER_ADMIN',
        SCHOOL_ADMIN: 'SCHOOL_ADMIN',
    },
    assertApprovalMatchesAction: (...args: unknown[]) => mockAssertApprovalMatches(...args),
    requireApprovedWorkflowApprovalOrRequest: (...args: unknown[]) => mockRequireApprovedApproval(...args),
    toWorkflowApprovalSummary: (req: unknown) => req,
}));

import { GET as getReceiptPdf } from '@/app/api/receipts/[id]/pdf/route';
import { GET as getReportCardPdf } from '@/app/api/report-cards/[studentId]/[termId]/route';
import { POST as postStripeInvoiceCheckout } from '@/app/api/payments/stripe/route';
import { POST as postRazorpayOrder } from '@/app/api/payments/orders/route';
import { POST as postSaasCheckout } from '@/app/api/checkout/route';
import { POST as postUpload } from '@/app/api/upload/route';
import { GET as getSignedFile } from '@/app/api/files/[...path]/route';
import { buildSafeExternalPdfUrl } from '@/lib/pdf/external';
import { formatReceiptNotes } from '@/lib/pdf/receipt';
import {
    completeProviderPayment,
    findInvoiceForPayment,
    isReusablePaymentOrder,
    recordManualPayment,
    recordProviderEvent,
} from '@/lib/payments/ledger';
import { handleStripeWebhookEvent } from '@/lib/payments/stripe-webhooks';
import { buildRefundIdempotencyKey, StripeGateway } from '@/lib/payments/providers';
import { createStripeConnectAccount } from '@/lib/actions/payments';
import { refundPaymentWithApproval } from '@/lib/finance/approval-execution';
import { sql as mockedSql } from '@/lib/db';
import type Stripe from 'stripe';

const TENANT_ID = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
const STUDENT_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_STUDENT_ID = '33333333-3333-4333-8333-333333333333';
const RECEIPT_ID = '44444444-4444-4444-8444-444444444444';
const TERM_ID = '55555555-5555-4555-8555-555555555555';
const INVOICE_ID = '66666666-6666-4666-8666-666666666666';
const PAYMENT_ID = '77777777-7777-4777-8777-777777777777';
const APPROVAL_ID = '88888888-8888-4888-8888-888888888888';
const USER_ID = '99999999-9999-4999-8999-999999999999';

const ORIGINAL_ENV = process.env;
const ORIGINAL_FETCH = global.fetch;

beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
        ...ORIGINAL_ENV,
        NODE_ENV: 'test',
        NEXT_PUBLIC_APP_URL: 'https://sis.scholarmind.example.edu',
        STRIPE_SECRET_KEY: 'sk_live_real_looking_secret_value_123456',
        STRIPE_PRICE_AI_PRO: 'price_server_ai_pro_inr',
        STRIPE_PRICE_ENTERPRISE: 'price_server_enterprise_inr',
        R2_ACCOUNT_ID: 'acct-r2',
        R2_ACCESS_KEY_ID: 'r2-key',
        R2_SECRET_ACCESS_KEY: 'r2-secret-value-123456',
        R2_BUCKET_NAME: 'sis-bucket',
        PDF_SERVICE_URL: 'https://pdf-renderer.internal.example.edu',
    };
    mockConsumeRateLimit.mockResolvedValue(null);
    mockS3Send.mockResolvedValue({});
    mockGetSession.mockResolvedValue({ token: 'session-jwt', companyId: 'comp-1' });
    mockRequireApiAuth.mockResolvedValue({
        ok: true,
        context: {
            userId: USER_ID,
            tenantId: TENANT_ID,
            role: 'PARENT',
            email: 'parent@example.edu',
        },
    });
});

afterAll(() => {
    process.env = ORIGINAL_ENV;
    global.fetch = ORIGINAL_FETCH;
});

describe('C-06 & M-09: PDF authorization order, path safety, and receipt note sanitization', () => {
    it('rejects non-UUID receipt and report-card params with 400 before external PDF fetch', async () => {
        const fetchSpy = jest.fn();
        global.fetch = fetchSpy as unknown as typeof fetch;

        const badReceipt = await getReceiptPdf(
            new Request('https://sis.scholarmind.example.edu/api/receipts/../../admin/pdf'),
            { params: Promise.resolve({ id: '../../admin' }) },
        );
        expect(badReceipt.status).toBe(400);
        expect(fetchSpy).not.toHaveBeenCalled();

        const badReportCard = await getReportCardPdf(
            new Request('https://sis.scholarmind.example.edu/api/report-cards/bad/term'),
            { params: Promise.resolve({ studentId: 'not-a-uuid', termId: TERM_ID }) },
        );
        expect(badReportCard.status).toBe(400);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('never calls external PDF service when student document authorization denies access', async () => {
        const fetchSpy = jest.fn();
        global.fetch = fetchSpy as unknown as typeof fetch;

        mockPoolQuery.mockResolvedValueOnce({
            rows: [{ id: RECEIPT_ID, studentId: OTHER_STUDENT_ID, receiptNumber: 'RCP-1' }],
        });
        mockCanAccessStudentDocument.mockResolvedValueOnce(false);

        const receiptRes = await getReceiptPdf(
            new Request(`https://sis.scholarmind.example.edu/api/receipts/${RECEIPT_ID}/pdf`),
            { params: Promise.resolve({ id: RECEIPT_ID }) },
        );
        expect(receiptRes.status).toBe(404);
        expect(mockCanAccessStudentDocument).toHaveBeenCalledTimes(1);
        expect(fetchSpy).not.toHaveBeenCalled();

        mockCanAccessStudentDocument.mockResolvedValueOnce(false);
        const reportRes = await getReportCardPdf(
            new Request(`https://sis.scholarmind.example.edu/api/report-cards/${OTHER_STUDENT_ID}/${TERM_ID}`),
            { params: Promise.resolve({ studentId: OTHER_STUDENT_ID, termId: TERM_ID }) },
        );
        expect(reportRes.status).toBe(404);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('validates external PDF URLs against traversal and cross-origin escapes', () => {
        expect(buildSafeExternalPdfUrl('https://pdf.example.edu', `/api/v1/fees/receipts/${RECEIPT_ID}/pdf`)?.toString())
            .toBe(`https://pdf.example.edu/api/v1/fees/receipts/${RECEIPT_ID}/pdf`);
        expect(buildSafeExternalPdfUrl('https://pdf.example.edu', '/api/v1/../internal/secret')).toBeNull();
        expect(buildSafeExternalPdfUrl('https://pdf.example.edu', '/api/v1/%2e%2e/secret')).toBeNull();
        expect(buildSafeExternalPdfUrl('https://pdf.example.edu', '//evil.example.com/pdf')).toBeNull();
    });

    it('omits internal JSON metadata from parent-facing receipt notes while keeping human remarks', () => {
        expect(formatReceiptNotes('{"provider":"RAZORPAY","providerOrderId":"order_123","source":"client_verify"}')).toBeNull();
        expect(formatReceiptNotes('{}')).toBeNull();
        expect(formatReceiptNotes('{"remarks":"Paid via counter UPI"}')).toBe('Paid via counter UPI');
        expect(formatReceiptNotes('Quarter 1 tuition fee')).toBe('Quarter 1 tuition fee');
    });
});

describe('C-05: Stripe INR pinning, student invoice scope, Connect refund idempotency & SaaS checkout safety', () => {
    it('rejects non-INR currencies in Stripe fee checkout and ignores untrusted Origin headers', async () => {
        const usdResponse = await postStripeInvoiceCheckout(new Request('https://sis.scholarmind.example.edu/api/payments/stripe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Origin: 'https://evil-phishing.example.org',
            },
            body: JSON.stringify({ invoiceId: INVOICE_ID, currency: 'USD' }),
        }));
        expect(usdResponse.status).toBe(400);
        expect(mockStripeCheckoutCreate).not.toHaveBeenCalled();

        // Valid INR checkout uses trusted NEXT_PUBLIC_APP_URL instead of Origin header
        mockPoolQuery
            .mockResolvedValueOnce({
                rows: [{
                    id: INVOICE_ID,
                    tenantId: TENANT_ID,
                    studentId: STUDENT_ID,
                    invoiceNumber: 'INV-100',
                    totalAmount: '500.00',
                    paidAmount: '0.00',
                    status: 'PENDING',
                }],
            })
            .mockResolvedValueOnce({ rows: [] });

        mockClientQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [] }) // SELECT existing order
            .mockResolvedValueOnce({
                rows: [{
                    id: 'ord-1',
                    tenantId: TENANT_ID,
                    invoiceId: INVOICE_ID,
                    studentId: STUDENT_ID,
                    provider: 'STRIPE',
                    providerOrderId: 'cs_test_1',
                    providerPaymentId: null,
                    amount: '500.00',
                    amountMinor: 50000,
                    currency: 'INR',
                    status: 'CREATED',
                    idempotencyKey: `STRIPE:${INVOICE_ID}:50000:INR`,
                }],
            }) // INSERT order
            .mockResolvedValueOnce({}) // INSERT audit
            .mockResolvedValueOnce({}); // COMMIT

        mockStripeCheckoutCreate.mockResolvedValueOnce({
            id: 'cs_test_1',
            amount_total: 50000,
            currency: 'inr',
            status: 'open',
            url: 'https://checkout.stripe.com/c/pay/cs_test_1',
        });

        const inrResponse = await postStripeInvoiceCheckout(new Request('https://attacker-host.example.org/api/payments/stripe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Origin: 'https://evil-phishing.example.org',
            },
            body: JSON.stringify({ invoiceId: INVOICE_ID }),
        }));
        expect(inrResponse.status).toBe(200);
        expect(mockStripeCheckoutCreate).toHaveBeenCalledWith(expect.objectContaining({
            success_url: 'https://sis.scholarmind.example.edu/parent/fees?status=success',
            cancel_url: 'https://sis.scholarmind.example.edu/parent/fees?status=canceled',
        }));
    });

    it('scopes STUDENT invoice lookups strictly to students.user_id and rejects non-INR settlements', async () => {
        mockPoolQuery.mockResolvedValueOnce({ rows: [] });
        await findInvoiceForPayment(INVOICE_ID, TENANT_ID, USER_ID, 'STUDENT');

        const [sqlText, params] = mockPoolQuery.mock.calls[0] as [string, unknown[]];
        expect(sqlText).toContain('FROM students s');
        expect(sqlText).toContain('s.user_id = $3');
        expect(params).toEqual([INVOICE_ID, TENANT_ID, USER_ID]);

        await expect(
            completeProviderPayment({
                tenantId: TENANT_ID,
                invoiceId: INVOICE_ID,
                provider: 'STRIPE',
                providerPaymentId: 'pi_usd_1',
                amountMinor: 50000,
                currency: 'USD',
            }),
        ).rejects.toThrow(/only INR is accepted/i);
    });

    it('restricts SaaS subscription checkout to SUPER_ADMIN/PLATFORM_ADMIN, uses server price env vars, and never mutates subscription_tier pre-payment', async () => {
        mockRequireApiAuth.mockResolvedValueOnce({
            ok: true,
            context: {
                userId: USER_ID,
                tenantId: TENANT_ID,
                role: 'SCHOOL_ADMIN',
                email: 'principal@example.edu',
            },
        });
        const forbidden = await postSaasCheckout(new NextRequest('https://sis.scholarmind.example.edu/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ planType: 'AI_PRO', priceId: 'price_attacker_1_cent' }),
        }));
        expect(forbidden.status).toBe(403);

        mockRequireApiAuth.mockResolvedValueOnce({
            ok: true,
            context: {
                userId: USER_ID,
                tenantId: TENANT_ID,
                role: 'SUPER_ADMIN',
                email: 'super@example.edu',
            },
        });
        mockPoolQuery
            .mockResolvedValueOnce({ rows: [{ id: 'comp-1', name: 'Apex Trust', stripeCustomerId: null }] })
            .mockResolvedValueOnce({ rows: [] });
        mockStripeCustomersCreate.mockResolvedValueOnce({ id: 'cus_new_123' });
        mockStripeCheckoutCreate.mockResolvedValueOnce({ id: 'cs_sub_1', url: 'https://checkout.stripe.com/c/pay/cs_sub_1' });

        const okResponse = await postSaasCheckout(new NextRequest('https://sis.scholarmind.example.edu/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ planType: 'AI_PRO', priceId: 'price_attacker_1_cent' }),
        }));
        expect(okResponse.status).toBe(200);

        const [updateSql, updateParams] = mockPoolQuery.mock.calls[1] as [string, unknown[]];
        expect(updateSql).not.toContain('subscription_tier');
        expect(updateParams).toEqual(['cus_new_123', 'comp-1']);

        expect(mockStripeCheckoutCreate).toHaveBeenCalledWith(expect.objectContaining({
            line_items: [{ price: 'price_server_ai_pro_inr', quantity: 1 }],
            success_url: 'https://sis.scholarmind.example.edu/setup/success?session_id={CHECKOUT_SESSION_ID}',
        }));
    });

    it('passes deterministic idempotencyKey and connectedAccountId on Stripe refunds', async () => {
        mockStripeRefundsCreate.mockResolvedValueOnce({
            id: 're_123',
            amount: 25000,
            currency: 'inr',
            status: 'succeeded',
        });

        const gateway = new StripeGateway();
        await gateway.refundPayment({
            providerPaymentId: 'pi_connect_1',
            amountMinor: 25000,
            currency: 'INR',
            reason: 'Duplicate fee payment',
            connectedAccountId: 'acct_school_connect_1',
            metadata: {
                paymentId: PAYMENT_ID,
                approvalRequestId: APPROVAL_ID,
            },
        });

        expect(mockStripeRefundsCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                payment_intent: 'pi_connect_1',
                amount: 25000,
            }),
            {
                idempotencyKey: buildRefundIdempotencyKey({
                    paymentId: PAYMENT_ID,
                    approvalRequestId: APPROVAL_ID,
                    amountMinor: 25000,
                }),
                stripeAccount: 'acct_school_connect_1',
            },
        );
    });

    it('restricts createStripeConnectAccount to admin roles and uses trusted NEXT_PUBLIC_APP_URL', async () => {
        mockRequireRole.mockResolvedValueOnce({
            tenantId: TENANT_ID,
            userId: USER_ID,
            session: { role: 'PARENT' },
        });
        await expect(createStripeConnectAccount()).rejects.toThrow(/Forbidden/i);

        mockRequireRole.mockResolvedValueOnce({
            tenantId: TENANT_ID,
            userId: USER_ID,
            session: { role: 'SCHOOL_ADMIN' },
        });
        (mockedSql as unknown as jest.Mock).mockResolvedValueOnce([
            { stripe_connect_account_id: 'acct_existing_1' },
        ]);
        mockStripeAccountLinksCreate.mockResolvedValueOnce({
            url: 'https://connect.stripe.com/setup/s/acct_existing_1',
        });

        const result = await createStripeConnectAccount();
        expect(mockRequireRole).toHaveBeenLastCalledWith('PLATFORM_ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN');
        expect(mockStripeAccountLinksCreate).toHaveBeenCalledWith({
            account: 'acct_existing_1',
            refresh_url: 'https://sis.scholarmind.example.edu/settings/payments?refresh=true',
            return_url: 'https://sis.scholarmind.example.edu/settings/payments?return=true',
            type: 'account_onboarding',
        });
        expect(result.url).toBe('https://connect.stripe.com/setup/s/acct_existing_1');
    });
});

describe('H-01: S3/R2 upload RBAC, magic bytes, rate-limiting & presigned GET BOLA guards', () => {
    it('verifies file magic bytes against declared MIME types via POST /api/upload', async () => {
        mockRequireApiAuth.mockResolvedValue({
            ok: true,
            context: {
                userId: USER_ID,
                tenantId: TENANT_ID,
                role: 'SCHOOL_ADMIN',
                email: 'admin@example.edu',
            },
        });

        const validFixtures: Array<{ bytes: Uint8Array; name: string; mime: string }> = [
            { bytes: Buffer.from('%PDF-1.7\n'), name: 'doc.pdf', mime: 'application/pdf' },
            { bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]), name: 'img.png', mime: 'image/png' },
            { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), name: 'img.jpg', mime: 'image/jpeg' },
            { bytes: Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 '), name: 'img.webp', mime: 'image/webp' },
        ];

        for (const fixture of validFixtures) {
            const form = new FormData();
            form.set('folder', 'documents');
            form.set('file', new File([fixture.bytes as BlobPart], fixture.name, { type: fixture.mime }));
            const res = await postUpload(new NextRequest('https://sis.scholarmind.example.edu/api/upload', {
                method: 'POST',
                body: form,
            }));
            expect(res.status).toBe(200);
        }

        const badForm = new FormData();
        badForm.set('folder', 'documents');
        badForm.set('file', new File(['<script>window.alert(1)</script>'], 'evil.png', { type: 'image/png' }));
        const badRes = await postUpload(new NextRequest('https://sis.scholarmind.example.edu/api/upload', {
            method: 'POST',
            body: badForm,
        }));
        expect(badRes.status).toBe(415);
    });

    it('blocks PARENT uploads to admin folders, blocks unauthorized studentId, and enforces magic bytes & rate limits', async () => {
        // 1. Admin folder blocked for PARENT
        const adminFolderForm = new FormData();
        adminFolderForm.set('folder', 'logos');
        adminFolderForm.set('file', new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'logo.png', { type: 'image/png' }));
        const resAdminFolder = await postUpload(new NextRequest('https://sis.scholarmind.example.edu/api/upload', {
            method: 'POST',
            body: adminFolderForm,
        }));
        expect(resAdminFolder.status).toBe(403);

        // 2. Unauthorized studentId blocked for PARENT (BOLA)
        mockCanAccessStudentDocument.mockResolvedValueOnce(false);
        const bolaForm = new FormData();
        bolaForm.set('folder', 'homework');
        bolaForm.set('studentId', OTHER_STUDENT_ID);
        bolaForm.set('file', new File(['%PDF-1.4\nhw'], 'hw.pdf', { type: 'application/pdf' }));
        const resBola = await postUpload(new NextRequest('https://sis.scholarmind.example.edu/api/upload', {
            method: 'POST',
            body: bolaForm,
        }));
        expect(resBola.status).toBe(403);

        // 3. Disguised HTML pretending to be PDF rejected with 415
        mockCanAccessStudentDocument.mockResolvedValueOnce(true);
        const spoofForm = new FormData();
        spoofForm.set('folder', 'homework');
        spoofForm.set('studentId', STUDENT_ID);
        spoofForm.set('file', new File(['<html>evil</html>'], 'hw.pdf', { type: 'application/pdf' }));
        const resSpoof = await postUpload(new NextRequest('https://sis.scholarmind.example.edu/api/upload', {
            method: 'POST',
            body: spoofForm,
        }));
        expect(resSpoof.status).toBe(415);

        // 4. Valid authorized student upload succeeds with student-scoped key
        mockCanAccessStudentDocument.mockResolvedValueOnce(true);
        const okForm = new FormData();
        okForm.set('folder', 'homework');
        okForm.set('studentId', STUDENT_ID);
        okForm.set('file', new File(['%PDF-1.4\nhomework'], 'hw.pdf', { type: 'application/pdf' }));
        const resOk = await postUpload(new NextRequest('https://sis.scholarmind.example.edu/api/upload', {
            method: 'POST',
            body: okForm,
        }));
        const okBody = await resOk.json();
        expect(resOk.status).toBe(200);
        expect(okBody.data.key).toMatch(new RegExp(`^${TENANT_ID}/homework/${STUDENT_ID}/[0-9a-f-]+\\.pdf$`));

        // 5. Rate limit enforced
        mockConsumeRateLimit.mockResolvedValueOnce('Too many file uploads.');
        const rateLimited = await postUpload(new NextRequest('https://sis.scholarmind.example.edu/api/upload', {
            method: 'POST',
            body: okForm,
        }));
        expect(rateLimited.status).toBe(429);
    });

    it('enforces BOLA on GET /api/files/[...path] and forces attachment disposition on non-image presigned URLs', async () => {
        // Staff-only folder denied to PARENT
        const staffFolderRes = await getSignedFile(
            new NextRequest(`https://sis.scholarmind.example.edu/api/files/${TENANT_ID}/exports/all.pdf?redirect=false`),
            { params: Promise.resolve({ path: [TENANT_ID, 'exports', 'all.pdf'] }) },
        );
        expect(staffFolderRes.status).toBe(403);

        // Unscoped student folder denied to PARENT
        const unscopedRes = await getSignedFile(
            new NextRequest(`https://sis.scholarmind.example.edu/api/files/${TENANT_ID}/documents/doc.pdf?redirect=false`),
            { params: Promise.resolve({ path: [TENANT_ID, 'documents', 'doc.pdf'] }) },
        );
        expect(unscopedRes.status).toBe(403);

        // Another child's document denied to PARENT
        mockCanAccessStudentDocument.mockResolvedValueOnce(false);
        const otherChildRes = await getSignedFile(
            new NextRequest(`https://sis.scholarmind.example.edu/api/files/${TENANT_ID}/documents/${OTHER_STUDENT_ID}/doc.pdf?redirect=false`),
            { params: Promise.resolve({ path: [TENANT_ID, 'documents', OTHER_STUDENT_ID, 'doc.pdf'] }) },
        );
        expect(otherChildRes.status).toBe(403);

        // Authorized child's PDF includes signed response-content-disposition=attachment
        mockCanAccessStudentDocument.mockResolvedValueOnce(true);
        const ownChildPdf = await getSignedFile(
            new NextRequest(`https://sis.scholarmind.example.edu/api/files/${TENANT_ID}/documents/${STUDENT_ID}/doc.pdf?redirect=false`),
            { params: Promise.resolve({ path: [TENANT_ID, 'documents', STUDENT_ID, 'doc.pdf'] }) },
        );
        const pdfJson = await ownChildPdf.json();
        expect(ownChildPdf.status).toBe(200);
        expect(pdfJson.data.url).toContain('response-content-disposition=attachment');

        // Public tenant branding logo is accessible and inline-safe
        const logoRes = await getSignedFile(
            new NextRequest(`https://sis.scholarmind.example.edu/api/files/${TENANT_ID}/logos/crest.png?redirect=false`),
            { params: Promise.resolve({ path: [TENANT_ID, 'logos', 'crest.png'] }) },
        );
        const logoJson = await logoRes.json();
        expect(logoRes.status).toBe(200);
        expect(logoJson.data.url).not.toContain('response-content-disposition=attachment');
    });
});

describe('H-02, H-03 & H-04: Terminal invoice guards, webhook retry re-claim, 3-phase refund lock release & stale orders', () => {
    it('rejects payment orders and manual payments on WAIVED, CANCELLED, DRAFT, or PAID invoices', async () => {
        for (const terminalStatus of ['WAIVED', 'CANCELLED', 'DRAFT', 'PAID']) {
            mockPoolQuery.mockResolvedValueOnce({
                rows: [{
                    id: INVOICE_ID,
                    tenantId: TENANT_ID,
                    studentId: STUDENT_ID,
                    invoiceNumber: 'INV-TERM',
                    totalAmount: '1000.00',
                    paidAmount: '0.00',
                    status: terminalStatus,
                }],
            });

            const res = await postRazorpayOrder(new NextRequest('https://sis.scholarmind.example.edu/api/payments/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ invoiceId: INVOICE_ID }),
            }));
            expect(res.status).toBe(400);
        }

        mockClientQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({
                rows: [{
                    id: INVOICE_ID,
                    tenantId: TENANT_ID,
                    studentId: STUDENT_ID,
                    invoiceNumber: 'INV-WAIVED',
                    totalAmount: '1000.00',
                    paidAmount: '0.00',
                    status: 'WAIVED',
                }],
            })
            .mockResolvedValueOnce({}); // ROLLBACK

        await expect(
            recordManualPayment({
                tenantId: TENANT_ID,
                invoiceId: INVOICE_ID,
                amount: 500,
                method: 'CASH',
                actorUserId: USER_ID,
            }),
        ).rejects.toThrow(/WAIVED/);
    });

    it('preserves terminal WAIVED/CANCELLED status on late webhook settlement and preserves OVERDUE on partial payment', async () => {
        // 1. Late settlement on WAIVED invoice does not run UPDATE invoices
        mockClientQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [] }) // duplicate check
            .mockResolvedValueOnce({
                rows: [{
                    id: INVOICE_ID,
                    tenantId: TENANT_ID,
                    studentId: STUDENT_ID,
                    invoiceNumber: 'INV-WAIVED',
                    totalAmount: '1000.00',
                    paidAmount: '0.00',
                    dueDate: '2026-01-10',
                    status: 'WAIVED',
                }],
            }) // SELECT invoice FOR UPDATE
            .mockResolvedValueOnce({ rows: [{ id: PAYMENT_ID }] }) // INSERT payment
            .mockResolvedValueOnce({}) // INSERT receipt
            .mockResolvedValueOnce({}) // INSERT audit
            .mockResolvedValueOnce({}); // COMMIT

        const waivedSettlement = await completeProviderPayment({
            tenantId: TENANT_ID,
            invoiceId: INVOICE_ID,
            provider: 'RAZORPAY',
            providerPaymentId: 'pay_late_1',
            amountMinor: 50000,
            currency: 'INR',
        });
        expect(waivedSettlement.reconciliationRequired).toBe(true);
        const executedSqls = mockClientQuery.mock.calls.map((c) => String(c[0]));
        expect(executedSqls.some((s) => s.includes('UPDATE invoices'))).toBe(false);

        // 2. Partial payment on OVERDUE invoice keeps status = 'OVERDUE'
        mockClientQuery.mockClear();
        mockClientQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [] }) // duplicate check
            .mockResolvedValueOnce({
                rows: [{
                    id: INVOICE_ID,
                    tenantId: TENANT_ID,
                    studentId: STUDENT_ID,
                    invoiceNumber: 'INV-OVERDUE',
                    totalAmount: '1000.00',
                    paidAmount: '0.00',
                    dueDate: '2025-01-01',
                    status: 'PENDING',
                }],
            })
            .mockResolvedValueOnce({ rows: [{ id: PAYMENT_ID }] }) // INSERT payment
            .mockResolvedValueOnce({}) // UPDATE invoices
            .mockResolvedValueOnce({}) // INSERT receipt
            .mockResolvedValueOnce({}) // INSERT audit
            .mockResolvedValueOnce({}); // COMMIT

        await completeProviderPayment({
            tenantId: TENANT_ID,
            invoiceId: INVOICE_ID,
            provider: 'RAZORPAY',
            providerPaymentId: 'pay_partial_1',
            amountMinor: 40000,
            currency: 'INR',
        });
        const invoiceUpdateCall = mockClientQuery.mock.calls.find((c) => String(c[0]).includes('UPDATE invoices'));
        expect(invoiceUpdateCall?.[1]).toEqual(['400.00', 'OVERDUE', INVOICE_ID, TENANT_ID]);
    });

    it('re-claims FAILED or stale PROCESSING webhook events and ignores unpaid async Stripe checkout sessions', async () => {
        mockPoolQuery.mockResolvedValueOnce({
            rows: [{ id: 'evt-row-reclaimed', status: 'PROCESSING', processedAt: null }],
        });

        const reclaimed = await recordProviderEvent({
            provider: 'STRIPE',
            eventId: 'evt_retry_1',
            eventType: 'checkout.session.completed',
            tenantId: TENANT_ID,
            payload: { id: 'evt_retry_1' },
        });
        expect(reclaimed.duplicate).toBe(false);
        const [claimSql] = mockPoolQuery.mock.calls[0] as [string];
        expect(claimSql).toContain('ON CONFLICT (provider, event_id) DO UPDATE');
        expect(claimSql).toContain("payment_provider_events.status = 'FAILED'");

        // Unpaid async checkout.session.completed must NOT settle invoice
        mockPoolQuery
            .mockResolvedValueOnce({
                rows: [{ id: 'evt-unpaid', status: 'PROCESSING', processedAt: null }],
            })
            .mockResolvedValueOnce({ rows: [] }); // markProviderEventProcessed

        const unpaidEvent = {
            id: 'evt_unpaid_async',
            type: 'checkout.session.completed',
            created: 1700000000,
            livemode: false,
            data: {
                object: {
                    id: 'cs_async_unpaid',
                    payment_status: 'unpaid',
                    amount_total: 50000,
                    currency: 'inr',
                    metadata: {
                        invoiceId: INVOICE_ID,
                        tenantId: TENANT_ID,
                    },
                },
            },
        } as unknown as Stripe.Event;

        await handleStripeWebhookEvent(unpaidEvent);
        expect(mockPoolConnect).not.toHaveBeenCalled();
    });

    it('releases the DB transaction lock before calling external refund gateway (3-phase refund)', async () => {
        const paymentRow = {
            id: PAYMENT_ID,
            tenantId: TENANT_ID,
            invoiceId: INVOICE_ID,
            studentId: STUDENT_ID,
            amount: '250.00',
            method: 'ONLINE',
            status: 'COMPLETED',
            transactionId: 'pi_3phase_1',
            razorpayPaymentId: null,
            stripeConnectAccountId: 'acct_connect_99',
            refundInProgress: false,
            invoiceNumber: 'INV-300',
            invoiceTotalAmount: '500.00',
            invoicePaidAmount: '250.00',
            invoiceStatus: 'PARTIAL',
            invoiceDueDate: '2027-05-01',
        };

        mockPoolQuery.mockResolvedValueOnce({ rows: [paymentRow] }); // pre-gate snapshot
        mockRequireApprovedApproval.mockResolvedValueOnce({
            approved: true,
            request: { id: APPROVAL_ID },
        });

        // Phase 1 transaction queries + Phase 3 transaction queries
        mockClientQuery.mockImplementation(async (sqlText: string) => {
            if (sqlText.includes('FROM payments p')) {
                return { rows: [paymentRow] };
            }
            return { rows: [] };
        });

        let releaseCountDuringGatewayCall = 0;
        mockStripeRefundsCreate.mockImplementationOnce(async () => {
            releaseCountDuringGatewayCall = mockClientRelease.mock.calls.length;
            return {
                id: 're_3phase_ok',
                amount: 25000,
                currency: 'inr',
                status: 'succeeded',
            };
        });

        const result = await refundPaymentWithApproval({
            tenantId: TENANT_ID,
            paymentId: PAYMENT_ID,
            reason: 'Approved parent refund',
            approvalRequestId: APPROVAL_ID,
            actor: {
                userId: USER_ID,
                role: 'FINANCE_LEAD',
                email: 'finance@example.edu',
            },
        });

        expect(result.status).toBe('EXECUTED');
        // Phase 1 connection MUST already be committed & released before Stripe network call runs
        expect(releaseCountDuringGatewayCall).toBe(1);
        expect(mockClientRelease).toHaveBeenCalledTimes(2);
    });

    it('only reuses CREATED orders within 23 hours that carry usable provider session metadata', () => {
        const now = Date.now();
        expect(
            isReusablePaymentOrder({
                id: 'o1',
                tenantId: TENANT_ID,
                invoiceId: INVOICE_ID,
                studentId: STUDENT_ID,
                provider: 'STRIPE',
                providerOrderId: 'cs_fresh',
                providerPaymentId: null,
                amount: '100.00',
                amountMinor: 10000,
                currency: 'INR',
                status: 'CREATED',
                idempotencyKey: 'k1',
                metadata: { checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_fresh' },
                createdAt: new Date(now - 60 * 60 * 1000).toISOString(),
            }, now),
        ).toBe(true);

        // Stale (> 23 hours) Stripe session is NOT reused
        expect(
            isReusablePaymentOrder({
                id: 'o2',
                tenantId: TENANT_ID,
                invoiceId: INVOICE_ID,
                studentId: STUDENT_ID,
                provider: 'STRIPE',
                providerOrderId: 'cs_stale',
                providerPaymentId: null,
                amount: '100.00',
                amountMinor: 10000,
                currency: 'INR',
                status: 'CREATED',
                idempotencyKey: 'k1',
                metadata: { checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_stale' },
                createdAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
            }, now),
        ).toBe(false);

        // EXPIRED or missing checkoutUrl Stripe order is NOT reused
        expect(
            isReusablePaymentOrder({
                id: 'o3',
                tenantId: TENANT_ID,
                invoiceId: INVOICE_ID,
                studentId: STUDENT_ID,
                provider: 'STRIPE',
                providerOrderId: 'cs_no_url',
                providerPaymentId: null,
                amount: '100.00',
                amountMinor: 10000,
                currency: 'INR',
                status: 'CREATED',
                idempotencyKey: 'k1',
                metadata: {},
                createdAt: new Date(now - 1000).toISOString(),
            }, now),
        ).toBe(false);
    });
});
