/**
 * Cloudflare R2 Storage Adapter
 *
 * S3-compatible object storage for file uploads.
 * Replaces local filesystem storage with cloud storage.
 *
 * Required env vars:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 */

import crypto from 'crypto';
import path from 'path';

interface R2Config {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
}

// ─── Allowlisted upload folders ─────────────────────────────
const ALLOWED_FOLDERS = new Set([
    'documents', 'avatars', 'reports', 'invoices',
    'certificates', 'id-cards', 'attachments', 'exports',
    'general',
]);

/**
 * Validates an R2 object key against path traversal and injection attacks.
 *
 * Security checks:
 * - Rejects `..` sequences in any form (URL-encoded, unicode, backslash)
 * - Rejects absolute path prefixes
 * - Rejects null bytes
 * - Enforces allowlisted folder segment
 * - Ensures key stays within a tenant-scoped prefix
 */
function validateObjectKey(key: string, tenantId: string): void {
    // Normalise before checking to catch URL-encoded variants like %2F, %2e%2e
    let decoded: string;
    try {
        decoded = decodeURIComponent(key);
    } catch {
        throw new Error(`[Storage] Invalid object key encoding: ${key}`);
    }
    const normalised = path.posix.normalize(decoded);

    const dangers = [
        /\.\./,           // traversal: ../
        /^\/|^\\/,        // absolute path
        // eslint-disable-next-line no-control-regex
        /\x00/,           // null byte injection
        /\\/,             // Windows separator
    ];

    for (const pattern of dangers) {
        if (pattern.test(normalised)) {
            throw new Error(
                `[Storage] Invalid object key — path traversal or injection detected: ${key}`
            );
        }
    }

    // Key must begin with the tenantId prefix
    if (!normalised.startsWith(`${tenantId}/`)) {
        throw new Error(`[Storage] Object key must be scoped to tenant: ${tenantId}`);
    }

    // Second segment must be an allowlisted folder
    const segments = normalised.split('/');
    const folder = segments[1]; // tenantId / folder / filename
    if (!folder || !ALLOWED_FOLDERS.has(folder)) {
        throw new Error(`[Storage] Upload folder '${folder}' is not in the allowlist`);
    }
}

function getR2Config(): R2Config {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucketName = process.env.R2_BUCKET_NAME || 'scholarmind-uploads';

    if (!accountId || !accessKeyId || !secretAccessKey) {
        throw new Error(
            'R2 storage not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.'
        );
    }

    return { accountId, accessKeyId, secretAccessKey, bucketName };
}

function getEndpoint(config: R2Config): string {
    return `https://${config.accountId}.r2.cloudflarestorage.com`;
}

/**
 * Upload a file buffer to R2.
 */
export async function uploadFile(
    key: string,
    body: Buffer | Uint8Array,
    contentType: string,
    tenantId: string,
): Promise<{ url: string; key: string; size: number }> {
    // Security: validate key before use
    validateObjectKey(key, tenantId);

    const config = getR2Config();
    const endpoint = getEndpoint(config);
    const url = `${endpoint}/${config.bucketName}/${key}`;

    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            'Content-Type': contentType,
            'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
            'x-amz-meta-tenant-id': tenantId,
        },
        body,
    });

    if (!response.ok) {
        throw new Error(`R2 upload failed: ${response.status} ${response.statusText}`);
    }

    return { url, key, size: body.length };
}

/**
 * Delete a file from R2. Requires tenantId for key validation.
 */
export async function deleteFile(key: string, tenantId: string): Promise<void> {
    // Security: validate key before use
    validateObjectKey(key, tenantId);

    const config = getR2Config();
    const endpoint = getEndpoint(config);
    const url = `${endpoint}/${config.bucketName}/${key}`;

    await fetch(url, { method: 'DELETE' });
}

/**
 * Generate a tenant-scoped file key.
 * Format: {tenantId}/{folder}/{uuid}.{ext}
 *
 * Only allowlisted folder names are accepted.
 */
export function generateFileKey(
    tenantId: string,
    folder: string,
    originalFilename: string,
): string {
    if (!ALLOWED_FOLDERS.has(folder)) {
        throw new Error(`[Storage] Folder '${folder}' is not in the allowlist`);
    }

    // Only preserve the extension — never use the original filename directly
    const rawExt = path.extname(originalFilename).toLowerCase().replace(/[^a-z0-9]/g, '');
    const ext = rawExt.length > 0 && rawExt.length <= 5 ? rawExt : 'bin';
    const uuid = crypto.randomUUID();
    return `${tenantId}/${folder}/${uuid}.${ext}`;
}
