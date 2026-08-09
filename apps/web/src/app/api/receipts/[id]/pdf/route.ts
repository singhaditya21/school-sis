import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth/api';
import { loadReceiptDocument, renderReceiptPdf } from '@/lib/documents/native-pdf';

export const dynamic = "force-dynamic";

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const auth = await requireApiAuth();
    if (auth.ok === false) return auth.response;

    try {
        const receipt = await loadReceiptDocument(auth.context, id);
        if (receipt.kind === 'forbidden') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        if (receipt.kind === 'not_found') {
            return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
        }

        const pdf = renderReceiptPdf(receipt.data);
        return new NextResponse(pdf, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="receipt-${id}.pdf"`,
                'Content-Length': String(pdf.byteLength),
                'Cache-Control': 'private, no-store',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch (error) {
        console.error('[Receipt PDF] Error:', error);
        return NextResponse.json({ error: 'Failed to generate receipt PDF' }, { status: 500 });
    }
}
