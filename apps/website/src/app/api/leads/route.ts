export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BODY_BYTES = 64 * 1024; // 64 KB cap
const MAX_FORM_FIELDS = 32;
const MAX_FIELD_NAME_LENGTH = 64;
const MAX_FIELD_VALUE_LENGTH = 4096;

class LeadValidationError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

function firstIpFromHeader(headerValue: string | null): string | null {
    if (!headerValue) return null;
    const candidate = headerValue
        .split(',')[0]
        .trim()
        .replace(/[\r\n\0]/g, '')
        .slice(0, 64)
        .toLowerCase();
    return candidate || null;
}

function clientIpFrom(request: Request): string {
    const vercelIp = firstIpFromHeader(request.headers.get('x-vercel-forwarded-for'));
    if (vercelIp) return vercelIp;

    const realIp = firstIpFromHeader(request.headers.get('x-real-ip'));
    if (realIp) return realIp;

    if (process.env.NODE_ENV !== 'production') {
        const devForwardedIp = firstIpFromHeader(request.headers.get('x-forwarded-for'));
        if (devForwardedIp) return devForwardedIp;
    }

    return 'unknown';
}

function isLoopbackHostname(hostname: string): boolean {
    const normalized = hostname.trim().toLowerCase();
    return (
        normalized === 'localhost'
        || normalized === '127.0.0.1'
        || normalized === '::1'
        || normalized === '[::1]'
    );
}

function isLocalLoopbackAllowed(hostname: string): boolean {
    return (
        (process.env.NODE_ENV !== 'production' || process.env.PLAYWRIGHT_TEST === '1')
        && isLoopbackHostname(hostname)
    );
}

function isAllowedOrigin(request: Request): boolean {
    const secFetchSite = request.headers.get('sec-fetch-site');
    if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
        return false;
    }

    const originHeader = request.headers.get('origin');
    if (!originHeader || originHeader === 'null') {
        return false;
    }

    let requestOrigin: URL;
    try {
        requestOrigin = new URL(originHeader);
    } catch {
        return false;
    }

    if (
        process.env.NODE_ENV === 'production'
        && requestOrigin.protocol !== 'https:'
        && !isLocalLoopbackAllowed(requestOrigin.hostname)
    ) {
        return false;
    }

    const allowedOrigins = new Set<string>();
    try {
        const internalUrl = new URL(request.url);
        allowedOrigins.add(internalUrl.origin);
        const hostHeader = (request.headers.get('host') || '').trim();
        if (hostHeader && /^[a-z0-9.:[\]-]+$/i.test(hostHeader)) {
            allowedOrigins.add(`${internalUrl.protocol}//${hostHeader}`);
        }
    } catch {
        // Ignore malformed internal request URL
    }

    const configuredSiteUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').trim();
    if (configuredSiteUrl) {
        try {
            allowedOrigins.add(new URL(configuredSiteUrl).origin);
        } catch {
            // Ignore misconfigured NEXT_PUBLIC_SITE_URL
        }
    }

    return allowedOrigins.has(requestOrigin.origin);
}

