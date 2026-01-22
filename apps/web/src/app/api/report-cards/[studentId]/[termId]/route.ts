import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ studentId: string; termId: string }> }
) {
    const { studentId, termId } = await params;
    const session = await getSession();

    try {
        // Fetch report card PDF from Java API
        const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/exams/report-cards/${studentId}/${termId}/pdf`,
            {
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                },
            }
        );

        if (!response.ok) {
            return NextResponse.json({ error: 'Report card not found' }, { status: 404 });
        }

        const pdfBuffer = await response.arrayBuffer();

        return new NextResponse(pdfBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="report-card-${studentId}.pdf"`,
            },
        });
    } catch (error) {
        console.error('[Report Card PDF] Error:', error);
        return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
    }
}
