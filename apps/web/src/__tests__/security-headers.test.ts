import {
    CSP_REPORT_ENDPOINT,
    createContentSecurityPolicy,
    securityHeaders,
} from '@/lib/security/headers';

describe('security headers', () => {
    function getSecurityHeaderMap() {
        return new Map(securityHeaders.map((header) => [header.key.toLowerCase(), header.value]));
    }

    it('defines the expected security header baseline', () => {
        const headers = getSecurityHeaderMap();

        expect(headers.get('x-frame-options')).toBe('DENY');
        expect(headers.get('x-content-type-options')).toBe('nosniff');
        expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
        expect(headers.get('strict-transport-security')).toBe('max-age=63072000; includeSubDomains; preload');
        expect(headers.get('permissions-policy')).toContain('camera=()');
        expect(headers.get('permissions-policy')).toContain('microphone=()');
        expect(headers.get('permissions-policy')).toContain('geolocation=()');
        expect(headers.has('content-security-policy')).toBe(false);
    });

    it('builds a strict production nonce policy with payment-only external exceptions', () => {
        const nonce = 'productionNonce1234567890';
        const csp = createContentSecurityPolicy(nonce, { isDevelopment: false });
        const directives = new Map(csp.split('; ').map((directive) => {
            const [name, ...sources] = directive.split(' ');
            return [name, sources];
        }));

        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain("object-src 'none'");
        expect(csp).toContain("base-uri 'self'");
        expect(csp).toContain("form-action 'self'");
        expect(csp).toContain("frame-ancestors 'none'");
        expect(csp).toContain(`report-uri ${CSP_REPORT_ENDPOINT}`);
        expect(csp).not.toContain('script-src *');
        expect(csp).not.toContain('default-src *');

        expect(directives.get('script-src')).toEqual(expect.arrayContaining([
            "'self'",
            `'nonce-${nonce}'`,
            "'strict-dynamic'",
            'https://js.stripe.com',
            'https://checkout.razorpay.com',
        ]));
        expect(directives.get('script-src')).not.toContain("'unsafe-inline'");
        expect(directives.get('script-src')).not.toContain("'unsafe-eval'");
        expect(directives.get('script-src-attr')).toEqual(["'none'"]);
        expect(directives.get('style-src')).toEqual(["'self'", `'nonce-${nonce}'`]);
        expect(directives.get('style-src')).not.toContain("'unsafe-inline'");

        const externalSources = [...new Set(csp.match(/https:\/\/[^\s;]+/g) || [])].sort();
        expect(externalSources).toEqual([
            'https://api.razorpay.com',
            'https://api.stripe.com',
            'https://checkout.razorpay.com',
            'https://checkout.stripe.com',
            'https://js.stripe.com',
            'https://lumberjack.razorpay.com',
        ]);
    });

    it('retains only the documented development-time eval exception', () => {
        const csp = createContentSecurityPolicy('developmentNonce123', { isDevelopment: true });
        const scriptDirective = csp.split('; ').find((directive) => directive.startsWith('script-src '));

        expect(scriptDirective).toContain("'unsafe-eval'");
        expect(scriptDirective).not.toContain("'unsafe-inline'");
        expect(csp).not.toContain('upgrade-insecure-requests');
    });

    it('rejects a nonce that could inject another CSP directive', () => {
        expect(() => createContentSecurityPolicy("valid'; script-src *", {
            isDevelopment: false,
        })).toThrow('CSP nonce contains invalid characters.');
    });
});
