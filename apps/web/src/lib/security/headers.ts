export const securityHeaders = [
    {
        key: 'X-Frame-Options',
        value: 'DENY',
    },
    {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
    },
    {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
    },
    {
        key: 'X-DNS-Prefetch-Control',
        value: 'on',
    },
    {
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
    },
    {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
    },
] as const;

export const CONTENT_SECURITY_POLICY_HEADER = 'Content-Security-Policy';
export const CONTENT_SECURITY_POLICY_REPORT_ONLY_HEADER = 'Content-Security-Policy-Report-Only';
export const CSP_REPORT_ENDPOINT = '/api/security/csp-report';

const PAYMENT_SCRIPT_SOURCES = [
    'https://js.stripe.com',
    'https://checkout.razorpay.com',
] as const;

const PAYMENT_CONNECT_SOURCES = [
    'https://api.stripe.com',
    'https://api.razorpay.com',
    'https://lumberjack.razorpay.com',
] as const;

const PAYMENT_FRAME_SOURCES = [
    'https://checkout.stripe.com',
    'https://js.stripe.com',
    'https://api.razorpay.com',
] as const;

type ContentSecurityPolicyOptions = {
    isDevelopment?: boolean;
};

function assertValidNonce(nonce: string): void {
    // CSP nonces are base64-values. Keep this strict so a future caller cannot
    // accidentally inject another directive into the response header.
    if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(nonce)) {
        throw new Error('CSP nonce contains invalid characters.');
    }
}

export function createCspNonce(): string {
    // randomUUID provides 122 bits of entropy. Removing separators leaves a
    // CSP-compatible value without relying on Node-only Buffer APIs in middleware.
    return crypto.randomUUID().replaceAll('-', '');
}

export function createContentSecurityPolicy(
    nonce: string,
    options: ContentSecurityPolicyOptions = {},
): string {
    assertValidNonce(nonce);

    const isDevelopment = options.isDevelopment ?? process.env.NODE_ENV === 'development';
    const scriptSources = [
        "'self'",
        `'nonce-${nonce}'`,
        "'strict-dynamic'",
        ...PAYMENT_SCRIPT_SOURCES,
        ...(isDevelopment ? ["'unsafe-eval'"] : []),
    ];
    const styleSources = isDevelopment
        ? ["'self'", "'unsafe-inline'"]
        : ["'self'", `'nonce-${nonce}'`];

    return [
        "default-src 'self'",
        `script-src ${scriptSources.join(' ')}`,
        "script-src-attr 'none'",
        `style-src ${styleSources.join(' ')}`,
        // React style props emit style attributes. Keep that compatibility
        // exception isolated from style elements, which require the nonce.
        "style-src-attr 'unsafe-inline'",
        "font-src 'self' data:",
        "img-src 'self' data: blob:",
        `connect-src 'self' ${PAYMENT_CONNECT_SOURCES.join(' ')}`,
        `frame-src ${PAYMENT_FRAME_SOURCES.join(' ')}`,
        "worker-src 'self' blob:",
        "manifest-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        ...(isDevelopment ? [] : ['upgrade-insecure-requests']),
        `report-uri ${CSP_REPORT_ENDPOINT}`,
    ].join('; ');
}

export function contentSecurityPolicyHeaderName(reportOnly: boolean): string {
    return reportOnly
        ? CONTENT_SECURITY_POLICY_REPORT_ONLY_HEADER
        : CONTENT_SECURITY_POLICY_HEADER;
}
