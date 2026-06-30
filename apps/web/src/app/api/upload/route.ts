import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth/api';
import { createTenantStorageKey, readTenantScopedFormData } from '@/lib/tenant/isolation';
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
        const auth = await requireApiAuth();
        if (auth.ok === false) return auth.response;

        const bucket = process.env.AWS_S3_BUCKET;
        if (!bucket) {
            return NextResponse.json({ error: 'Storage is not configured' }, { status: 503 });
        }

        const form = await readTenantScopedFormData(request, auth.context.tenantId);
        if (form.ok === false) return form.response;

        const formData = form.data;
        const file = formData.get('file') as File | null;
        const folder = (formData.get('folder') as string) || 'documents';

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

        const buffer = Buffer.from(await file.arrayBuffer());
        let key: string;
        try {
            key = createTenantStorageKey(auth.context.tenantId, folder, file.name);
        } catch (error: any) {
            return NextResponse.json({ error: error.message || 'Invalid upload path' }, { status: 400 });
        }

        const command = new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buffer,
            ContentType: file.type,
            Metadata: {
                tenantId: auth.context.tenantId,
            },
        });

        await s3Client.send(command);

        const url = `https://${bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;

        return NextResponse.json({
            success: true,
            data: { url, key }
        });
    } catch (error: any) {
        console.error('[API/upload] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