async function parseBoundedFormData(request: Request): Promise<FormData> {
    const contentLengthHeader = request.headers.get('content-length');
    if (contentLengthHeader !== null) {
        const declaredLength = Number(contentLengthHeader);
        if (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > MAX_BODY_BYTES) {
            throw new LeadValidationError('Submission payload exceeds the 64 KB size limit.', 413);
        }
    }

    if (!request.body) {
        throw new LeadValidationError('Form submission payload is required.', 400);
    }

    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
            totalBytes += value.byteLength;
            if (totalBytes > MAX_BODY_BYTES) {
                await reader.cancel().catch(() => {});
                throw new LeadValidationError('Submission payload exceeds the 64 KB size limit.', 413);
            }
            chunks.push(value);
        }
    }

    const rawBody = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        rawBody.set(chunk, offset);
        offset += chunk.byteLength;
    }

    let parsed: FormData;
    try {
        const synthetic = new Request(request.url, {
            method: 'POST',
            headers: request.headers,
            body: rawBody,
        });
        parsed = await synthetic.formData();
    } catch {
        throw new LeadValidationError('Malformed form submission.', 400);
    }

    const sanitized = new FormData();
    let fieldCount = 0;

    for (const [key, value] of parsed.entries()) {
        fieldCount += 1;
        if (fieldCount > MAX_FORM_FIELDS) {
            throw new LeadValidationError('Too many form fields submitted.', 400);
        }
        if (!key || key.length > MAX_FIELD_NAME_LENGTH) {
            throw new LeadValidationError('Invalid form field name.', 400);
        }
        if ((typeof File !== 'undefined' && value instanceof File) || typeof value !== 'string') {
            throw new LeadValidationError('File attachments are not permitted on enquiry forms.', 400);
        }
        if (value.length > MAX_FIELD_VALUE_LENGTH) {
            throw new LeadValidationError(`Field "${key}" exceeds maximum allowed length.`, 400);
        }
        sanitized.append(key, value);
    }

    return sanitized;
}

function upstreamUrl(): URL | null {
    const configured = process.env.LEAD_CAPTURE_API_URL;
    if (!configured) {
        return process.env.NODE_ENV === 'production' && process.env.PLAYWRIGHT_TEST !== '1'
            ? null
            : new URL('/api/leads', 'http://127.0.0.1:3000');
    }
    try {
        const url = new URL('/api/leads', configured);
        if (
            process.env.NODE_ENV === 'production'
            && url.protocol !== 'https:'
            && !isLocalLoopbackAllowed(url.hostname)
        ) {
            return null;
        }
        return url;
    } catch {
        return null;
    }
}

export async function POST(request: Request) {
    if (!isAllowedOrigin(request)) {
        return Response.json(
            { error: 'Cross-origin enquiry submissions are not permitted.' },
            { status: 403, headers: { 'Cache-Control': 'no-store' } },
        );
    }

    const url = upstreamUrl();
    const token = (process.env.LEAD_CAPTURE_PROXY_SECRET || process.env.LEAD_PROXY_TOKEN || '').trim();
    if (!url || (process.env.NODE_ENV === 'production' && (!token || token.length < 32))) {
        return Response.json(
            { error: 'Demo requests are temporarily unavailable. Please contact sales directly.' },
            { status: 503, headers: { 'Cache-Control': 'no-store' } },
        );
    }

    let formData: FormData;
    try {
        formData = await parseBoundedFormData(request);
    } catch (err) {
        if (err instanceof LeadValidationError) {
            return Response.json(
                { error: err.message },
                { status: err.status, headers: { 'Cache-Control': 'no-store' } },
            );
        }
        return Response.json(
            { error: 'Invalid form submission.' },
            { status: 400, headers: { 'Cache-Control': 'no-store' } },
        );
    }

    const clientIp = clientIpFrom(request);
    const referrer = (request.headers.get('referer') || '').replace(/[\r\n\0]/g, '').slice(0, 512);

    try {
        const response = await fetch(url, {
            method: 'POST',
            body: formData,
            cache: 'no-store',
            redirect: 'error',
            signal: AbortSignal.timeout(15_000),
            headers: {
                ...(token
                    ? {
                          'x-lead-proxy-token': token,
                          'x-lead-capture-token': token,
                      }
                    : {}),
                'x-lead-client-ip': clientIp,
                'x-forwarded-for': clientIp,
                'x-lead-referrer': referrer,
            },
        });
        return new Response(await response.text(), {
            status: response.status,
            headers: {
                'Cache-Control': 'no-store',
                'Content-Type': response.headers.get('content-type') || 'application/json',
            },
        });
    } catch {
        return Response.json(
            { error: 'Demo requests are temporarily unavailable. Please contact sales directly.' },
            { status: 502, headers: { 'Cache-Control': 'no-store' } },
        );
    }
}
