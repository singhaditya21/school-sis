import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth/api';
import { loadReportCardDocument, renderReportCardPdf } from '@/lib/documents/native-pdf';

export const dynamic = "force-dynamic";

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ studentId: string; termId: string }> }
) {
    const { studentId, termId } = await params;
    const auth = await requireApiAuth();
    if (auth.ok === false) return auth.response;

    try {
        const reportCard = await loadReportCardDocument(auth.context, studentId, termId);
        if (reportCard.kind === 'forbidden') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        if (reportCard.kind === 'not_found') {
            return NextResponse.json({ error: 'Report card not found' }, { status: 404 });
        }

        const pdf = renderReportCardPdf(reportCard.data);
        return new NextResponse(pdf, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="report-card-${studentId}.pdf"`,
                'Content-Length': String(pdf.byteLength),
                'Cache-Control': 'private, no-store',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch (error) {
        console.error('[Report Card PDF] Error:', error);
        return NextResponse.json({ error: 'Failed to generate report card PDF' }, { status: 500 });
    }
}
