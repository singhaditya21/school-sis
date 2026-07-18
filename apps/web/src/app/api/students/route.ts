import { NextRequest, NextResponse } from 'next/server';
import { createStudent } from '@/lib/actions/mutations';
import { requireApiPermission } from '@/lib/auth/api';
import { readTenantScopedFormData } from '@/lib/tenant/isolation';

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    const auth = await requireApiPermission('students:write');
    if (auth.ok === false) return auth.response;

    try {
        const form = await readTenantScopedFormData(request, auth.context.tenantId);
        if (form.ok === false) return form.response;

        const formData = form.data;
        const result = await createStudent(formData);

        if (result.success) {
            return NextResponse.redirect(new URL(`/students/${result.studentId}`, request.url));
        }
        return NextResponse.json({ error: 'Failed to create student' }, { status: 400 });
    } catch (error: unknown) {
        console.error('[API/students] Error:', error);
        return NextResponse.json({ error: (error as { message?: string }).message || 'Internal error' }, { status: 500 });
    }
}
