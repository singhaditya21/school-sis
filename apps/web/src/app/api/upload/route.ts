import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from '@/lib/services/storage';
import { getSession } from '@/lib/auth/session';

/**
 * File upload API route.
 * Accepts multipart form data with a 'file' field.
 * Returns the storage key and URL.
 */
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

        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const storage = getStorage();
        const result = await storage.upload(buffer, {
            filename: file.name,
            mimeType: file.type,
            folder,
        });

        return NextResponse.json({ success: true, data: result });
    } catch (error: any) {
        console.error('[API/upload] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
