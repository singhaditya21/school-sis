import crypto from 'crypto';

export type BoardPreset = 'CBSE' | 'ICSE' | 'NEP_2020_HPC' | 'IB';

export interface BoardPresetDefinition {
    key: BoardPreset;
    shortLabel: string;
    fullName: string;
    regulator: string;
    passingPercentage: number;
    weightageSummary: string;
    components: { label: string; weightPercent: number }[];
}

export const BOARD_PRESETS: Record<BoardPreset, BoardPresetDefinition> = {
    CBSE: {
        key: 'CBSE',
        shortLabel: 'CBSE',
        fullName: 'CBSE Uniform Assessment & Scholastic Record',
        regulator: 'Central Board of Secondary Education (New Delhi)',
        passingPercentage: 33,
        weightageSummary: 'Periodic Test 10% · Notebook 5% · Subject Enrichment 5% · Term Exam 80%',
        components: [
            { label: 'Periodic Test (PT)', weightPercent: 10 },
            { label: 'Notebook / Portfolio', weightPercent: 5 },
            { label: 'Subject Enrichment', weightPercent: 5 },
            { label: 'Term Examination', weightPercent: 80 },
        ],
    },
    ICSE: {
        key: 'ICSE',
        shortLabel: 'ICSE / CISCE',
        fullName: 'CISCE Council Statement of Marks & Internal Assessment',
        regulator: 'Council for the Indian School Certificate Examinations',
        passingPercentage: 35,
        weightageSummary: 'Internal Project & Practicals 20% · Council Written Paper 80%',
        components: [
            { label: 'Internal Assessment', weightPercent: 20 },
            { label: 'Written Examination', weightPercent: 80 },
        ],
    },
    NEP_2020_HPC: {
        key: 'NEP_2020_HPC',
        shortLabel: 'NEP 2020 HPC',
        fullName: 'NEP 2020 360° Holistic Progress Card (PARAKH)',
        regulator: 'National Education Policy 2020 · PARAKH Competency Framework',
        passingPercentage: 35,
        weightageSummary: 'Formative Competency 40% · Experiential Project 20% · Summative Synthesis 40%',
        components: [
            { label: 'Formative Competency', weightPercent: 40 },
            { label: 'Experiential / Peer Inquiry', weightPercent: 20 },
            { label: 'Summative Synthesis', weightPercent: 40 },
        ],
    },
    IB: {
        key: 'IB',
        shortLabel: 'IB (MYP / DP)',
        fullName: 'International Baccalaureate Criterion-Referenced Transcript',
        regulator: 'International Baccalaureate Organization (1–7 Scale)',
        passingPercentage: 40,
        weightageSummary: 'Criterion A–D Internal 50% · Summative eAssessment / Paper 50%',
        components: [
            { label: 'Criteria A–D Portfolio', weightPercent: 50 },
            { label: 'Summative Paper', weightPercent: 50 },
        ],
    },
};

export interface ComputedBoardGrade {
    grade: string;
    gradePoint: number | null;
    descriptor: string;
    passed: boolean;
}

export function normalizeBoardPreset(raw: string | null | undefined): BoardPreset {
    const cleaned = (raw || '').trim().toUpperCase();
    if (cleaned === 'ICSE' || cleaned === 'CISCE' || cleaned === 'ISC') return 'ICSE';
    if (cleaned === 'NEP_2020_HPC' || cleaned === 'NEP' || cleaned === 'NEP2020' || cleaned === 'HPC') {
        return 'NEP_2020_HPC';
    }
    if (cleaned === 'IB' || cleaned === 'IGCSE') return 'IB';
    return 'CBSE';
}

