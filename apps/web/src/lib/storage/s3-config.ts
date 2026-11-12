import crypto from 'crypto';
import { S3Client } from '@aws-sdk/client-s3';

export type ObjectStorageProvider = 'r2' | 's3';

export interface ResolvedObjectStorageConfig {
    provider: ObjectStorageProvider;
    cacheKey: string;
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    endpoint?: string;
    forcePathStyle: boolean;
    presignHost: string;
    canonicalKeyPrefix: string;
}

export interface ObjectStorageUploadClient {
    provider: ObjectStorageProvider;
    bucket: string;
    client: S3Client;
}

let cachedUploadClient: { cacheKey: string; storage: ObjectStorageUploadClient } | null = null;

function strictEncode(value: string): string {
    return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
        `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    );
}

function encodeObjectKey(key: string): string {
    return key.split('/').map(strictEncode).join('/');
}

function sha256Hex(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function hmacSha256(key: Buffer | string, value: string): Buffer {
    return crypto.createHmac('sha256', key).update(value).digest();
}

function deriveSigV4SigningKey(secretAccessKey: string, scopeDate: string, region: string): Buffer {
    const dateKey = hmacSha256(`AWS4${secretAccessKey}`, scopeDate);
    const regionKey = hmacSha256(dateKey, region);
    const serviceKey = hmacSha256(regionKey, 's3');
    return hmacSha256(serviceKey, 'aws4_request');
}

function formatAmzTimestamp(date: Date): string {
    return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function formatCanonicalQuery(params: Array<[string, string]>): string {
    return params
        .slice()
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${strictEncode(key)}=${strictEncode(value)}`)
        .join('&');
}

/**
 * Single deterministic object storage provider resolver shared by upload, download presigning,
 * and DPDP erasure blob cleanup so R2 and AWS S3 can never split-brain when both are set.
 *
 * Resolution precedence:
 *   1. Cloudflare R2 when R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME are all set.
 *   2. AWS S3 when AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY are all set.
 */
export function resolveObjectStorageConfig(): ResolvedObjectStorageConfig | null {
    const r2AccountId = process.env.R2_ACCOUNT_ID?.trim();
    const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
    const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
    const r2Bucket = process.env.R2_BUCKET_NAME?.trim();

    if (r2AccountId && r2AccessKeyId && r2SecretAccessKey && r2Bucket) {
        const host = `${r2AccountId}.r2.cloudflarestorage.com`;
        return {
            provider: 'r2',
            cacheKey: `r2:${r2AccountId}:${r2Bucket}:${r2AccessKeyId}`,
            bucket: r2Bucket,
            region: 'auto',
            accessKeyId: r2AccessKeyId,
            secretAccessKey: r2SecretAccessKey,
            endpoint: `https://${host}`,
            forcePathStyle: true,
            presignHost: host,
            canonicalKeyPrefix: `/${strictEncode(r2Bucket)}`,
        };
    }

    const awsBucket = process.env.AWS_S3_BUCKET?.trim();
    const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
    const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();

    if (awsBucket && awsAccessKeyId && awsSecretAccessKey) {
        const region = process.env.AWS_REGION?.trim() || 'us-east-1';
        const sessionToken = process.env.AWS_SESSION_TOKEN?.trim() || undefined;
        return {
            provider: 's3',
            cacheKey: `s3:${region}:${awsBucket}:${awsAccessKeyId}:${sessionToken || ''}`,
            bucket: awsBucket,
            region,
            accessKeyId: awsAccessKeyId,
            secretAccessKey: awsSecretAccessKey,
            sessionToken,
            forcePathStyle: false,
            presignHost: `${awsBucket}.s3.${region}.amazonaws.com`,
            canonicalKeyPrefix: '',
        };
    }

    return null;
}

export function getObjectStorageUploadClient(): ObjectStorageUploadClient | null {
    const resolved = resolveObjectStorageConfig();
    if (!resolved) {
        return null;
    }

    if (cachedUploadClient?.cacheKey === resolved.cacheKey) {
        return cachedUploadClient.storage;
    }

    const client = new S3Client({
        region: resolved.region,
        ...(resolved.endpoint ? { endpoint: resolved.endpoint } : {}),
        credentials: {
            accessKeyId: resolved.accessKeyId,
            secretAccessKey: resolved.secretAccessKey,
            ...(resolved.sessionToken ? { sessionToken: resolved.sessionToken } : {}),
        },
        ...(resolved.forcePathStyle ? { forcePathStyle: true } : {}),
    });

    const storage: ObjectStorageUploadClient = {
        provider: resolved.provider,
        bucket: resolved.bucket,
        client,
    };
    cachedUploadClient = { cacheKey: resolved.cacheKey, storage };
    return storage;
}

export function createPresignedObjectUrl(
    key: string,
    options?: {
        method?: 'GET' | 'DELETE';
        expiresSeconds?: number;
        responseContentDisposition?: string;
    },
): string {
    const config = resolveObjectStorageConfig();
    if (!config) {
        throw new Error('Storage signing is not configured');
    }

    const method = options?.method || 'GET';
    const expiresSeconds = options?.expiresSeconds ?? 300;
    const now = new Date();
    const amzDate = formatAmzTimestamp(now);
    const scopeDate = amzDate.slice(0, 8);
    const credentialScope = `${scopeDate}/${config.region}/s3/aws4_request`;
    const canonicalUri = `${config.canonicalKeyPrefix}/${encodeObjectKey(key)}`;

    const params: Array<[string, string]> = [
        ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
        ['X-Amz-Credential', `${config.accessKeyId}/${credentialScope}`],
        ['X-Amz-Date', amzDate],
        ['X-Amz-Expires', String(expiresSeconds)],
        ['X-Amz-SignedHeaders', 'host'],
    ];

    if (config.sessionToken) {
        params.push(['X-Amz-Security-Token', config.sessionToken]);
    }

    if (method === 'GET' && options?.responseContentDisposition) {
        params.push(['response-content-disposition', options.responseContentDisposition]);
    }

    const canonicalRequest = [
        method,
        canonicalUri,
        formatCanonicalQuery(params),
        `host:${config.presignHost}\n`,
        'host',
        'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        sha256Hex(canonicalRequest),
    ].join('\n');

    const signature = crypto
        .createHmac('sha256', deriveSigV4SigningKey(config.secretAccessKey, scopeDate, config.region))
        .update(stringToSign)
        .digest('hex');

    params.push(['X-Amz-Signature', signature]);

    return `https://${config.presignHost}${canonicalUri}?${formatCanonicalQuery(params)}`;
}

/**
 * Best-effort object deletion used after DPDP erasure transactions commit.
 */
export async function deleteStoredObjectBestEffort(key: string): Promise<boolean> {
    const config = resolveObjectStorageConfig();
    if (!config || !key) {
        return false;
    }

    try {
        const signedDeleteUrl = createPresignedObjectUrl(key, {
            method: 'DELETE',
            expiresSeconds: 60,
        });
        const response = await fetch(signedDeleteUrl, { method: 'DELETE' });
        return response.ok || response.status === 404;
    } catch {
        return false;
    }
}
