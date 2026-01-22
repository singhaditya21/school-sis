import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const session = await getSession();

    try {
        // Fetch PDF from Java API
        const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/fees/receipts/${id}/pdf`,
            {
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                },
            }
        );

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
        return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
    }
}
