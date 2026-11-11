import {
    computeGstBreakdown,
    estimateMonthlySubscription,
    formatCommercialAmount,
    isValidIndianGstin,
    SAAS_SAC_CODE,
} from '@/lib/billing/pricing-catalog';
import {
    buildWhatsAppFeeMessage,
    buildWhatsAppShareUrl,
    maskPhoneNumber,
    signInvoicePaymentToken,
    verifyInvoicePaymentToken,
} from '@/lib/payments/payment-links';
import {
    autoMapLegacyColumns,
    normalizeLegacyDate,
    normalizeLegacyRow,
    parseDelimitedSpreadsheet,
    SAMPLE_LEGACY_ERP_CSV,
} from '@/lib/import/legacy-erp-parser';
import { isReservedWorkspaceCode } from '@/lib/auth/platform-owner';
import { isPublicPageRoute } from '@/lib/auth/page-access';

describe('Phase 1 Commercial Readiness — Pricing, Payment Links, Demo Sandbox & ERP Importer', () => {
    const ORIGINAL_ENV = process.env;

    beforeEach(() => {
        process.env = {
            ...ORIGINAL_ENV,
            SESSION_SECRET: 'test-session-secret-with-at-least-32-characters-long',
        };
    });

    afterAll(() => {
        process.env = ORIGINAL_ENV;
    });

    describe('India-First INR + 18% GST & International USD Pricing Catalog', () => {
        it('computes 18% GST (9% CGST + 9% SGST) and SAC 998314 accurately', () => {
            const gst = computeGstBreakdown(125000);
            expect(gst.subtotalInr).toBe(125000);
            expect(gst.cgstInr).toBe(11250);
            expect(gst.sgstInr).toBe(11250);
            expect(gst.totalGstInr).toBe(22500);
            expect(gst.grandTotalInr).toBe(147500);
            expect(gst.sacCode).toBe(SAAS_SAC_CODE);
        });

        it('applies campus annual floors for small student counts and scales linearly for larger schools', () => {
            const smallCampus = estimateMonthlySubscription('CORE', 100, { applyCampusFloor: true });
            // 100 * ₹15 = ₹1,500/mo, floor is ₹60,000 / 12 = ₹5,000/mo
            expect(smallCampus.subtotalInr).toBe(5000);
            expect(smallCampus.totalWithGstInr).toBe(5900);
            expect(smallCampus.amountUsd).toBe(200);

            const largeCampus = estimateMonthlySubscription('AI_PRO', 1000, { applyCampusFloor: true });
            // 1000 * ₹28 = ₹28,000/mo (> ₹1,25,000/12 floor)
            expect(largeCampus.subtotalInr).toBe(28000);
            expect(largeCampus.gstInr).toBe(5040);
            expect(largeCampus.totalWithGstInr).toBe(33040);
            expect(largeCampus.amountUsd).toBe(4000);
        });

        it('formats INR (en-IN) and USD (en-US) deterministically and validates Indian GSTIN', () => {
            expect(formatCommercialAmount(125000, 'INR')).toContain('1,25,000');
            expect(formatCommercialAmount(5400, 'USD')).toBe('$5,400');

            expect(isValidIndianGstin('07AAACB2894G1Z2')).toBe(true);
            expect(isValidIndianGstin('29ABCDE1234F1Z5')).toBe(true);
            expect(isValidIndianGstin('INVALID-GSTIN')).toBe(false);
        });
    });

    describe('1-Click WhatsApp HMAC Payment Links', () => {
        const tenantId = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
        const invoiceId = '66666666-6666-4666-8666-666666666666';

        it('signs and verifies tenant-scoped invoice payment tokens with constant-time HMAC', () => {
            const nowMs = 1_760_000_000_000;
            const token = signInvoicePaymentToken({
                tenantId,
                invoiceId,
                ttlSeconds: 3600,
                nowMs,
            });

            const valid = verifyInvoicePaymentToken(token, nowMs + 60_000);
            expect(valid).toEqual({
                ok: true,
                tenantId,
                invoiceId,
                expiresAt: Math.floor(nowMs / 1000) + 3600,
            });

            const expired = verifyInvoicePaymentToken(token, nowMs + 3601_000);
            expect(expired.ok).toBe(false);

            const tampered = `${token.slice(0, -4)}abcd`;
            expect(verifyInvoicePaymentToken(tampered, nowMs).ok).toBe(false);
        });

        it('builds WhatsApp deep links and masks guardian phone numbers cleanly', () => {
            expect(maskPhoneNumber('9811223344')).toBe('+91 ••••••3344');
            const msg = buildWhatsAppFeeMessage({
                schoolName: 'Delhi Heritage Public School',
                studentName: 'Diya Sharma',
                invoiceNumber: 'INV-2026-002',
                amountFormatted: '₹22,500.00',
                dueDate: '2026-12-15',
                paymentUrl: 'https://school-sis-web.vercel.app/pay/v1.abc.def',
            });
            const waUrl = buildWhatsAppShareUrl('9811223344', msg);
            expect(waUrl.startsWith('https://wa.me/919811223344?text=')).toBe(true);
            expect(decodeURIComponent(waUrl)).toContain('INV-2026-002');
        });
    });

    describe('Demo Sandbox & Public Route Governance', () => {
        it('reserves DEMO-CAMPUS and DEMO subdomains and exposes /demo and /pay as explicit public routes', () => {
            expect(isReservedWorkspaceCode('demo-campus')).toBe(true);
            expect(isReservedWorkspaceCode('DEMO')).toBe(true);
            expect(isReservedWorkspaceCode('sandbox')).toBe(true);
            expect(isPublicPageRoute('/demo')).toBe(true);
            expect(isPublicPageRoute('/pay/v1.sample.sig')).toBe(true);
        });
    });

    describe('48-Hour Legacy ERP Spreadsheet Parser & Normalizer', () => {
        it('auto-maps Entab CSV columns, splits Class-Section & Full Name, and parses ₹ balances', () => {
            const parsed = parseDelimitedSpreadsheet(SAMPLE_LEGACY_ERP_CSV);
            expect(parsed.delimiter).toBe(',');
            expect(parsed.rows).toHaveLength(5);

            const mapping = autoMapLegacyColumns(parsed.headers);
            expect(mapping.admissionNumber).toBe('Adm_No');
            expect(mapping.fullName).toBe('Pupil_Name');
            expect(mapping.gradeName).toBe('Class_Section');
            expect(mapping.guardianPhone).toBe('Father_Mobile');
            expect(mapping.openingFeeBalance).toBe('Fee_Arrears');

            const first = normalizeLegacyRow(parsed.rows[0], mapping, 2);
            expect(first.errors).toEqual([]);
            expect(first.admissionNumber).toBe('ENT-2026-501');
            expect(first.firstName).toBe('Rohan');
            expect(first.lastName).toBe('Kulkarni');
            expect(first.dateOfBirth).toBe('2013-06-14');
            expect(first.gradeName).toBe('Grade 7');
            expect(first.sectionName).toBe('A');
            expect(first.guardianPhone).toBe('+919811223344');
            expect(first.openingFeeBalance).toBe(14500);
        });

        it('parses tab-separated Excel paste and flags invalid dates or missing admission numbers', () => {
            expect(normalizeLegacyDate('29/02/2024')).toBe('2024-02-29');
            expect(normalizeLegacyDate('31/02/2024')).toBeNull();

            const tsv = 'enrollment_no\tstudent_name\tdob\tbatch_name\tpending_dues\n\tAarav\t99/99/2020\tClass 5\t₹4,500 Dr';
            const parsed = parseDelimitedSpreadsheet(tsv);
            expect(parsed.delimiter).toBe('\t');
            const mapping = autoMapLegacyColumns(parsed.headers);
            const row = normalizeLegacyRow(parsed.rows[0], mapping, 2);
            expect(row.openingFeeBalance).toBe(4500);
            expect(row.errors).toContain('Missing Admission Number');
        });
    });
});
