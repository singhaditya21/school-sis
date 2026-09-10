export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function clientIpFrom(request: Request): string {
    return (request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown')
        .split(',')[0]
        .trim()
        .toLowerCase() || 'unknown';
}

function upstreamUrl(): URL | null {
    const configured = process.env.LEAD_CAPTURE_API_URL;
    if (!configured) {
        return process.env.NODE_ENV === 'production'
            ? null
            : new URL('/api/leads', 'http://127.0.0.1:3000');
    }
    try {
        const url = new URL('/api/leads', configured);
        if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') return null;
        return url;
    } catch {
        return null;
    }
}

export async function POST(request: Request) {
    const url = upstreamUrl();
    const token = process.env.LEAD_CAPTURE_PROXY_SECRET;
    if (!url || (process.env.NODE_ENV === 'production' && (!token || token.length < 32))) {
        return Response.json(
            { error: 'Demo requests are temporarily unavailable. Please contact sales directly.' },
            { status: 503, headers: { 'Cache-Control': 'no-store' } },
        );
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            body: await request.formData(),
            cache: 'no-store',
            redirect: 'error',
            signal: AbortSignal.timeout(15_000),
            headers: {
                ...(token ? { 'x-lead-capture-token': token } : {}),
                'x-forwarded-for': clientIpFrom(request),
                'x-lead-referrer': request.headers.get('referer') || '',
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
