/**
 * File Upload Service — S3-ready abstraction.
 * Uses local filesystem in dev, can swap to S3/R2/Azure Blob in production.
 * 
 * Configuration via env:
 *   STORAGE_PROVIDER=local|s3
 *   S3_BUCKET, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY (for S3 mode)
 *   UPLOAD_DIR=./uploads (for local mode)
 */

import { randomUUID } from 'crypto';
import { writeFile, mkdir, readFile, unlink } from 'fs/promises';
import path from 'path';

export interface UploadResult {
    key: string;          // Storage key (filename or S3 key)
    url: string;          // Publicly accessible URL
    size: number;
    mimeType: string;
    originalName: string;
}

export interface StorageProvider {
    upload(file: Buffer, metadata: { filename: string; mimeType: string; folder?: string }): Promise<UploadResult>;
    getUrl(key: string): Promise<string>;
    delete(key: string): Promise<void>;
}

// ─── Local Filesystem Provider ────────────────────────────
class LocalStorageProvider implements StorageProvider {
    private baseDir: string;
    private baseUrl: string;

    constructor() {
        this.baseDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
        this.baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    }

    async upload(file: Buffer, metadata: { filename: string; mimeType: string; folder?: string }): Promise<UploadResult> {
        const folder = metadata.folder || 'general';
        const ext = path.extname(metadata.filename) || '.bin';
        const key = `${folder}/${randomUUID()}${ext}`;
        const fullPath = path.join(this.baseDir, key);

        // Ensure directory exists
        await mkdir(path.dirname(fullPath), { recursive: true });
        await writeFile(fullPath, file);

        return {
            key,
            url: `${this.baseUrl}/api/files/${key}`,
            size: file.length,
            mimeType: metadata.mimeType,
            originalName: metadata.filename,
        };
    }

    async getUrl(key: string): Promise<string> {
        return `${this.baseUrl}/api/files/${key}`;
    }

    async delete(key: string): Promise<void> {
        const fullPath = path.join(this.baseDir, key);
        try { await unlink(fullPath); } catch { /* File might not exist */ }
    }

    async getFile(key: string): Promise<Buffer | null> {
        const fullPath = path.join(this.baseDir, key);
        try { return await readFile(fullPath); } catch { return null; }
    }
}

// ─── S3 Provider (stub — activate with aws-sdk) ──────────
class S3StorageProvider implements StorageProvider {
    async upload(file: Buffer, metadata: { filename: string; mimeType: string; folder?: string }): Promise<UploadResult> {
        // const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
        // const s3 = new S3Client({ region: process.env.S3_REGION });
        // const key = `${metadata.folder || 'general'}/${randomUUID()}${path.extname(metadata.filename)}`;
        // await s3.send(new PutObjectCommand({
        //     Bucket: process.env.S3_BUCKET!,
        //     Key: key,
        //     Body: file,
        //     ContentType: metadata.mimeType,
        // }));
        // return { key, url: `https://${process.env.S3_BUCKET}.s3.amazonaws.com/${key}`, ... };

        throw new Error('S3 provider requires @aws-sdk/client-s3. Install it and uncomment the code above.');
    }

    async getUrl(key: string): Promise<string> {
        return `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION}.amazonaws.com/${key}`;
    }

    async delete(key: string): Promise<void> {
        throw new Error('S3 delete not implemented');
    }
}

// ─── Factory ──────────────────────────────────────────────
let _storage: StorageProvider | null = null;

export function getStorage(): StorageProvider {
    if (!_storage) {
        const provider = process.env.STORAGE_PROVIDER || 'local';
        _storage = provider === 's3' ? new S3StorageProvider() : new LocalStorageProvider();
    }
    return _storage;
}

export function getLocalStorage(): LocalStorageProvider {
    return getStorage() as LocalStorageProvider;
}