export function computeBoardGrade(
    percentage: number | null,
    board: BoardPreset,
    isAbsent = false,
): ComputedBoardGrade {
    if (isAbsent) {
        return { grade: 'AB', gradePoint: 0, descriptor: 'Absent', passed: false };
    }
    if (percentage === null || !Number.isFinite(percentage)) {
        return { grade: '—', gradePoint: null, descriptor: 'Not Entered', passed: false };
    }

    const pct = Math.max(0, Math.min(100, percentage));

    switch (board) {
        case 'CBSE': {
            if (pct >= 91) return { grade: 'A1', gradePoint: 10.0, descriptor: 'Outstanding', passed: true };
            if (pct >= 81) return { grade: 'A2', gradePoint: 9.0, descriptor: 'Excellent', passed: true };
            if (pct >= 71) return { grade: 'B1', gradePoint: 8.0, descriptor: 'Very Good', passed: true };
            if (pct >= 61) return { grade: 'B2', gradePoint: 7.0, descriptor: 'Good', passed: true };
            if (pct >= 51) return { grade: 'C1', gradePoint: 6.0, descriptor: 'Fair', passed: true };
            if (pct >= 41) return { grade: 'C2', gradePoint: 5.0, descriptor: 'Average', passed: true };
            if (pct >= 33) return { grade: 'D', gradePoint: 4.0, descriptor: 'Marginal Pass', passed: true };
            return { grade: 'E', gradePoint: 0.0, descriptor: 'Essential Repeat', passed: false };
        }
        case 'ICSE': {
            if (pct >= 90) return { grade: '1', gradePoint: 9.0, descriptor: 'Very Good (Distinction)', passed: true };
            if (pct >= 80) return { grade: '2', gradePoint: 8.0, descriptor: 'Very Good', passed: true };
            if (pct >= 70) return { grade: '3', gradePoint: 7.0, descriptor: 'Credit with Honour', passed: true };
            if (pct >= 60) return { grade: '4', gradePoint: 6.0, descriptor: 'Credit', passed: true };
            if (pct >= 50) return { grade: '5', gradePoint: 5.0, descriptor: 'Pass with Merit', passed: true };
            if (pct >= 40) return { grade: '6', gradePoint: 4.0, descriptor: 'Pass', passed: true };
            if (pct >= 35) return { grade: '7', gradePoint: 3.0, descriptor: 'Standard Pass', passed: true };
            if (pct >= 20) return { grade: '8', gradePoint: 0.0, descriptor: 'Below Standard', passed: false };
            return { grade: '9', gradePoint: 0.0, descriptor: 'Unsatisfactory', passed: false };
        }
        case 'NEP_2020_HPC': {
            if (pct >= 85) return { grade: 'Exceeding', gradePoint: 4.0, descriptor: 'Autonomous Mastery', passed: true };
            if (pct >= 65) return { grade: 'Proficient', gradePoint: 3.0, descriptor: 'Consistent Application', passed: true };
            if (pct >= 35) return { grade: 'Developing', gradePoint: 2.0, descriptor: 'Guided Progression', passed: true };
            return { grade: 'Beginning', gradePoint: 1.0, descriptor: 'Foundational Support Needed', passed: false };
        }
        case 'IB': {
            if (pct >= 85) return { grade: '7', gradePoint: 7.0, descriptor: 'Excellent', passed: true };
            if (pct >= 75) return { grade: '6', gradePoint: 6.0, descriptor: 'Very Good', passed: true };
            if (pct >= 65) return { grade: '5', gradePoint: 5.0, descriptor: 'Good', passed: true };
            if (pct >= 50) return { grade: '4', gradePoint: 4.0, descriptor: 'Satisfactory', passed: true };
            if (pct >= 40) return { grade: '3', gradePoint: 3.0, descriptor: 'Mediocre (Pass)', passed: true };
            if (pct >= 25) return { grade: '2', gradePoint: 2.0, descriptor: 'Elementary', passed: false };
            return { grade: '1', gradePoint: 1.0, descriptor: 'Very Poor', passed: false };
        }
    }
}

export function splitWeightedMarks(
    marksObtained: number | null,
    maxMarks: number,
    board: BoardPreset,
): { label: string; scored: number; max: number }[] {
    const def = BOARD_PRESETS[board];
    if (marksObtained === null || !Number.isFinite(marksObtained) || maxMarks <= 0) {
        return def.components.map((c) => ({
            label: c.label,
            scored: 0,
            max: Math.round((maxMarks * c.weightPercent) / 100),
        }));
    }

    let allocatedScored = 0;
    let allocatedMax = 0;
    return def.components.map((comp, idx) => {
        const isLast = idx === def.components.length - 1;
        const compMax = isLast
            ? Math.max(0, maxMarks - allocatedMax)
            : Math.round((maxMarks * comp.weightPercent) / 100);
        const compScored = isLast
            ? Math.round((marksObtained - allocatedScored) * 10) / 10
            : Math.min(compMax, Math.round(((marksObtained * comp.weightPercent) / 100) * 10) / 10);
        allocatedMax += compMax;
        allocatedScored += compScored;
        return { label: comp.label, scored: compScored, max: compMax };
    });
}

