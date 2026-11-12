import { NextResponse } from 'next/server';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface HeaderReader {
    get(name: string): string | null;
}

/**
 * Extracts a trusted client IP address without allowing spoofed Vercel headers
 * on non-Vercel runtimes. Always returns a non-empty string (`'unknown-ip'` fallback)
 * so rate-limiting callers never fail open when proxy headers are absent.
 */
export function extractTrustedClientIp(headers: HeaderReader | null | undefined): string {
    if (!headers) {
        return 'unknown-ip';
    }

    const isVercelRuntime = process.env.VERCEL === '1';

    if (isVercelRuntime) {
        const vercelForwarded = headers.get('x-vercel-forwarded-for');
        if (vercelForwarded) {
            const candidate = vercelForwarded.split(',')[0]?.trim();
            if (candidate) return candidate.slice(0, 128);
        }
    }

    const cfConnectingIp = headers.get('cf-connecting-ip')?.trim();
    if (cfConnectingIp && process.env.TRUST_CLOUDFLARE_HEADERS === 'true') {
        return cfConnectingIp.slice(0, 128);
    }

    const realIp = headers.get('x-real-ip')?.trim();
    if (realIp && (isVercelRuntime || process.env.TRUST_PROXY_HEADERS === 'true')) {
        return realIp.slice(0, 128);
    }

    const forwardedFor = headers.get('x-forwarded-for');
    if (forwardedFor) {
        const hops = forwardedFor
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean);
        // When behind a trusted single reverse proxy or Vercel, use rightmost/edge hop appropriately;
        // otherwise take the last hop appended by the closest proxy rather than the client-controlled prefix.
        const candidate = isVercelRuntime ? hops[0] : hops[hops.length - 1];
        if (candidate) return candidate.slice(0, 128);
    }

    return 'unknown-ip';
}

/**
 * Resolves the canonical public application origin without trusting unvalidated
 * `Host` / `X-Forwarded-Host` headers in production.
 */
export function resolveTrustedAppOrigin(fallbackRequestOrigin?: string): string {
    const configured =
        process.env.NEXT_PUBLIC_APP_URL?.trim() ||
        process.env.APP_BASE_URL?.trim() ||
        (process.env.VERCEL_PROJECT_PRODUCTION_URL
            ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`
            : '') ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.trim()}` : '');

    if (configured) {
        try {
            const parsed = new URL(configured);
            if (parsed.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && parsed.protocol === 'http:')) {
                return parsed.origin;
            }
        } catch {
            // Fall through to non-production fallback below.
        }
    }

    if (process.env.NODE_ENV !== 'production' && fallbackRequestOrigin) {
        try {
            return new URL(fallbackRequestOrigin).origin;
        } catch {
            // Ignore malformed fallback.
        }
    }

    return 'https://school-sis-web.vercel.app';
}

/**
 * Enforces CSRF same-origin protection for cookie-authenticated state-changing HTTP requests.
 * Requests carrying explicit non-cookie credentials (`Authorization: Bearer ...` or `x-api-key`)
 * are exempt because browsers never attach those headers automatically across origins.
 */
export function assertSameOriginMutation(request: Request): NextResponse | null {
    const method = (request.method || 'GET').toUpperCase();
    if (SAFE_METHODS.has(method)) {
        return null;
    }

    const authHeader = request.headers.get('authorization');
    const apiKeyHeader = request.headers.get('x-api-key');
    if ((authHeader && /^Bearer\s+\S+/i.test(authHeader)) || (apiKeyHeader && apiKeyHeader.trim().length > 0)) {
        return null;
    }

    const secFetchSite = request.headers.get('sec-fetch-site')?.trim().toLowerCase();
    if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
        return NextResponse.json(
            { error: 'Cross-site state-changing request blocked by CSRF policy.' },
            { status: 403 },
        );
    }

    let requestOrigin: string;
    try {
        requestOrigin = new URL(request.url).origin;
    } catch {
        return NextResponse.json({ error: 'Invalid request URL.' }, { status: 400 });
    }

    const allowedOrigins = new Set<string>([requestOrigin]);
    const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_BASE_URL?.trim();
    if (configuredAppUrl) {
        try {
            allowedOrigins.add(new URL(configuredAppUrl).origin);
        } catch {
            // Ignore invalid env URL.
        }
    }
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
        allowedOrigins.add(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`);
    }
    if (process.env.VERCEL_URL) {
        allowedOrigins.add(`https://${process.env.VERCEL_URL.trim()}`);
    }

    const originHeader = request.headers.get('origin')?.trim();
    if (originHeader) {
        if (originHeader === 'null' || !allowedOrigins.has(originHeader)) {
            return NextResponse.json(
                { error: 'Cross-origin mutation blocked by CSRF policy.' },
                { status: 403 },
            );
        }
        return null;
    }

    const refererHeader = request.headers.get('referer')?.trim();
    if (refererHeader) {
        try {
            const refererOrigin = new URL(refererHeader).origin;
            if (!allowedOrigins.has(refererOrigin)) {
                return NextResponse.json(
                    { error: 'Cross-origin referer blocked by CSRF policy.' },
                    { status: 403 },
                );
            }
            return null;
        } catch {
            return NextResponse.json(
                { error: 'Malformed Referer header on state-changing request.' },
                { status: 403 },
            );
        }
    }

    // In production browser traffic, state-changing fetch/form requests include Origin or Sec-Fetch-Site.
    // If Sec-Fetch-Site explicitly confirmed same-origin above, allow; otherwise reject missing origin in production.
    if (secFetchSite === 'same-origin') {
        return null;
    }

    if (process.env.NODE_ENV === 'production' && !process.env.PLAYWRIGHT_TEST) {
        return NextResponse.json(
            { error: 'Origin header is required for cookie-authenticated mutations.' },
            { status: 403 },
        );
    }

    return null;
}
