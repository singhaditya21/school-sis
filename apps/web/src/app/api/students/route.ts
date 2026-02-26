import { NextRequest, NextResponse } from 'next/server';
import { createStudent } from '@/lib/actions/mutations';
import { redirect } from 'next/navigation';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const result = await createStudent(formData);

        if (result.success) {
            return NextResponse.redirect(new URL(`/students/${result.studentId}`, request.url));
        }
        return NextResponse.json({ error: 'Failed to create student' }, { status: 400 });
    } catch (error: any) {
        console.error('[API/students] Error:', error);
        return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
    }
}
