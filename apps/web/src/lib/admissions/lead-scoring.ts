import { normalizeWhatsAppDigits } from '@/lib/payments/payment-links';

export type LeadPropensityTier = 'HOT' | 'WARM' | 'NURTURE' | 'CLOSED';

export interface LeadScoringInput {
    id: string;
    childFirstName: string;
    childLastName: string;
    childDob?: string | null;
    applyingForGrade: string;
    parentName: string;
    parentEmail?: string | null;
    parentPhone?: string | null;
    source: string;
    stage: string;
    notes?: string | null;
    previousSchool?: string | null;
    createdAt: Date | string;
}

export interface LeadPropensityFactor {
    label: string;
    points: number;
    maxPoints: number;
}

export interface LeadPropensityResult {
    score: number;
    tier: LeadPropensityTier;
    tierLabel: string;
    signals: string[];
    factors: LeadPropensityFactor[];
    nextBestAction: string;
    talkingPoints: string[];
    whatsappDigits: string | null;
    whatsappScripts: {
        english: string;
        hindi: string;
    };
}

const STAGE_POINTS: Record<string, { pts: number; signal: string }> = {
    OFFERED: { pts: 34, signal: 'Admission offer extended' },
    ACCEPTED: { pts: 35, signal: 'Offer accepted by family' },
    INTERVIEW_DONE: { pts: 30, signal: 'Campus interaction completed' },
    INTERVIEW_SCHEDULED: { pts: 26, signal: 'Assessment / tour scheduled' },
    DOCUMENTS_PENDING: { pts: 21, signal: 'Application submitted (docs pending)' },
    FORM_SUBMITTED: { pts: 19, signal: 'Application form submitted' },
    CONTACTED: { pts: 13, signal: 'Two-way counselor contact established' },
    NEW: { pts: 8, signal: 'Fresh inbound inquiry' },
};

const SOURCE_POINTS: Record<string, { pts: number; signal: string }> = {
    REFERRAL: { pts: 25, signal: 'Parent / alumni referral' },
    WALK_IN: { pts: 23, signal: 'In-person campus walk-in' },
    WEBSITE: { pts: 18, signal: 'Direct website inquiry' },
    SOCIAL_MEDIA: { pts: 14, signal: 'Social discovery lead' },
    ADVERTISEMENT: { pts: 11, signal: 'Campaign inquiry' },
    OTHER: { pts: 10, signal: 'General channel' },
};

export function scoreAdmissionLeadPropensity(
    lead: LeadScoringInput,
    schoolName = 'ScholarMind Campus',
): LeadPropensityResult {
    const stageUpper = String(lead.stage || 'NEW').toUpperCase();
    const sourceUpper = String(lead.source || 'OTHER').toUpperCase();
    const childFull = `${lead.childFirstName} ${lead.childLastName}`.trim();
    const digits = normalizeWhatsAppDigits(lead.parentPhone || '');

    if (stageUpper === 'ENROLLED' || stageUpper === 'REJECTED' || stageUpper === 'WITHDRAWN') {
        const closedScore = stageUpper === 'ENROLLED' ? 99 : 10;
        return {
            score: closedScore,
            tier: 'CLOSED',
            tierLabel: stageUpper === 'ENROLLED' ? 'Enrolled Scholar' : 'Closed',
            signals: [`Outcome: ${stageUpper}`],
            factors: [],
            nextBestAction:
                stageUpper === 'ENROLLED'
                    ? 'Verify welcome kit, transport allocation, and first-term fee plan.'
                    : 'No active counselor follow-up required.',
            talkingPoints: [
                `Application status for ${childFull} is marked ${stageUpper}.`,
            ],
            whatsappDigits: digits,
            whatsappScripts: buildBilingualScripts({
                parentName: lead.parentName,
                childFirstName: lead.childFirstName,
                grade: lead.applyingForGrade,
                stage: stageUpper,
                schoolName,
            }),
        };
    }

    const stageMeta = STAGE_POINTS[stageUpper] || { pts: 8, signal: 'Active pipeline stage' };
    const sourceMeta = SOURCE_POINTS[sourceUpper] || SOURCE_POINTS.OTHER;

    // Dossier completeness & intent keywords (max 22 pts)
    let dossierPts = 0;
    const signals: string[] = [stageMeta.signal, sourceMeta.signal];
    if (lead.childDob) dossierPts += 4;
    if (lead.parentPhone) dossierPts += 5;
    if (lead.parentEmail) dossierPts += 4;
    if (lead.previousSchool && lead.previousSchool.trim().length > 1) {
        dossierPts += 5;
        signals.push(`Transfer from ${lead.previousSchool.trim()}`);
    }
    if (lead.notes && /sibling|alumni|deposit|tour|scholarship|ready/i.test(lead.notes)) {
        dossierPts += 4;
        signals.push('High-intent counselor note');
    } else if (lead.notes && lead.notes.trim().length > 8) {
        dossierPts += 2;
    }

    // Recency velocity (max 18 pts)
    const createdMs = new Date(lead.createdAt).getTime();
    const daysOld = Number.isNaN(createdMs)
        ? 5
        : Math.max(0, Math.floor((Date.now() - createdMs) / (1000 * 60 * 60 * 24)));
    const recencyPts =
        daysOld <= 3 ? 18 : daysOld <= 7 ? 15 : daysOld <= 14 ? 12 : daysOld <= 30 ? 9 : 6;

    const rawScore = stageMeta.pts + sourceMeta.pts + dossierPts + recencyPts;
    const score = Math.min(98, Math.max(12, rawScore));

    const tier: LeadPropensityTier =
        score >= 74 ? 'HOT' : score >= 48 ? 'WARM' : 'NURTURE';
    const tierLabel =
        tier === 'HOT'
            ? 'Hot · Ready to Close'
            : tier === 'WARM'
                ? 'Warm · High Intent'
                : 'Nurture · Early Inquiry';

    const factors: LeadPropensityFactor[] = [
        { label: 'Pipeline Stage Velocity', points: stageMeta.pts, maxPoints: 35 },
        { label: 'Channel Intent Weight', points: sourceMeta.pts, maxPoints: 25 },
        { label: 'Scholar Dossier & Signals', points: dossierPts, maxPoints: 22 },
        { label: 'Inquiry Recency', points: recencyPts, maxPoints: 18 },
    ];

    const nextBestAction = buildNextBestAction(stageUpper, lead.applyingForGrade, childFull);
    const talkingPoints = buildDeterministicTalkingPoints(lead, tier);

    return {
        score,
        tier,
        tierLabel,
        signals: signals.slice(0, 3),
        factors,
        nextBestAction,
        talkingPoints,
        whatsappDigits: digits,
        whatsappScripts: buildBilingualScripts({
            parentName: lead.parentName,
            childFirstName: lead.childFirstName,
            grade: lead.applyingForGrade,
            stage: stageUpper,
            schoolName,
        }),
    };
}

