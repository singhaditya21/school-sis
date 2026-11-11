import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth, ROLE_GROUPS } from '@/lib/auth/api';
import { canAccessStudentDocument } from '@/lib/auth/document-access';
import { consumeRateLimit } from '@/lib/auth/rate-limit';
import {
    createTenantStorageKey,
    normalizeStorageFolder,
    readTenantScopedFormData,
} from '@/lib/tenant/isolation';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const EXTENDED_FOLDERS = new Set(['logos', 'homework']);
const PARENT_STUDENT_UPLOAD_FOLDERS = new Set(['documents', 'homework']);
const INLINE_SAFE_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

type StorageUploadConfig = {
    client: S3Client;
    bucket: string;
};

let cachedStorageConfig: { cacheKey: string; config: StorageUploadConfig } | null = null;

function getStorageUploadConfig(): StorageUploadConfig | null {
    const r2AccountId = process.env.R2_ACCOUNT_ID;
    const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
    const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const r2Bucket = process.env.R2_BUCKET_NAME;

    if (r2AccountId && r2AccessKeyId && r2SecretAccessKey && r2Bucket) {
        const cacheKey = `r2:${r2AccountId}:${r2Bucket}:${r2AccessKeyId}`;
        if (cachedStorageConfig?.cacheKey === cacheKey) {
            return cachedStorageConfig.config;
        }
        const config: StorageUploadConfig = {
            bucket: r2Bucket,
            client: new S3Client({
                region: 'auto',
                endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
                credentials: {
                    accessKeyId: r2AccessKeyId,
                    secretAccessKey: r2SecretAccessKey,
                },
                forcePathStyle: true,
            }),
        };
        cachedStorageConfig = { cacheKey, config };
        return config;
    }

    const awsBucket = process.env.AWS_S3_BUCKET;
    const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (awsBucket && awsAccessKeyId && awsSecretAccessKey) {
        const region = process.env.AWS_REGION || 'us-east-1';
        const cacheKey = `s3:${region}:${awsBucket}:${awsAccessKeyId}`;
        if (cachedStorageConfig?.cacheKey === cacheKey) {
            return cachedStorageConfig.config;
        }
        const config: StorageUploadConfig = {
            bucket: awsBucket,
            client: new S3Client({
                region,
                credentials: {
                    accessKeyId: awsAccessKeyId,
                    secretAccessKey: awsSecretAccessKey,
                },
            }),
        };
        cachedStorageConfig = { cacheKey, config };
        return config;
    }

    return null;
}

function matchesFileMagicBytes(bytes: Uint8Array, mimeType: string): boolean {
    switch (mimeType) {
        case 'application/pdf':
            return (
                bytes.length >= 5 &&
                bytes[0] === 0x25 && // %
                bytes[1] === 0x50 && // P
                bytes[2] === 0x44 && // D
                bytes[3] === 0x46 && // F
                bytes[4] === 0x2d    // -
            );
        case 'image/png':
            return (
                bytes.length >= 4 &&
                bytes[0] === 0x89 &&
                bytes[1] === 0x50 && // P
                bytes[2] === 0x4e && // N
                bytes[3] === 0x47    // G
            );
        case 'image/jpeg':
            return (
                bytes.length >= 3 &&
                bytes[0] === 0xff &&
                bytes[1] === 0xd8 &&
                bytes[2] === 0xff
            );
        case 'image/webp':
            return (
                bytes.length >= 12 &&
                bytes[0] === 0x52 && // R
                bytes[1] === 0x49 && // I
                bytes[2] === 0x46 && // F
                bytes[3] === 0x46 && // F
                bytes[8] === 0x57 && // W
                bytes[9] === 0x45 && // E
                bytes[10] === 0x42 && // B
                bytes[11] === 0x50    // P
            );
        case 'image/gif':
            return (
                bytes.length >= 6 &&
                bytes[0] === 0x47 && // G
                bytes[1] === 0x49 && // I
                bytes[2] === 0x46 && // F
                bytes[3] === 0x38 && // 8
                (bytes[4] === 0x37 || bytes[4] === 0x39) && // 7 or 9
                bytes[5] === 0x61    // a
            );
        case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
            return (
                bytes.length >= 4 &&
                bytes[0] === 0x50 && // P
                bytes[1] === 0x4b && // K
                bytes[2] === 0x03 &&
                bytes[3] === 0x04
            );
        case 'application/vnd.ms-excel':
        case 'application/msword':
            return (
                bytes.length >= 4 &&
                bytes[0] === 0xd0 &&
                bytes[1] === 0xcf &&
                bytes[2] === 0x11 &&
                bytes[3] === 0xe0
            );
        default:
            return false;
    }
}

function parseUploadFolderAndStudent(
    rawFolder: string,
    explicitStudentId: string | null,
): { folder: string; studentId: string | null } {
    const trimmed = rawFolder.trim();
    const parts = trimmed.split('/').filter(Boolean);
    if (parts.length > 2 || trimmed.includes('..') || trimmed.includes('\\')) {
        throw new Error('Invalid upload folder.');
    }

    const baseCandidate = (parts[0] || 'documents').trim().toLowerCase();
    const folder = EXTENDED_FOLDERS.has(baseCandidate)
        ? baseCandidate
        : normalizeStorageFolder(baseCandidate);

    const pathStudentId = parts.length === 2 ? parts[1].trim() : null;
    const formStudentId = explicitStudentId?.trim() || null;
    if (pathStudentId && formStudentId && pathStudentId !== formStudentId) {
        throw new Error('Conflicting studentId in upload request.');
    }

    return {
        folder,
        studentId: formStudentId ?? pathStudentId,
    };
}

