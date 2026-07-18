import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth/api';
import { validateTenantStorageKey } from '@/lib/tenant/isolation';

export const dynamic = "force-dynamic";

type PresignConfig = {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    bucket: string;
    region: string;
    host: string;
    canonicalKeyPrefix: string;
};

function strictEncode(value: string): string {
    return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
        `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    );
}

function encodeKey(key: string): string {
    return key.split('/').map(strictEncode).join('/');
}

function hashHex(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
    return crypto.createHmac('sha256', key).update(value).digest();
}

function getSigningKey(secretAccessKey: string, dateStamp: string, region: string): Buffer {
    const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
    const regionKey = hmac(dateKey, region);
    const serviceKey = hmac(regionKey, 's3');
    return hmac(serviceKey, 'aws4_request');
}

function amzTimestamp(date: Date): string {
    return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function dateStamp(date: Date): string {
    return amzTimestamp(date).slice(0, 8);
}

function canonicalQuery(params: Array<[string, string]>): string {
    return params
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${strictEncode(key)}=${strictEncode(value)}`)
        .join('&');
}

function getPresignConfig(): PresignConfig | null {
    const awsBucket = process.env.AWS_S3_BUCKET;
    const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (awsBucket && awsAccessKeyId && awsSecretAccessKey) {
        const region = process.env.AWS_REGION || 'us-east-1';
        return {
            accessKeyId: awsAccessKeyId,
            secretAccessKey: awsSecretAccessKey,
            sessionToken: process.env.AWS_SESSION_TOKEN,
            bucket: awsBucket,
            region,
            host: `${awsBucket}.s3.${region}.amazonaws.com`,
            canonicalKeyPrefix: '',
        };
    }

    const r2AccountId = process.env.R2_ACCOUNT_ID;
    const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
    const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const r2Bucket = process.env.R2_BUCKET_NAME;

    if (r2AccountId && r2AccessKeyId && r2SecretAccessKey && r2Bucket) {
        return {
            accessKeyId: r2AccessKeyId,
            secretAccessKey: r2SecretAccessKey,
            bucket: r2Bucket,
            region: 'auto',
            host: `${r2AccountId}.r2.cloudflarestorage.com`,
            canonicalKeyPrefix: `/${strictEncode(r2Bucket)}`,
        };
    }

    return null;
}

function createSignedGetUrl(key: string, expiresSeconds: number): string {
    const config = getPresignConfig();
    if (!config) {
        throw new Error('Storage signing is not configured');
    }

    const now = new Date();
    const amzDate = amzTimestamp(now);
    const scopeDate = dateStamp(now);
    const credentialScope = `${scopeDate}/${config.region}/s3/aws4_request`;
    const canonicalUri = `${config.canonicalKeyPrefix}/${encodeKey(key)}`;
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

    const canonicalRequest = [
        'GET',
        canonicalUri,
        canonicalQuery(params),
        `host:${config.host}\n`,
        'host',
        'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        hashHex(canonicalRequest),
    ].join('\n');

    const signature = crypto
        .createHmac('sha256', getSigningKey(config.secretAccessKey, scopeDate, config.region))
        .update(stringToSign)
        .digest('hex');

    params.push(['X-Amz-Signature', signature]);

    return `https://${config.host}${canonicalUri}?${canonicalQuery(params)}`;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const auth = await requireApiAuth();
    if (auth.ok === false) return auth.response;

    const { path: pathParts } = await params;

    let key: string;
    try {
        key = validateTenantStorageKey(pathParts.join('/'), auth.context.tenantId);
    } catch (error: unknown) {
        const status = (error as { message?: string }).message === 'Forbidden file path.' ? 403 : 400;
        return NextResponse.json({ error: (error as { message?: string }).message || 'Invalid file path' }, { status });
    }

    const requestedExpires = Number(request.nextUrl.searchParams.get('expires') || 300);
    const expiresSeconds = Math.min(900, Math.max(60, Number.isFinite(requestedExpires) ? requestedExpires : 300));

    let signedUrl: string;
    try {
        signedUrl = createSignedGetUrl(key, expiresSeconds);
    } catch (error: unknown) {
        return NextResponse.json({ error: (error as { message?: string }).message || 'Storage is not configured' }, { status: 503 });
    }

    if (request.nextUrl.searchParams.get('redirect') === 'false') {
        return NextResponse.json({
            success: true,
            data: {
                url: signedUrl,
                expiresIn: expiresSeconds,
            },
        });
    }

    const response = NextResponse.redirect(signedUrl, 307);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
}
