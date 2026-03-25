import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const session = await getSession();
    if (!session.isLoggedIn) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { path: pathParts } = await params;

    // SECURITY: Path traversal protection
    for (const segment of pathParts) {
        if (
            segment === '..' ||
            segment === '.' ||
            segment.includes('..') ||
            segment.includes('~') ||
            segment.startsWith('/') ||
            segment.includes('\0')
        ) {
            return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
        }
    }

    const key = pathParts.join('/');
    if (key.includes('..') || key.startsWith('/') || key.includes('\\')) {
        return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
    }

    // Storage is currently stubbed
    return NextResponse.json({ error: 'Storage not configured' }, { status: 501 });
}
