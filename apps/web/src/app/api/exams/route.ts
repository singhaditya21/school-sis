import { NextRequest, NextResponse } from 'next/server';
import { createExam } from '@/lib/actions/mutations';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const result = await createExam(formData);

        if (result.success) {
            return NextResponse.redirect(new URL(`/exams/${result.examId}`, request.url));
        }
        return NextResponse.json({ error: 'Failed to create exam' }, { status: 400 });
    } catch (error: any) {
        console.error('[API/exams] Error:', error);
        return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
    }
}
