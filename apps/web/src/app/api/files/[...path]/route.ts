import { NextRequest, NextResponse } from 'next/server';
import { getLocalStorage } from '@/lib/services/storage';

/**
 * Serves uploaded files from the local filesystem.
 * In production with S3, this route would not be needed — files served directly from CDN.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path: pathParts } = await params;
    const key = pathParts.join('/');

    const storage = getLocalStorage();
    const file = await storage.getFile(key);

    if (!file) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Determine content type from extension
    const ext = key.split('.').pop()?.toLowerCase() || '';
    const mimeTypes: Record<string, string> = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf',
        doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };

    return new NextResponse(new Uint8Array(file), {
        headers: {
            'Content-Type': mimeTypes[ext] || 'application/octet-stream',
            'Cache-Control': 'public, max-age=31536000, immutable',
        },
    });
}
