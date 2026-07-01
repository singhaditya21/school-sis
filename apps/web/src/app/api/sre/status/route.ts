import { NextResponse } from 'next/server';
import { requireBearerServiceAuth } from '@/lib/auth/api';
import { collectOperationalSnapshot } from '@/lib/observability/snapshot';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authError = requireBearerServiceAuth(request, 'METRICS_TOKEN', {
    serviceName: 'SRE status endpoint',
    required: process.env.NODE_ENV === 'production',
  });
  if (authError) return authError;

  const snapshot = await collectOperationalSnapshot();
  return NextResponse.json(
    { snapshot },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