function buildNextBestAction(stage: string, grade: string, childName: string): string {
    switch (stage) {
        case 'OFFERED':
        case 'ACCEPTED':
            return `Share seat-confirmation UPI fee link within 24 hours to lock ${childName}'s ${grade} seat before waitlist rollover.`;
        case 'INTERVIEW_SCHEDULED':
        case 'INTERVIEW_DONE':
            return `Send Principal interaction summary & ${grade} holistic report card sample to accelerate offer acceptance.`;
        case 'DOCUMENTS_PENDING':
        case 'FORM_SUBMITTED':
            return `Nudge guardian on WhatsApp for pending birth certificate / previous transcript to unlock ${grade} interaction slot.`;
        case 'CONTACTED':
            return `Invite family for a 20-minute guided ${grade} STEM & campus walkthrough this week.`;
        default:
            return `Make first counselor response within 15 minutes via WhatsApp with ${grade} prospectus & campus tour slots.`;
    }
}

function buildDeterministicTalkingPoints(
    lead: LeadScoringInput,
    tier: LeadPropensityTier,
): string[] {
    const pts: string[] = [
        `Highlight ${lead.applyingForGrade} academic mentorship, board-aligned NEP 2020 holistic progress card, and verified campus safety.`,
    ];
    if (lead.previousSchool) {
        pts.push(
            `Acknowledge smooth lateral transition support from ${lead.previousSchool} with zero credit-mapping friction.`,
        );
    } else {
        pts.push(
            `Ask about ${lead.childFirstName}'s favourite subjects and co-curricular interests to personalize the campus tour.`,
        );
    }
    if (tier === 'HOT') {
        pts.push(
            `Confirm transport stop availability and share the 1-tap UPI seat confirmation window to close enrolment this week.`,
        );
    } else {
        pts.push(
            `Offer two concrete Saturday / weekday morning campus visit slots so the family commits to the next milestone.`,
        );
    }
    return pts;
}

function buildBilingualScripts(input: {
    parentName: string;
    childFirstName: string;
    grade: string;
    stage: string;
    schoolName: string;
}): { english: string; hindi: string } {
    const firstParent = input.parentName.split(' ')[0] || input.parentName;

    if (input.stage === 'OFFERED' || input.stage === 'ACCEPTED') {
        return {
            english: `Namaste ${firstParent} ji, congratulations from ${input.schoolName}! ${input.childFirstName}'s admission offer for ${input.grade} (2026-27) is ready. Reply YES and we will share your direct seat-confirmation link and transport route schedule.`,
            hindi: `नमस्ते ${firstParent} जी, ${input.schoolName} की ओर से हार्दिक बधाई! ${input.childFirstName} का ${input.grade} (सत्र 2026-27) के लिए प्रवेश प्रस्ताव तैयार है। सीट सुनिश्चित करने और बस रूट विवरण प्राप्त करने के लिए कृपया YES लिखकर भेजें।`,
        };
    }

    if (input.stage === 'DOCUMENTS_PENDING' || input.stage === 'FORM_SUBMITTED') {
        return {
            english: `Namaste ${firstParent} ji, thank you for submitting ${input.childFirstName}'s ${input.grade} application at ${input.schoolName}. Please share the remaining verification document here or on the portal so we can confirm your campus interaction slot this week.`,
            hindi: `नमस्ते ${firstParent} जी, ${input.schoolName} में ${input.childFirstName} (${input.grade}) के आवेदन के लिए धन्यवाद। कृपया शेष दस्तावेज़ साझा करें ताकि हम इस सप्ताह आपकी कैंपस मीटिंग का समय निश्चित कर सकें।`,
        };
    }

    return {
        english: `Namaste ${firstParent} ji, warm greetings from the Admissions Office at ${input.schoolName}. Thank you for inquiring about ${input.grade} for ${input.childFirstName}. Would Thursday 10:30 AM or Saturday 11:00 AM work for a guided campus tour?`,
        hindi: `नमस्ते ${firstParent} जी, ${input.schoolName} प्रवेश कार्यालय की ओर से अभिवादन। ${input.childFirstName} के ${input.grade} प्रवेश हेतु आपकी रुचि के लिए धन्यवाद। क्या आप इस गुरुवार सुबह 10:30 बजे या शनिवार 11:00 बजे कैंपस विज़िट के लिए पधारना चाहेंगे?`,
    };
}
