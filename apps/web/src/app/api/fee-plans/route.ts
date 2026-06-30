import { NextRequest, NextResponse } from 'next/server';
import { createFeePlan } from '@/lib/actions/mutations';
import { requireApiPermission } from '@/lib/auth/api';
import { readTenantScopedFormData } from '@/lib/tenant/isolation';

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    const auth = await requireApiPermission('fees:write');
    if (auth.ok === false) return auth.response;

    try {
        const form = await readTenantScopedFormData(request, auth.context.tenantId);
        if (form.ok === false) return form.response;

        const formData = form.data;
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
