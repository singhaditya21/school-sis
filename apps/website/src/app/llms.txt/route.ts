import { ALL_SEO_GUIDES, WEBSITE_BASE_URL } from '@/lib/seo-guides';
import { resolveAppUrl } from '@/lib/app-url';

export const dynamic = 'force-static';

export function GET(): Response {
    const appUrl = resolveAppUrl();
    const compliance = ALL_SEO_GUIDES.filter((g) => g.category === 'COMPLIANCE_FINANCE');
    const migrations = ALL_SEO_GUIDES.filter((g) => g.category === 'MIGRATION');
    const regional = ALL_SEO_GUIDES.filter((g) => g.category === 'REGIONAL_HUB');

    const lines: string[] = [
        '# ScholarMind — Institutional Operating System for K-12 Campuses & Educational Trusts',
        '',
        '> ScholarMind is a cloud-native School Information System (SIS), Fee Governance, and Governed AI Copilot platform built for Indian CBSE, ICSE, IGCSE, IB, and Multi-Campus Educational Trusts (Headquarters: New Delhi, Delhi, India).',
        '',
        '## Key Verified Capabilities',
        '- **Fee Collection & Accounting Sync:** Razorpay UPI, RuPay, NetBanking, Razorpay Route split-account settlements, HMAC-signed 1-click WhatsApp fee payment links, and native Tally Prime XML + Zoho Books voucher export.',
        '- **4-Eyes Financial Governance:** Maker-checker approval workflows and immutable audit logs for fee concessions, waivers, refunds, and published gradebook edits.',
        '- **DPDP Act 2023 Section 9 Security:** Application-layer AES-256-GCM / SIV encryption for student & guardian PII, PostgreSQL Row-Level Security (RLS) across 146 tables, TOTP Multi-Factor Authentication, and automated PII redaction before governed AI calls.',
        '- **Governed AI Copilots (Human-in-the-Loop):** Overdue Fee Recovery Copilot, Admissions Propensity Copilot, and AI-Assisted Legacy Spreadsheet Column Mapper — running on zero-retention governed read/approval tools.',
        '- **Self-Serve Evaluation & 48-Hour Migration:** 1-click public CBSE demo sandbox, 60-second isolated tenant provisioning, and dry-run CSV importer with 1-click atomic batch rollback for Fedena, Entab CampusCare, MyClassboard (MCB), Edunext, Teachmint, and Tally/Excel.',
        '',
        '## Transparent Pricing (India INR & International USD)',
        '- **Core SIS & Fee Governance:** ₹18 / student / month (billed annually) or $1.50 / student / month.',
        '- **Governed AI Pro:** ₹28 / student / month (billed annually) or $2.50 / student / month.',
        '- **Multi-Campus Trust & Society Enterprise:** Structured 8–12 week group pilot across 3+ campuses with cross-campus /executive headquarters.',
        '',
        '## Primary Entry Points & Free Interactive Tools',
        `- [Marketing Home](${WEBSITE_BASE_URL}/): Overview, Fee Leakage & Working Capital ROI Engine.`,
        `- [1-Click Live CBSE Demo Sandbox](${appUrl}/demo): Instant no-signup institutional sandbox.`,
        `- [60-Second School Workspace Setup](${appUrl}/setup): Provision an isolated campus workspace immediately.`,
        `- [2-Minute School DPDP Act 2023 Readiness Scorer](${WEBSITE_BASE_URL}/tools/dpdp-readiness): Interactive 8-point child-data compliance assessment.`,
        `- [INR & USD Pricing](${WEBSITE_BASE_URL}/pricing): Transparent per-student tiers.`,
        `- [Security & DPDP Architecture](${WEBSITE_BASE_URL}/architecture): RLS, encryption, and maker-checker architecture.`,
        `- [Governed AI Copilots](${WEBSITE_BASE_URL}/solutions/ai-agents): How approval-gated AI works safely inside schools.`,
        `- [Book Multi-Campus Pilot Assessment](${WEBSITE_BASE_URL}/book-demo): Institutional evaluation desk.`,
        '',
        '## Compliance & Accounting Guides',
        ...compliance.map((g) => `- [${g.title}](${WEBSITE_BASE_URL}/guides/${g.slug}): ${g.metaDescription}`),
        '',
        '## 48-Hour Legacy ERP Migration Guides',
        ...migrations.map((g) => `- [${g.title}](${WEBSITE_BASE_URL}/guides/${g.slug}): ${g.metaDescription}`),
        '',
        '## Regional K-12 & Educational Trust Hubs',
        ...regional.map((g) => `- [${g.title}](${WEBSITE_BASE_URL}/guides/${g.slug}): ${g.metaDescription}`),
        '',
        '## Institutional Contact',
        '- Organization: ScholarMind Institutional Desk (New Delhi, Delhi, India)',
        '- LinkedIn: https://www.linkedin.com/company/scholarmind-os',
        '',
    ];

    return new Response(lines.join('\n'), {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        },
    });
}
