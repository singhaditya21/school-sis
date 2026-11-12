import crypto from 'node:crypto';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SHA40_RE = /^[0-9a-f]{40}$/i;

function timingSafeHexMatch(leftHex: string, rightHex: string): boolean {
    if (!SHA40_RE.test(leftHex) || !SHA40_RE.test(rightHex)) {
        return false;
    }
    const leftBuf = Buffer.from(leftHex.toLowerCase(), 'utf8');
    const rightBuf = Buffer.from(rightHex.toLowerCase(), 'utf8');
    return leftBuf.length === rightBuf.length && crypto.timingSafeEqual(leftBuf, rightBuf);
}

export async function GET(request?: Request) {
    const expectedSha = request?.headers?.get('x-release-expect-sha')?.trim() || '';
    const deployedSha = (process.env.VERCEL_GIT_COMMIT_SHA || '').trim();
    const deployedRegion = (process.env.VERCEL_REGION || '').trim();

    if (expectedSha && timingSafeHexMatch(expectedSha, deployedSha)) {
        return NextResponse.json(
            {
                status: 'ok',
                service: 'school-sis-website',
                commitMatched: true,
                regionMatched: deployedRegion === 'sin1',
            },
            {
                headers: {
                    'Cache-Control': 'no-store',
                },
            },
        );
    }

    return NextResponse.json(
        {
            status: 'ok',
            service: 'school-sis-website',
        },
        {
            headers: {
                'Cache-Control': 'no-store',
            },
        },
    );
}
