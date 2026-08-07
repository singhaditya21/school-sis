import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import {
    CONTENT_SECURITY_POLICY_HEADER,
    CONTENT_SECURITY_POLICY_REPORT_ONLY_HEADER,
    CSP_REPORT_ENDPOINT,
} from '@/lib/security/headers';

const ORIGINAL_ENV = process.env;

function scriptDirective(policy: string | null): string | undefined {
    return policy?.split('; ').find((directive) => directive.startsWith('script-src '));
}

beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, NODE_ENV: 'production' };
    delete process.env.CSP_ENFORCE;
});

afterAll(() => {
    process.env = ORIGINAL_ENV;
});

describe('middleware Content Security Policy response', () => {
    it('defaults production document responses to a fresh enforced nonce policy', async () => {
        const first = await middleware(new NextRequest('https://school.example.edu/login'));
        const second = await middleware(new NextRequest('https://school.example.edu/login'));
        const firstPolicy = first.headers.get(CONTENT_SECURITY_POLICY_HEADER);
        const secondPolicy = second.headers.get(CONTENT_SECURITY_POLICY_HEADER);
        const firstScriptDirective = scriptDirective(firstPolicy);
        const firstNonce = firstPolicy?.match(/'nonce-([^']+)'/)?.[1];
        const secondNonce = secondPolicy?.match(/'nonce-([^']+)'/)?.[1];

        expect(firstPolicy).toBeTruthy();
        expect(firstScriptDirective).not.toContain("'unsafe-inline'");
        expect(firstScriptDirective).not.toContain("'unsafe-eval'");
        expect(firstPolicy).toContain(`report-uri ${CSP_REPORT_ENDPOINT}`);
        expect(first.headers.get(CONTENT_SECURITY_POLICY_REPORT_ONLY_HEADER)).toBeNull();
        expect(firstNonce).toBeTruthy();
        expect(secondNonce).toBeTruthy();
        expect(secondNonce).not.toBe(firstNonce);
        expect(first.headers.get('x-middleware-request-x-nonce')).toBe(firstNonce);
        expect(first.headers.get('x-middleware-request-content-security-policy')).toBe(firstPolicy);
    });

    it('uses report-only mode only through the explicit rollback flag', async () => {
        process.env.CSP_ENFORCE = 'false';

        const response = await middleware(new NextRequest('https://school.example.edu/login'));
        const reportOnlyPolicy = response.headers.get(CONTENT_SECURITY_POLICY_REPORT_ONLY_HEADER);

        expect(response.headers.get(CONTENT_SECURITY_POLICY_HEADER)).toBeNull();
        expect(reportOnlyPolicy).toBeTruthy();
        expect(scriptDirective(reportOnlyPolicy)).not.toContain("'unsafe-inline'");
        expect(scriptDirective(reportOnlyPolicy)).not.toContain("'unsafe-eval'");
        expect(reportOnlyPolicy).toContain(`report-uri ${CSP_REPORT_ENDPOINT}`);
    });
});
