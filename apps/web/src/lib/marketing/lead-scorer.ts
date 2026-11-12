export interface ScorableLeadInput {
    contactName: string;
    contactEmail: string;
    schoolName: string;
    studentCapacity: number;
    painPoints: string | null;
    sourceUrl?: string | null;
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
}

export type LeadPriority = 'HOT' | 'WARM' | 'NURTURE';
export type RecommendedTier = 'CORE' | 'AI_PRO' | 'ENTERPRISE';

export interface LeadTriageScore {
    score: number;
    priority: LeadPriority;
    recommendedTier: RecommendedTier;
    sourceLabel: string;
    focusModulePath: string;
    tailoredOutreachSubject: string;
    tailoredOutreachPlainText: string;
    conciergeAutoResponderHtml: string;
}

const CONSUMER_EMAIL_DOMAINS = new Set([
    'gmail.com',
    'yahoo.com',
    'yahoo.co.in',
    'outlook.com',
    'hotmail.com',
    'rediffmail.com',
    'icloud.com',
    'proton.me',
    'protonmail.com',
]);

function escapeHtml(raw: string): string {
    return raw
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function resolveAppOrigin(): string {
    const configured = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
    return configured || 'https://school-sis-web.vercel.app';
}

export function scoreInboundLead(lead: ScorableLeadInput): LeadTriageScore {
    let score = 0;

    // 1. Seat capacity fit (max 38 pts)
    if (lead.studentCapacity >= 10000) {
        score += 38;
    } else if (lead.studentCapacity >= 5000) {
        score += 33;
    } else if (lead.studentCapacity >= 1500) {
        score += 26;
    } else {
        score += 16;
    }

    // 2. Institutional email domain signal (max 20 pts)
    const emailDomain = (lead.contactEmail.split('@')[1] || '').trim().toLowerCase();
    if (/\.(edu|edu\.in|ac\.in|org\.in|sch\.in)$/.test(emailDomain)) {
        score += 20;
    } else if (emailDomain && !CONSUMER_EMAIL_DOMAINS.has(emailDomain)) {
        score += 15;
    } else {
        score += 6;
    }

    // 3. Pain-point & workflow intent signals (max 26 pts)
    const pain = (lead.painPoints || '').toLowerCase();
    const highIntentSignals = [
        /tally|xml|zoho|voucher|reconcil/,
        /dpdp|section\s*9|encrypt|rls|audit|4-eyes|maker-checker|concession|waiver/,
        /upi|razorpay|whatsapp|arrears|overdue|leakage|defaulter/,
        /migrat|fedena|entab|mcb|myclassboard|edunext|teachmint|excel/,
        /trust|society|multi-campus|group|branches/,
    ];
    let matchedSignals = 0;
    for (const pattern of highIntentSignals) {
        if (pattern.test(pain)) matchedSignals += 1;
    }
    score += Math.min(26, matchedSignals * 7);

    // 4. Organic diagnostic / playbook attribution (max 16 pts)
    const campaign = (lead.utmCampaign || '').toLowerCase();
    const sourceUrl = (lead.sourceUrl || '').toLowerCase();
    let sourceLabel = 'Pilot Assessment';
    if (campaign.includes('dpdp_readiness') || sourceUrl.includes('/tools/dpdp-readiness')) {
        score += 16;
        sourceLabel = 'DPDP Readiness Scorer';
    } else if (campaign.includes('fee_leakage') || pain.includes('[fee diagnostic:')) {
        score += 16;
        sourceLabel = 'Fee Leakage Diagnostic';
    } else if (sourceUrl.includes('/guides/')) {
        score += 12;
        sourceLabel = 'SEO Playbook';
    }

    const boundedScore = Math.min(100, Math.max(10, score));
    const priority: LeadPriority =
        boundedScore >= 75 ? 'HOT' : boundedScore >= 50 ? 'WARM' : 'NURTURE';

    // Recommended tier
    let recommendedTier: RecommendedTier = 'CORE';
    if (lead.studentCapacity >= 5000 || /multi-campus|group|trust\s+hq/.test(pain)) {
        recommendedTier = 'ENTERPRISE';
    } else if (
        boundedScore >= 60 ||
        /dpdp|whatsapp|overdue|arrears|ai|copilot|leakage/.test(pain)
    ) {
        recommendedTier = 'AI_PRO';
    }

    // Role / pain-specific focus path inside sandbox
    let focusModulePath = '/fees/defaulters';
    let focusDescription = 'Overdue Fee Recovery & Signed WhatsApp UPI Links (/fees/defaulters)';
    if (lead.studentCapacity >= 5000) {
        focusModulePath = '/executive';
        focusDescription = 'Multi-Campus Trust & Society Executive HQ (/executive)';
    } else if (/tally|xml|zoho|voucher/.test(pain)) {
        focusModulePath = '/fees/accounting-sync';
        focusDescription = 'Tally Prime XML & Zoho Books Voucher Sync (/fees/accounting-sync)';
    } else if (/dpdp|section\s*9|encrypt|consent/.test(pain) || sourceLabel === 'DPDP Readiness Scorer') {
        focusModulePath = '/compliance';
        focusDescription = 'DPDP Act 2023 Section 9 Encryption & Consent Ledger (/compliance)';
    } else if (/migrat|fedena|entab|mcb|edunext|teachmint|csv|excel/.test(pain)) {
        focusModulePath = '/settings/import';
        focusDescription = '48-Hour Guided ERP CSV Importer & AI Column Mapper (/settings/import)';
    }

    const appOrigin = resolveAppOrigin();
    const demoUrl = `${appOrigin}/demo`;
    const setupUrl = `${appOrigin}/setup`;

    const tierSummary =
        recommendedTier === 'ENTERPRISE'
            ? 'Multi-Campus Trust Pilot (8–12 Week Structured Group Rollout)'
            : recommendedTier === 'AI_PRO'
              ? 'Governed AI Pro (₹28 / student / month · Core SIS + Fee & Admissions Copilots)'
              : 'Core SIS & Fee Governance (₹18 / student / month · UPI, 4-Eyes Locks & Tally XML)';

    const tailoredOutreachSubject = `ScholarMind Sandbox & Pilot Brief — ${lead.schoolName}`;

    const tailoredOutreachPlainText = [
        `Dear ${lead.contactName},`,
        '',
        `Thank you for connecting with ScholarMind regarding ${lead.schoolName} (~${lead.studentCapacity.toLocaleString('en-IN')} students).`,
        '',
        `Based on your ${sourceLabel.toLowerCase()} details, we recommend starting with:`,
        `• Recommended Plan: ${tierSummary}`,
        `• Suggested Sandbox Walkthrough: ${focusDescription}`,
        '',
        'You can evaluate ScholarMind immediately with zero sales wait:',
        `1. Launch 1-Click Pre-Seeded CBSE Demo Sandbox: ${demoUrl}`,
        `2. Provision an Isolated Workspace for ${lead.schoolName} in 60 seconds: ${setupUrl}`,
        '',
        'If you would like to dry-run a sample student & fee-arrears CSV export from your current ERP (with 1-click rollback protection), reply with a convenient 20-minute window for your Principal or Finance Officer.',
        '',
        'Warm regards,',
        'ScholarMind Institutional Desk',
        'New Delhi, India',
    ].join('\n');

    const conciergeAutoResponderHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a; max-width: 600px; line-height: 1.6;">
            <div style="background: #162B4D; color: #FAF7F2; padding: 20px 24px; border-radius: 12px 12px 0 0; border-bottom: 3px solid #C68E3F;">
                <strong style="font-size: 16px; letter-spacing: 0.02em;">ScholarMind Institutional Desk</strong>
            </div>
            <div style="border: 1px solid #e2e8f0; border-top: none; padding: 24px; border-radius: 0 0 12px 12px; background: #ffffff;">
                <p>Dear ${escapeHtml(lead.contactName)},</p>
                <p>We have received your institutional assessment for <strong>${escapeHtml(lead.schoolName)}</strong>.</p>
                <div style="background: #FAF7F2; border: 1px solid #e5dccb; border-radius: 10px; padding: 16px; margin: 18px 0;">
                    <p style="margin: 0 0 6px 0; font-size: 13px;"><strong>Recommended Fit:</strong> ${escapeHtml(tierSummary)}</p>
                    <p style="margin: 0; font-size: 13px;"><strong>Priority Module to Inspect:</strong> ${escapeHtml(focusDescription)}</p>
                </div>
                <p>Explore ScholarMind right away without waiting for a sales call:</p>
                <ul>
                    <li><a href="${demoUrl}" style="color: #162B4D; font-weight: 600;">Launch 1-Click Pre-Seeded CBSE Demo Campus</a></li>
                    <li><a href="${setupUrl}" style="color: #162B4D; font-weight: 600;">Provision Isolated Campus Workspace (60 Seconds)</a></li>
                </ul>
                <p style="font-size: 13px; color: #475569; margin-top: 24px;">
                    Warm regards,<br/>
                    <strong>ScholarMind Institutional Desk</strong><br/>
                    New Delhi, Delhi, India
                </p>
            </div>
        </div>
    `.trim();

    return {
        score: boundedScore,
        priority,
        recommendedTier,
        sourceLabel,
        focusModulePath,
        tailoredOutreachSubject,
        tailoredOutreachPlainText,
        conciergeAutoResponderHtml,
    };
}
