import { NextRequest, NextResponse } from 'next/server';
import { createFeePlan } from '@/lib/actions/mutations';
import { requireApiPermission } from '@/lib/auth/api';
import { readTenantScopedFormData } from '@/lib/tenant/isolation';

export const dynamic = "force-dynamic";

/**
 * Creates a fee plan together with its components.
 *
 * Component rows are sent as parallel repeated fields — componentName,
 * componentAmount, componentFrequency, componentIsOptional ('true' | 'false') —
 * and the plan is refused unless it carries at least one mandatory component,
 * because invoicing prices from mandatory components only.
 */
export async function POST(request: NextRequest) {
    const auth = await requireApiPermission('fees:write');
    if (auth.ok === false) return auth.response;

    try {
        const form = await readTenantScopedFormData(request, auth.context.tenantId);
        if (form.ok === false) return form.response;

        const result = await createFeePlan(form.data);

        if (result.success && result.feePlanId) {
            return NextResponse.json({ feePlanId: result.feePlanId }, { status: 201 });
        }
        return NextResponse.json({ error: result.error || 'Failed to create fee plan' }, { status: 400 });
    } catch (error: unknown) {
        console.error('[API/fee-plans] Error:', error);
        return NextResponse.json({ error: (error as { message?: string }).message || 'Internal error' }, { status: 500 });
    }
}