export interface HolisticAttributeRow {
    domain: string;
    gradeBand: string;
    descriptor: string;
}

export function deriveHolisticAttributes(
    overallPercentage: number | null,
    board: BoardPreset,
): HolisticAttributeRow[] {
    const pct = overallPercentage ?? 78;
    const high = pct >= 85;
    const mid = pct >= 65;

    if (board === 'NEP_2020_HPC') {
        return [
            {
                domain: 'Scientific Temper & Critical Inquiry',
                gradeBand: high ? 'Exceeding' : mid ? 'Proficient' : 'Developing',
                descriptor: 'Demonstrates evidence-based reasoning and collaborative lab investigation.',
            },
            {
                domain: 'Communication & Multilingual Expression',
                gradeBand: high ? 'Exceeding' : 'Proficient',
                descriptor: 'Articulates concepts clearly in class discussions and reflective portfolios.',
            },
            {
                domain: 'Creative Arts & Aesthetic Appreciation',
                gradeBand: 'Proficient',
                descriptor: 'Actively participates in studio projects and cultural heritage showcases.',
            },
            {
                domain: 'Health, SEWA & Civic Responsibility',
                gradeBand: high ? 'Exceeding' : 'Proficient',
                descriptor: 'Shows empathy, regular physical wellness, and peer stewardship.',
            },
        ];
    }

    return [
        {
            domain: 'Work Education & Digital Literacy',
            gradeBand: high ? 'A' : mid ? 'B' : 'C',
            descriptor: 'Structured project execution and responsible use of digital lab resources.',
        },
        {
            domain: 'Art Education & Cultural Heritage',
            gradeBand: 'A',
            descriptor: 'Consistent engagement in visual and performing arts modules.',
        },
        {
            domain: 'Health & Physical Education (SEWA)',
            gradeBand: high ? 'A' : 'B',
            descriptor: 'Active participation in morning drills, sports, and community service.',
        },
        {
            domain: 'Discipline & Institutional Values',
            gradeBand: 'A',
            descriptor: 'Upholds campus decorum, punctuality, and peer respect.',
        },
    ];
}

// ─── Cryptographic Report Card Verification Seal ─────────────

const REPORT_CARD_TOKEN_VERSION = 'rc1';
const REPORT_CARD_TOKEN_DOMAIN = 'school-sis:report-card-verify:v1';
const DEFAULT_REPORT_CARD_TTL_SECONDS = 365 * 24 * 60 * 60; // 1 year transcript verification validity
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ReportCardVerificationClaims {
    v: 1;
    tid: string;
    sid: string;
    eid: string;
    brd: BoardPreset;
    exp: number;
}

function getReportCardSigningSecret(): string {
    const secret =
        process.env.REPORT_CARD_VERIFY_SECRET ||
        process.env.PAYMENT_LINK_SECRET ||
        process.env.SESSION_SECRET;
    if (!secret || secret.length < 32) {
        if (
            process.env.npm_lifecycle_event === 'build' ||
            process.env.NEXT_PHASE === 'phase-production-build'
        ) {
            return 'dummy-secret-for-build-time-only-32-chars-long-x';
        }
        throw new Error('SESSION_SECRET (min 32 chars) is required to sign verifiable report cards.');
    }
    return secret;
}

function deriveReportCardKey(): Buffer {
    return crypto
        .createHmac('sha256', getReportCardSigningSecret())
        .update(REPORT_CARD_TOKEN_DOMAIN, 'utf8')
        .digest();
}

