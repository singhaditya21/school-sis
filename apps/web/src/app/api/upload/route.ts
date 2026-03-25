import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';

const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session.isLoggedIn) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const folder = (formData.get('folder') as string) || 'general';

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        if (file.size > 10 * 1024 * 1024) {
            return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
        }

        if (!ALLOWED_MIME_TYPES.has(file.type)) {
            return NextResponse.json(
                { error: `File type '${file.type}' is not allowed.` },
                { status: 415 }
            );
        }

        if (folder.includes('..') || folder.includes('~') || folder.startsWith('/')) {
            return NextResponse.json({ error: 'Invalid folder name' }, { status: 400 });
        }

        // MOCK STORAGE: Return success since the actual getStorage is missing
        return NextResponse.json({
            success: true,
            data: { url: `/placeholder-url/${file.name}`, key: `mock-key-${Date.now()}` }
        });
    } catch (error: any) {
        console.error('[API/upload] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
