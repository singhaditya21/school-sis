import { NextRequest, NextResponse } from 'next/server';
import { recordPayment } from '@/lib/actions/mutations';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const result = await recordPayment(formData);

        if (result.success) {
            const invoiceId = formData.get('invoiceId') as string;
            return NextResponse.redirect(new URL(`/invoices/${invoiceId}`, request.url));
        }
        return NextResponse.json({ error: 'Failed to record payment' }, { status: 400 });
    } catch (error: any) {
        console.error('[API/payments] Error:', error);
        return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
    }
}
