import { NextRequest, NextResponse } from 'next/server';
import { createFeePlan } from '@/lib/actions/mutations';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const result = await createFeePlan(formData);

        if (result.success) {
            return NextResponse.redirect(new URL('/fees', request.url));
        }
        return NextResponse.json({ error: 'Failed to create fee plan' }, { status: 400 });
    } catch (error: any) {
        console.error('[API/fee-plans] Error:', error);
        return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
    }
}
