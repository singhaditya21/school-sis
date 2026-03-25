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

interface R2Config {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
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
 * Delete a file from R2.
 */
export async function deleteFile(key: string): Promise<void> {
    const config = getR2Config();
    const endpoint = getEndpoint(config);
    const url = `${endpoint}/${config.bucketName}/${key}`;

    await fetch(url, { method: 'DELETE' });
}

/**
 * Generate a tenant-scoped file key.
 * Format: {tenantId}/{folder}/{uuid}.{ext}
 */
export function generateFileKey(
    tenantId: string,
    folder: string,
    originalFilename: string,
): string {
    const ext = originalFilename.split('.').pop() || 'bin';
    const uuid = crypto.randomUUID();
    return `${tenantId}/${folder}/${uuid}.${ext}`;
}
