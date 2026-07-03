import { securityHeaders } from '@/lib/security/headers';

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
    });

    it('keeps CSP payment exceptions explicit and denies dangerous defaults', () => {
        const headers = getSecurityHeaderMap();
        const csp = headers.get('content-security-policy');

        expect(csp).toBeDefined();
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain("object-src 'none'");
        expect(csp).toContain("base-uri 'self'");
        expect(csp).toContain("form-action 'self'");
        expect(csp).toContain('https://checkout.stripe.com');
        expect(csp).toContain('https://js.stripe.com');
        expect(csp).toContain('https://checkout.razorpay.com');
        expect(csp).toContain('https://api.razorpay.com');
        expect(csp).not.toContain('script-src *');
        expect(csp).not.toContain('default-src *');
    });
});
