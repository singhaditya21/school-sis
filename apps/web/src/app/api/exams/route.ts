import { NextRequest, NextResponse } from 'next/server';
import { createExam } from '@/lib/actions/mutations';
import { requireApiPermission } from '@/lib/auth/api';
import { readTenantScopedFormData } from '@/lib/tenant/isolation';

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    const auth = await requireApiPermission('exams:write');
    if (auth.ok === false) return auth.response;

    try {
        const form = await readTenantScopedFormData(request, auth.context.tenantId);
        if (form.ok === false) return form.response;

        const formData = form.data;
        const result = await createExam(formData);

        if (result.success) {
            return NextResponse.redirect(new URL(`/exams/${result.examId}`, request.url));
        }
        return NextResponse.json({ error: 'Failed to create exam' }, { status: 400 });
    } catch (error: unknown) {
        console.error('[API/exams] Error:', error);
        return NextResponse.json({ error: (error as { message?: string }).message || 'Internal error' }, { status: 500 });
    }
}
