import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiPermission } from '@/lib/auth/api';
import { readTenantScopedJson } from '@/lib/tenant/isolation';
import { anonymizeStudentRecord } from '@/lib/actions/erasure';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const eraseSchema = z.object({
    // A reason is required and recorded — erasure is irreversible and auditable.
    reason: z.string().trim().min(3).max(1000),
    // A deliberate confirmation, so erasure cannot be a stray click.
    confirm: z.literal(true),
});

type RouteContext = { params: Promise<{ studentId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
    // students:archive is the admin/registrar-grade gate; erasure is at least as
    // privileged as archival.
    const auth = await requireApiPermission('students:archive');
    if (auth.ok === false) return auth.response;

    const json = await readTenantScopedJson<Record<string, unknown>>(request, auth.context.tenantId);
    if (json.ok === false) return json.response;

    const parsed = eraseSchema.safeParse(json.data);
    if (!parsed.success) {
        return NextResponse.json(
            { error: parsed.error.errors[0]?.message || 'Invalid erasure request.' },
            { status: 400 },
        );
    }

    const { studentId } = await params;
    try {
        const result = await anonymizeStudentRecord({
            tenantId: auth.context.tenantId,
            studentId,
            actorUserId: auth.context.userId,
            reason: parsed.data.reason,
        });
        return NextResponse.json(result, { status: 200 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to erase student data.';
        const status = message.includes('not found') ? 404 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
