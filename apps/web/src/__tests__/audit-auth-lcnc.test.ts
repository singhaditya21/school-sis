import fs from 'fs';
import path from 'path';
import { sanitizeCsvValue } from '@/lib/utils/csv-sanitize';
import { deriveTenantInboundWebhookToken } from '@/lib/metadata/inbound-webhook';
import {
    isSafeWebhookDestinationUrl,
    normalizeMetadataFieldInput,
    renderMetadataDocumentTemplate,
} from '@/lib/metadata/platform';
import { getPageAccessPolicy, isRoleAllowedForPage } from '@/lib/auth/page-access';
import { AUTHORIZATION_ROLE_PERMISSIONS } from '@school-sis/api/src/authorization/policy';

describe('Full Codebase Audit Remediation — Auth, RBAC, LCNC, Webhooks & CSV (C-01..C-04, C-07, C-08, H-06..H-11, M-04..M-06, M-10)', () => {
    describe('M-10: Spreadsheet Formula Injection (CSV Sanitization)', () => {
        it('prefixes leading formula triggers with a single quote while preserving negative numbers', () => {
            expect(sanitizeCsvValue('=CMD|\' /C calc\'!A0')).toBe("'=CMD|' /C calc'!A0");
            expect(sanitizeCsvValue('+SUM(A1:A2)')).toBe("'+SUM(A1:A2)");
            expect(sanitizeCsvValue('@HYPERLINK("https://evil.example")')).toBe(
                '"\'@HYPERLINK(""https://evil.example"")"',
            );
            expect(sanitizeCsvValue('\t=1+1')).toBe("'\t=1+1");
            expect(sanitizeCsvValue('-HYPERLINK("http://x")')).toBe('"\'-HYPERLINK(""http://x"")"');
            // Legitimate negative currency/numeric literals must remain unprefixed
            expect(sanitizeCsvValue('-1250.50')).toBe('-1250.50');
            expect(sanitizeCsvValue(-42)).toBe('-42');
            expect(sanitizeCsvValue(null)).toBe('');
        });
    });

    describe('C-07 & H-08: Inbound Tenant-Bound HMAC & Outbound SSRF / ReDoS Guards', () => {
        it('derives distinct cryptographic tokens per tenant from INBOUND_WEBHOOK_SECRET', () => {
            const secret = 'test-inbound-webhook-secret-at-least-32-chars!!';
            const tenantA = '11111111-1111-4111-8111-111111111111';
            const tenantB = '22222222-2222-4222-8222-222222222222';
            const tokenA = deriveTenantInboundWebhookToken(secret, tenantA);
            const tokenB = deriveTenantInboundWebhookToken(secret, tenantB);

            expect(tokenA).toHaveLength(64);
            expect(tokenB).toHaveLength(64);
            expect(tokenA).not.toBe(tokenB);
            expect(deriveTenantInboundWebhookToken(secret, tenantA.toUpperCase())).toBe(tokenA);
        });

        it('blocks IPv4-mapped IPv6, CGNAT, ULA IPv6, loopback, and metadata destinations in isSafeWebhookDestinationUrl', () => {
            expect(isSafeWebhookDestinationUrl('https://hooks.zapier.com/hooks/catch/123/abc')).toBe(true);
            expect(isSafeWebhookDestinationUrl('http://hooks.zapier.com/hooks/catch/123/abc')).toBe(false);
            expect(isSafeWebhookDestinationUrl('https://127.0.0.1/hook')).toBe(false);
            expect(isSafeWebhookDestinationUrl('https://100.64.0.1/hook')).toBe(false);
            expect(isSafeWebhookDestinationUrl('https://100.127.255.254/hook')).toBe(false);
            expect(isSafeWebhookDestinationUrl('https://[::ffff:127.0.0.1]/hook')).toBe(false);
            expect(isSafeWebhookDestinationUrl('https://[::ffff:7f00:1]/hook')).toBe(false);
            expect(isSafeWebhookDestinationUrl('https://[::ffff:a9fe:a9fe]/hook')).toBe(false);
            expect(isSafeWebhookDestinationUrl('https://[fd12:3456::1]/hook')).toBe(false);
            expect(isSafeWebhookDestinationUrl('https://[fe80::1]/hook')).toBe(false);
        });

        it('rejects nested quantifier ReDoS patterns in metadata validation rules', () => {
            expect(() =>
                normalizeMetadataFieldInput({
                    label: 'Unsafe Regex Field',
                    apiName: 'unsafe_regex',
                    dataType: 'TEXT',
                    validationRules: {
                        pattern: '(a+)+$',
                    },
                }),
            ).toThrow(/nested quantifiers/i);
        });

        it('uses keyed HMAC-SHA256 for document verification badges without leaking predictable hashes', () => {
            const tpl = {
                id: 'tpl-1',
                name: 'Bonafide',
                category: 'CERTIFICATE' as const,
                headerTitle: 'Certificate',
                bodyMarkdown: 'Student {{student_name}}',
                footerText: 'Verified',
                includeVerificationBadge: true,
            };
            const renderedA = renderMetadataDocumentTemplate(
                tpl,
                { student_name: 'Aarav' },
                { objectName: 'Admissions', recordId: '11111111-1111-4111-8111-111111111111' },
            );
            const renderedB = renderMetadataDocumentTemplate(
                tpl,
                { student_name: 'Aarav' },
                { objectName: 'Admissions', recordId: '22222222-2222-4222-8222-222222222222' },
            );
            expect(renderedA.verificationCode).toMatch(/^SM-DOC-\d{4}-[0-9A-F]{32}$/);
            expect(renderedA.verificationCode).not.toBe(renderedB.verificationCode);
        });
    });

    describe('M-04 & H-11: Route Access Policies (/pricing, /hq) and Teacher Scope Parity', () => {
        it('registers /pricing as an authenticated page route so /mfa/setup post-enrollment redirect succeeds', () => {
            const policy = getPageAccessPolicy('/pricing');
            expect(policy.name).toBe('tenant-staff-admin');
            expect(policy.level).toBe('role');
            expect(isRoleAllowedForPage('SCHOOL_ADMIN', policy)).toBe(true);
            expect(
                fs.existsSync(path.join(process.cwd(), 'src/app/pricing/page.tsx')),
            ).toBe(true);
        });

        it('restricts TEACHER students:read permission strictly to class scope rather than tenant-wide', () => {
            const grantEntries = AUTHORIZATION_ROLE_PERMISSIONS.TEACHER.filter(
                (entry) => entry.permission === 'students:read',
            );
            expect(grantEntries).toHaveLength(1);
            expect(grantEntries[0]?.scope).toBe('class');
        });
    });

    describe('C-02, C-03, C-04, C-08, H-06, H-09, H-10: Source-Level Security Invariants', () => {
        it('enforces MFA check inside requireApiAuth and requireAuth', () => {
            const apiAuthSource = fs.readFileSync(
                path.join(process.cwd(), 'src/lib/auth/api.ts'),
                'utf8',
            );
            const actionAuthSource = fs.readFileSync(
                path.join(process.cwd(), 'src/lib/auth/middleware.ts'),
                'utf8',
            );
            expect(apiAuthSource).toContain('MFA_SETUP_REQUIRED');
            expect(apiAuthSource).toContain('!session.mfaVerified');
            expect(actionAuthSource).toContain("redirect('/mfa/setup')");
        });

        it('keeps SUPER_ADMIN and PLATFORM_ADMIN out of unprivileged tenant-self-grantable role mutations in users.ts and adoption-execution.ts', () => {
            const usersSource = fs.readFileSync(
                path.join(process.cwd(), 'src/lib/actions/users.ts'),
                'utf8',
            );
            const adoptionSource = fs.readFileSync(
                path.join(process.cwd(), 'src/lib/workflows/adoption-execution.ts'),
                'utf8',
            );
            expect(usersSource).toContain('validateAssignableRole');
            expect(usersSource).toContain('canManageExistingRole');
            expect(usersSource).toContain("if (targetRole === 'PLATFORM_ADMIN') return false;");
            expect(adoptionSource).toContain('Tenant role changes cannot assign PLATFORM_ADMIN.');
            expect(adoptionSource).toContain(
                'Only SUPER_ADMIN or PLATFORM_ADMIN can assign or modify SUPER_ADMIN roles.',
            );
        });

        it('requires server-verified PAID INR payment_orders rows for paid public portals and fails closed on empty contact fields', () => {
            const engineSource = fs.readFileSync(
                path.join(process.cwd(), 'src/lib/actions/metadata-engine.ts'),
                'utf8',
            );
            expect(engineSource).toContain('UPDATE payment_orders');
            expect(engineSource).toContain('portalRedeemedAt');
            expect(engineSource).not.toContain('bookingOptions?.feePaymentConfirmed');
            expect(engineSource).not.toContain(': Object.keys(row)');
            expect(engineSource).not.toContain('scholarmind-workflow-hmac');
        });
    });
});
