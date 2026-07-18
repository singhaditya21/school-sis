import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { requireApiAuth } from '@/lib/auth/api';

export const dynamic = "force-dynamic";

/**
 * Receipt PDF. This previously proxied to a Java backend on localhost:8080 that
 * is no longer deployed. Set PDF_SERVICE_URL to an external renderer to re-enable
 * proxying; otherwise this returns 501 (native PDF generation is a follow-up).
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const auth = await requireApiAuth();
    if (auth.ok === false) return auth.response;

    const pdfServiceUrl = process.env.PDF_SERVICE_URL;
    if (!pdfServiceUrl) {
        return NextResponse.json(
            { error: 'Receipt PDF generation is not available in this deployment.' },
            { status: 501 },
        );
    }

    const session = await getSession();
    try {
        const response = await fetch(`${pdfServiceUrl}/api/v1/fees/receipts/${id}/pdf`, {
            headers: {
                'Authorization': `Bearer ${session.token}`,
                'X-Tenant-Id': auth.context.tenantId,
            },
        });

        if (!response.ok) {
            return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
        }

        const pdfBuffer = await response.arrayBuffer();
        return new NextResponse(pdfBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="receipt-${id}.pdf"`,
            },
        });
    } catch (error) {
        console.error('[Receipt PDF] Error:', error);
        return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 502 });
    }
}