export function signReportCardVerificationToken(input: {
    tenantId: string;
    studentId: string;
    examId: string;
    board?: BoardPreset;
    ttlSeconds?: number;
    nowMs?: number;
}): string {
    const tenantId = input.tenantId.trim().toLowerCase();
    const studentId = input.studentId.trim().toLowerCase();
    const examId = input.examId.trim().toLowerCase();
    const board = input.board ?? 'CBSE';

    if (!UUID_REGEX.test(tenantId) || !UUID_REGEX.test(studentId) || !UUID_REGEX.test(examId)) {
        throw new Error('Invalid tenant, student, or exam identifier for report card verification.');
    }

    const nowSec = Math.floor((input.nowMs ?? Date.now()) / 1000);
    const ttl = Math.max(
        3600,
        Math.min(input.ttlSeconds ?? DEFAULT_REPORT_CARD_TTL_SECONDS, 5 * 365 * 24 * 60 * 60),
    );
    const claims: ReportCardVerificationClaims = {
        v: 1,
        tid: tenantId,
        sid: studentId,
        eid: examId,
        brd: board,
        exp: nowSec + ttl,
    };

    const payloadB64 = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
    const mac = crypto
        .createHmac('sha256', deriveReportCardKey())
        .update(`${REPORT_CARD_TOKEN_VERSION}.${payloadB64}`, 'utf8')
        .digest('base64url');

    return `${REPORT_CARD_TOKEN_VERSION}.${payloadB64}.${mac}`;
}

export function verifyReportCardVerificationToken(
    token: string | null | undefined,
    nowMs = Date.now(),
):
    | {
          ok: true;
          tenantId: string;
          studentId: string;
          examId: string;
          board: BoardPreset;
          expiresAt: number;
      }
    | { ok: false; reason: string } {
    if (!token || typeof token !== 'string') {
        return { ok: false, reason: 'Missing report card verification token.' };
    }

    const parts = token.trim().split('.');
    if (parts.length !== 3 || parts[0] !== REPORT_CARD_TOKEN_VERSION) {
        return { ok: false, reason: 'Invalid report card verification seal format.' };
    }

    const [, payloadB64, providedMacB64] = parts;
    if (!payloadB64 || !providedMacB64) {
        return { ok: false, reason: 'Malformed report card verification seal.' };
    }

    let providedMac: Buffer;
    try {
        providedMac = Buffer.from(providedMacB64, 'base64url');
    } catch {
        return { ok: false, reason: 'Malformed cryptographic signature.' };
    }

    const expectedMac = crypto
        .createHmac('sha256', deriveReportCardKey())
        .update(`${REPORT_CARD_TOKEN_VERSION}.${payloadB64}`, 'utf8')
        .digest();

    if (
        providedMac.length !== expectedMac.length ||
        !crypto.timingSafeEqual(providedMac, expectedMac)
    ) {
        return {
            ok: false,
            reason: 'Cryptographic signature mismatch — this transcript seal may have been altered.',
        };
    }

    let parsed: Partial<ReportCardVerificationClaims>;
    try {
        parsed = JSON.parse(
            Buffer.from(payloadB64, 'base64url').toString('utf8'),
        ) as Partial<ReportCardVerificationClaims>;
    } catch {
        return { ok: false, reason: 'Invalid verification payload.' };
    }

    if (
        parsed.v !== 1 ||
        typeof parsed.tid !== 'string' ||
        typeof parsed.sid !== 'string' ||
        typeof parsed.eid !== 'string' ||
        typeof parsed.brd !== 'string' ||
        typeof parsed.exp !== 'number' ||
        !UUID_REGEX.test(parsed.tid) ||
        !UUID_REGEX.test(parsed.sid) ||
        !UUID_REGEX.test(parsed.eid)
    ) {
        return { ok: false, reason: 'Invalid report card verification claims.' };
    }

    const nowSec = Math.floor(nowMs / 1000);
    if (parsed.exp <= nowSec) {
        return {
            ok: false,
            reason: 'This verification seal has passed its validity window. Request a fresh copy from the school registrar.',
        };
    }

    return {
        ok: true,
        tenantId: parsed.tid.toLowerCase(),
        studentId: parsed.sid.toLowerCase(),
        examId: parsed.eid.toLowerCase(),
        board: normalizeBoardPreset(parsed.brd),
        expiresAt: parsed.exp,
    };
}
