import { NextRequest, NextResponse } from 'next/server';
import { saveAttendance } from '@/lib/actions/mutations';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const result = await saveAttendance(formData);

        if (result.success) {
            return NextResponse.redirect(new URL('/attendance', request.url));
        }
        return NextResponse.json({ error: 'Failed to save attendance' }, { status: 400 });
    } catch (error: any) {
        console.error('[API/attendance] Error:', error);
        return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
    }
}