export async function POST(request: NextRequest) {
    try {
        const auth = await requireApiAuth();
        if (auth.ok === false) return auth.response;

        const rateLimitError = await consumeRateLimit(`${auth.context.tenantId}:${auth.context.userId}`, {
            scope: 'file-upload',
            maxAttempts: 20,
            degradedMaxAttempts: 5,
            endpointClass: 'authenticated-internal',
            message: 'Too many file uploads. Please try again later.',
        });
        if (rateLimitError) {
            return NextResponse.json({ error: rateLimitError }, { status: 429 });
        }

        const storage = getStorageUploadConfig();
        if (!storage) {
            return NextResponse.json({ error: 'Storage is not configured' }, { status: 503 });
        }

        const form = await readTenantScopedFormData(request, auth.context.tenantId);
        if (form.ok === false) return form.response;

        const formData = form.data;
        const file = formData.get('file') as File | null;
        const rawFolder = (formData.get('folder') as string) || 'documents';
        const rawStudentId = formData.get('studentId');
        const explicitStudentId = typeof rawStudentId === 'string' ? rawStudentId : null;

        let folder: string;
        let studentId: string | null;
        try {
            const parsedTarget = parseUploadFolderAndStudent(rawFolder, explicitStudentId);
            folder = parsedTarget.folder;
            studentId = parsedTarget.studentId;
        } catch (error: unknown) {
            return NextResponse.json(
                { error: (error as { message?: string }).message || 'Invalid upload path' },
                { status: 400 },
            );
        }

        const isParentOrStudent = auth.context.role === 'PARENT' || auth.context.role === 'STUDENT';
        const isStaffOrAdmin = (ROLE_GROUPS.staff as readonly string[]).includes(auth.context.role);

        if (isParentOrStudent) {
            if (!PARENT_STUDENT_UPLOAD_FOLDERS.has(folder)) {
                return NextResponse.json(
                    { error: `Role '${auth.context.role}' cannot upload to folder '${folder}'.` },
                    { status: 403 },
                );
            }
            if (!studentId) {
                return NextResponse.json(
                    { error: 'studentId is required for student or parent uploads.' },
                    { status: 403 },
                );
            }
            if (!UUID_RE.test(studentId)) {
                return NextResponse.json({ error: 'Invalid studentId.' }, { status: 400 });
            }
            const allowed = await canAccessStudentDocument({
                tenantId: auth.context.tenantId,
                userId: auth.context.userId,
                role: auth.context.role,
                studentId,
                staffPermission: 'students:read',
            });
            if (!allowed) {
                return NextResponse.json({ error: 'Forbidden student upload target.' }, { status: 403 });
            }
        } else if (isStaffOrAdmin) {
            if (studentId) {
                if (!UUID_RE.test(studentId)) {
                    return NextResponse.json({ error: 'Invalid studentId.' }, { status: 400 });
                }
                const allowed = await canAccessStudentDocument({
                    tenantId: auth.context.tenantId,
                    userId: auth.context.userId,
                    role: auth.context.role,
                    studentId,
                    staffPermission: 'students:read',
                });
                if (!allowed) {
                    return NextResponse.json({ error: 'Forbidden student upload target.' }, { status: 403 });
                }
            }
        } else {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        if (file.size > 10 * 1024 * 1024) {
            return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
        }

        if (!ALLOWED_MIME_TYPES.has(file.type)) {
            return NextResponse.json(
                { error: `File type '${file.type}' is not allowed.` },
                { status: 415 },
            );
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        if (!matchesFileMagicBytes(buffer, file.type)) {
            return NextResponse.json(
                { error: 'File content does not match declared MIME type.' },
                { status: 415 },
            );
        }

        let key: string;
        try {
            const templateKey = createTenantStorageKey(auth.context.tenantId, 'documents', file.name);
            const generatedFilename = templateKey.slice(`${auth.context.tenantId}/documents/`.length);
            key = studentId
                ? `${auth.context.tenantId}/${folder}/${studentId}/${generatedFilename}`
                : `${auth.context.tenantId}/${folder}/${generatedFilename}`;
        } catch (error: unknown) {
            return NextResponse.json(
                { error: (error as { message?: string }).message || 'Invalid upload path' },
                { status: 400 },
            );
        }

        const command = new PutObjectCommand({
            Bucket: storage.bucket,
            Key: key,
            Body: buffer,
            ContentType: file.type,
            ...(INLINE_SAFE_IMAGE_MIMES.has(file.type) ? {} : { ContentDisposition: 'attachment' }),
            Metadata: {
                tenantId: auth.context.tenantId,
                ...(studentId ? { studentId } : {}),
            },
        });

        await storage.client.send(command);

        const url = new URL(`/api/files/${key}`, request.url).toString();

        return NextResponse.json({
            success: true,
            data: { url, key },
        });
    } catch (error: unknown) {
        console.error('[API/upload] Error:', error);
        return NextResponse.json({ error: (error as { message?: string }).message }, { status: 500 });
    }
}
