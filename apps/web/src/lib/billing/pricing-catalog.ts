/**
 * Commercial Pricing Catalog — India-First INR (₹ + 18% GST, SAC 998314)
 * with International USD ($) Toggle.
 *
 * Pure module safe for both Server Components/Actions and Client Components.
 */

import { formatCurrency } from '@/lib/format/currency';

export type BillingCurrency = 'INR' | 'USD';
export type WorkspacePlanTier = 'CORE' | 'AI_PRO' | 'ENTERPRISE';

export const INDIA_GST_RATE = 0.18;
export const SAAS_SAC_CODE = '998314';

export interface WorkspacePlanDefinition {
    id: WorkspacePlanTier;
    name: string;
    badge?: string;
    summary: string;
    inrPerStudentMonthly: number;
    inrAnnualFloor: number;
    usdPerStudentMonthly: number;
    usdAnnualFloor: number;
    trialNote: string;
    features: readonly string[];
}

export const WORKSPACE_PLANS_CATALOG: readonly WorkspacePlanDefinition[] = [
    {
        id: 'CORE',
        name: 'Core SIS',
        summary: 'Admissions, encrypted student registry, attendance, timetable, exams, and governed fee ledger.',
        inrPerStudentMonthly: 15,
        inrAnnualFloor: 60000,
        usdPerStudentMonthly: 2,
        usdAnnualFloor: 900,
        trialNote: 'Free 30-day sandbox up to 50 students · Billed annually + 18% GST',
        features: [
            'Student & guardian registry with encrypted PII',
            'Attendance, grading, and report card workflows',
            'Fee plans, invoicing, receipts, and 4-eyes approvals',
            'Razorpay UPI / NetBanking / Cards + WhatsApp pay links',
            '48-hour Legacy ERP Excel/CSV data migration wizard',
        ],
    },
    {
        id: 'AI_PRO',
        name: 'Campus Pro + Governed AI',
        badge: 'Most Popular',
        summary: 'Core SIS plus governed AI copilots, Tally Prime XML sync, executive analytics, and parent reminders.',
        inrPerStudentMonthly: 28,
        inrAnnualFloor: 125000,
        usdPerStudentMonthly: 4,
        usdAnnualFloor: 1800,
        trialNote: '14-day Pro trial available · Billed annually + 18% GST',
        features: [
            'Everything in Core SIS',
            'Governed AI Spine with approval-gated actions',
            'Tally Prime XML voucher sync & executive fee analytics',
            'Automated WhatsApp / SMS / Email defaulter dunning',
            'DigiLocker & APAAR readiness workflows',
        ],
    },
    {
        id: 'ENTERPRISE',
        name: 'Multi-Campus Enterprise',
        summary: 'Group HQ command center, LCNC Custom Object Studio, Experience Portals, and SSO/SCIM governance.',
        inrPerStudentMonthly: 45,
        inrAnnualFloor: 400000,
        usdPerStudentMonthly: 7,
        usdAnnualFloor: 5400,
        trialNote: 'Custom multi-campus contract · Dedicated onboarding engineer',
        features: [
            'Multi-campus hierarchy, treasury rollup & policy mandates',
            'LCNC Schema Studio, Blueprints & Experience Portals',
            'Custom BI Report Builder & scheduled data exports',
            'SCIM 2.0 provisioning & OIDC / SAML Enterprise SSO',
            'Priority audit & DPDP compliance SLA',
        ],
    },
] as const;

export interface GstBreakdown {
    subtotalInr: number;
    cgstInr: number;
    sgstInr: number;
    totalGstInr: number;
    grandTotalInr: number;
    gstRatePercent: number;
    sacCode: string;
}

export function computeGstBreakdown(subtotalInr: number): GstBreakdown {
    const cleanSubtotal = Math.max(0, Math.round(subtotalInr));
    const cgstInr = Math.round(cleanSubtotal * (INDIA_GST_RATE / 2));
    const sgstInr = Math.round(cleanSubtotal * (INDIA_GST_RATE / 2));
    const totalGstInr = cgstInr + sgstInr;
    return {
        subtotalInr: cleanSubtotal,
        cgstInr,
        sgstInr,
        totalGstInr,
        grandTotalInr: cleanSubtotal + totalGstInr,
        gstRatePercent: 18,
        sacCode: SAAS_SAC_CODE,
    };
}

const usdWholeNumber = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
});

export function formatCommercialAmount(amount: number, currency: BillingCurrency): string {
    const rounded = Math.round(Number.isFinite(amount) ? amount : 0);
    if (currency === 'INR') {
        return formatCurrency(rounded);
    }
    return rounded < 0
        ? `-$${usdWholeNumber.format(Math.abs(rounded))}`
        : `$${usdWholeNumber.format(rounded)}`;
}

export function getPlanDefinition(tier: string | null | undefined): WorkspacePlanDefinition {
    const normalized = (tier || 'CORE').toUpperCase();
    return (
        WORKSPACE_PLANS_CATALOG.find((p) => p.id === normalized) ||
        WORKSPACE_PLANS_CATALOG[0]
    );
}

export function estimateMonthlySubscription(
    tier: string | null | undefined,
    activeStudents: number,
    options?: { applyCampusFloor?: boolean },
): {
    subtotalInr: number;
    gstInr: number;
    totalWithGstInr: number;
    amountUsd: number;
} {
    const count = Math.max(0, Math.floor(Number.isFinite(activeStudents) ? activeStudents : 0));
    const plan = getPlanDefinition(tier);
    const applyFloor = options?.applyCampusFloor ?? count > 0;

    const rawMonthlyInr = count * plan.inrPerStudentMonthly;
    const floorMonthlyInr = Math.round(plan.inrAnnualFloor / 12);
    const subtotalInr = applyFloor ? Math.max(rawMonthlyInr, floorMonthlyInr) : rawMonthlyInr;
    const gst = computeGstBreakdown(subtotalInr);

    const rawMonthlyUsd = count * plan.usdPerStudentMonthly;
    const floorMonthlyUsd = Math.round(plan.usdAnnualFloor / 12);
    const amountUsd = applyFloor ? Math.max(rawMonthlyUsd, floorMonthlyUsd) : rawMonthlyUsd;

    return {
        subtotalInr: gst.subtotalInr,
        gstInr: gst.totalGstInr,
        totalWithGstInr: gst.grandTotalInr,
        amountUsd,
    };
}

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function isValidIndianGstin(value: string | null | undefined): boolean {
    if (!value) return false;
    return GSTIN_REGEX.test(value.trim().toUpperCase());
}
