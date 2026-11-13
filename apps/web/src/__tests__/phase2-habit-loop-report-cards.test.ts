import {
    BOARD_PRESETS,
    computeBoardGrade,
    deriveHolisticAttributes,
    normalizeBoardPreset,
    signReportCardVerificationToken,
    splitWeightedMarks,
    verifyReportCardVerificationToken,
} from '@/lib/academics/board-grading';
import {
    buildVerificationMatrix,
    deriveShortVerificationCode,
    getCurrentCampusDateIso,
    signGatePassToken,
    verifyGatePassToken,
} from '@/lib/security/gate-pass-token';
import {
    classifyConciergeIntent,
    parseInboundWhatsAppMessages,
} from '@/lib/concierge/whatsapp-concierge';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const STUDENT_ID = '22222222-2222-4222-8222-222222222222';
const GUARDIAN_ID = '33333333-3333-4333-8333-333333333333';
const EXAM_ID = '44444444-4444-4444-8444-444444444444';

describe('Phase 2 — Board-Compliant Report Card Studio & Cryptographic Transcript Seals', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = {
            ...originalEnv,
            SESSION_SECRET: 'phase2-unit-test-session-secret-minimum-32-chars!!',
        };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('normalizes affiliation aliases into canonical board presets', () => {
        expect(normalizeBoardPreset('cbse')).toBe('CBSE');
        expect(normalizeBoardPreset('CISCE')).toBe('ICSE');
        expect(normalizeBoardPreset('NEP2020')).toBe('NEP_2020_HPC');
        expect(normalizeBoardPreset('IGCSE')).toBe('IB');
        expect(normalizeBoardPreset(null)).toBe('CBSE');
    });

    it('computes accurate grades and pass thresholds across CBSE, ICSE, NEP 2020 HPC, and IB', () => {
        expect(computeBoardGrade(94, 'CBSE')).toMatchObject({
            grade: 'A1',
            gradePoint: 10,
            passed: true,
        });
        expect(computeBoardGrade(29, 'CBSE')).toMatchObject({
            grade: 'E',
            passed: false,
        });
        expect(computeBoardGrade(92, 'ICSE')).toMatchObject({
            grade: '1',
            passed: true,
        });
        expect(computeBoardGrade(88, 'NEP_2020_HPC')).toMatchObject({
            grade: 'Exceeding',
            passed: true,
        });
        expect(computeBoardGrade(78, 'IB')).toMatchObject({
            grade: '6',
            passed: true,
        });
        expect(computeBoardGrade(95, 'CBSE', true)).toMatchObject({
            grade: 'AB',
            passed: false,
        });
    });

    it('splits subject marks cleanly across weighted components for every board preset', () => {
        for (const preset of Object.keys(BOARD_PRESETS) as Array<keyof typeof BOARD_PRESETS>) {
            const parts = splitWeightedMarks(88, 100, preset);
            const sumMax = parts.reduce((acc, p) => acc + p.max, 0);
            const sumScored = Math.round(parts.reduce((acc, p) => acc + p.scored, 0) * 10) / 10;
            expect(sumMax).toBe(100);
            expect(sumScored).toBe(88);
        }

        const nepRubric = deriveHolisticAttributes(89, 'NEP_2020_HPC');
        expect(nepRubric).toHaveLength(4);
        expect(nepRubric[0]?.gradeBand).toBe('Exceeding');
    });

    it('signs and verifies tamper-evident report card verification tokens', () => {
        const now = 1_760_000_000_000;
        const token = signReportCardVerificationToken({
            tenantId: TENANT_ID,
            studentId: STUDENT_ID,
            examId: EXAM_ID,
            board: 'NEP_2020_HPC',
            ttlSeconds: 7200,
            nowMs: now,
        });

        const valid = verifyReportCardVerificationToken(token, now + 60_000);
        expect(valid).toMatchObject({
            ok: true,
            tenantId: TENANT_ID,
            studentId: STUDENT_ID,
            examId: EXAM_ID,
            board: 'NEP_2020_HPC',
        });

        // Tamper signature
        const tampered = `${token.slice(0, -3)}XYZ`;
        const badSig = verifyReportCardVerificationToken(tampered, now + 60_000);
        expect(badSig.ok).toBe(false);

        // Expired token
        const expired = verifyReportCardVerificationToken(token, now + 8000 * 1000);
        expect(expired.ok).toBe(false);
    });
});

