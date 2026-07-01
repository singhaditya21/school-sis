import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'school-sis-web',
      timestamp: new Date().toISOString(),
      region: process.env.VERCEL_REGION || 'local',
      commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
