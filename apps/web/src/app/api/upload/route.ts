import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export const dynamic = "force-dynamic";

const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
});

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

        const buffer = Buffer.from(await file.arrayBuffer());
        const key = `${folder}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

        const command = new PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET!,
            Key: key,
            Body: buffer,
            ContentType: file.type,
        });

        await s3Client.send(command);

        const url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;

        return NextResponse.json({
            success: true,
            data: { url, key }
        });
    } catch (error: any) {
        console.error('[API/upload] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