describe('Phase 2 — Digital Dismissal Gate Pass & Verification Matrix', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = {
            ...originalEnv,
            SESSION_SECRET: 'phase2-unit-test-session-secret-minimum-32-chars!!',
        };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('signs, verifies, and rejects expired or forged campus dismissal gate passes', () => {
        const now = 1_760_000_000_000;
        const expectedCampusDate = getCurrentCampusDateIso('Asia/Kolkata', now);
        const token = signGatePassToken({
            tenantId: TENANT_ID,
            studentId: STUDENT_ID,
            guardianUserId: GUARDIAN_ID,
            validDate: expectedCampusDate,
            ttlSeconds: 3600,
            nowMs: now,
        });

        const verified = verifyGatePassToken(token, now + 30_000);
        expect(verified).toMatchObject({
            ok: true,
            tenantId: TENANT_ID,
            studentId: STUDENT_ID,
            guardianUserId: GUARDIAN_ID,
            validDate: expectedCampusDate,
        });

        const shortCode = deriveShortVerificationCode(token, 'GP');
        expect(shortCode).toMatch(/^GP-[2-9A-Z]{6}$/);

        const expired = verifyGatePassToken(token, now + 4000 * 1000);
        expect(expired.ok).toBe(false);

        const forged = `${token.slice(0, -4)}AAAA`;
        expect(verifyGatePassToken(forged, now).ok).toBe(false);
    });

    it('renders a deterministic 21x21 finder-anchored verification matrix', () => {
        const matrix = buildVerificationMatrix('gp1.sample.seed', 21);
        expect(matrix).toHaveLength(21);
        expect(matrix[0]).toHaveLength(21);
        // Top-left, top-right, and bottom-left finder corners and centers must be active
        expect(matrix[0]?.[0]).toBe(true);
        expect(matrix[3]?.[3]).toBe(true);
        expect(matrix[0]?.[20]).toBe(true);
        expect(matrix[20]?.[0]).toBe(true);
    });
});

describe('Phase 2 — 2-Way WhatsApp Business School Concierge Parser & Intent Router', () => {
    it('classifies numbered menu replies and natural-language parent intents', () => {
        expect(classifyConciergeIntent('Hi')).toBe('MENU');
        expect(classifyConciergeIntent('1')).toBe('PAY_FEES');
        expect(classifyConciergeIntent('pay pending fees via upi')).toBe('PAY_FEES');
        expect(classifyConciergeIntent('2')).toBe('LAST_RECEIPT');
        expect(classifyConciergeIntent('send last fee receipt')).toBe('LAST_RECEIPT');
        expect(classifyConciergeIntent('3')).toBe('ATTENDANCE');
        expect(classifyConciergeIntent('monthly attendance summary')).toBe('ATTENDANCE');
        expect(classifyConciergeIntent('4')).toBe('REPORT_CARD');
        expect(classifyConciergeIntent('term 1 report card marks')).toBe('REPORT_CARD');
        expect(classifyConciergeIntent('5')).toBe('BUS_STATUS');
        expect(classifyConciergeIntent('where is school bus pickup gate pass')).toBe('BUS_STATUS');
    });

    it('extracts text and interactive replies from Meta WhatsApp Cloud API payloads', () => {
        const payload = {
            entry: [
                {
                    changes: [
                        {
                            value: {
                                metadata: { phone_number_id: 'phone-id-01' },
                                messages: [
                                    {
                                        id: 'wamid.inbound.1',
                                        from: '+91 98100-11223',
                                        type: 'text',
                                        text: { body: '1' },
                                    },
                                    {
                                        id: 'wamid.inbound.2',
                                        from: '919810011223',
                                        type: 'interactive',
                                        interactive: {
                                            button_reply: { id: '4', title: 'Report Card' },
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                },
            ],
        };

        const parsed = parseInboundWhatsAppMessages(payload);
        expect(parsed).toEqual([
            {
                messageId: 'wamid.inbound.1',
                fromDigits: '919810011223',
                text: '1',
                phoneNumberId: 'phone-id-01',
            },
            {
                messageId: 'wamid.inbound.2',
                fromDigits: '919810011223',
                text: '4',
                phoneNumberId: 'phone-id-01',
            },
        ]);

        // Status-only payloads return empty inbound array
        expect(
            parseInboundWhatsAppMessages({
                entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.status.1' }] } }] }],
            }),
        ).toEqual([]);
    });
});
