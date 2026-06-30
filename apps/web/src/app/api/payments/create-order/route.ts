import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { requireApiAuth } from '@/lib/auth/api';
import { readTenantScopedJson } from '@/lib/tenant/isolation';

export const dynamic = "force-dynamic";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

/**
 * Create a payment order via Java backend
 */
export async function POST(request: NextRequest) {
    const auth = await requireApiAuth(['PARENT', 'ACCOUNTANT', 'SCHOOL_ADMIN', 'SUPER_ADMIN', 'PLATFORM_ADMIN']);
    if (auth.ok === false) return auth.response;
    const session = await getSession();

    try {
        const json = await readTenantScopedJson<Record<string, unknown>>(request, auth.context.tenantId);
        if (json.ok === false) return json.response;

        const body = json.data;

        const response = await fetch(`${API_BASE_URL}/api/v1/payments/create-order`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.token}`,
                'X-Tenant-Id': auth.context.tenantId,
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const error = await response.text();
            return NextResponse.json(
                { error: error || 'Failed to create payment order' },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Payment order creation error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
