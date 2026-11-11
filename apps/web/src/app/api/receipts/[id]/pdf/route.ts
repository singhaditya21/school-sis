import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { requireApiAuth } from '@/lib/auth/api';
import { canAccessStudentDocument } from '@/lib/auth/document-access';
import { attachmentDisposition, fetchExternalPdf } from '@/lib/pdf/external';
import {
    findReceiptIdForPayment,
    loadReceiptForPdf,
    receiptPdfFilename,
    renderReceiptPdf,
} from '@/lib/pdf/receipt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fee receipt PDF, generated in-process with jsPDF. No external renderer is
 * required; PDF_SERVICE_URL is honoured only as an override when a deployment
 * sets it, and a failure there falls back to native generation.
 *
 * Tenant scoping and student-document authorization MUST run before any call to
 * an external PDF service so unauthenticated/unauthorized IDs never reach it.
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const auth = await requireApiAuth();
    if (auth.ok === false) return auth.response;

    if (!UUID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid receipt ID' }, { status: 400 });
    }

    try {
        let receipt = await loadReceiptForPdf(id, auth.context.tenantId);

        // Older links carried a *payment* id into this route; resolve those to
        // the receipt that was issued against the payment.
        if (!receipt) {
            const resolvedId = await findReceiptIdForPayment(id, auth.context.tenantId);
            if (resolvedId) receipt = await loadReceiptForPdf(resolvedId, auth.context.tenantId);
        }

        if (!receipt) {
            return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
        }

        // requireApiAuth only proves a session in this tenant. Without this, any
        // signed-in parent could pull another family's fee receipt.
        const allowed = await canAccessStudentDocument({
            tenantId: auth.context.tenantId,
            userId: auth.context.userId,
            role: auth.context.role,
            studentId: receipt.studentId,
            staffPermission: 'fees:read',
        });
        if (!allowed) {
            return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
        }

        const filename = receiptPdfFilename(receipt);
        const session = await getSession();
        const external = await fetchExternalPdf({
            path: `/api/v1/fees/receipts/${encodeURIComponent(receipt.id)}/pdf`,
            token: session.token ?? '',
            tenantId: auth.context.tenantId,
            label: 'Receipt PDF',
        });

        if (external) {
            return new NextResponse(external, {
                status: 200,
                headers: {
                    'Content-Type': 'application/pdf',
                    'Content-Disposition': attachmentDisposition(filename),
                    'Cache-Control': 'private, no-store',
                },
            });
        }

        const pdf = renderReceiptPdf(receipt);
        return new NextResponse(new Uint8Array(pdf), {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': attachmentDisposition(filename),
                'Content-Length': String(pdf.byteLength),
                'Cache-Control': 'private, no-store',
            },
        });
    } catch (error) {
        console.error('[Receipt PDF] Error:', error);
        return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
    }
}
