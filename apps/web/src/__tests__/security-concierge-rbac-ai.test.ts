const mockSql = jest.fn() as jest.Mock & {
    one?: jest.Mock;
    maybeOne?: jest.Mock;
    execute?: jest.Mock;
};
const mockPoolQuery = jest.fn();
const mockGetSession = jest.fn();
const mockEmailSend = jest.fn();
const mockSmsSend = jest.fn();
const mockLogAudit = jest.fn();

jest.mock('next/navigation', () => ({
    redirect: jest.fn((url: string) => {
        throw new Error(`NEXT_REDIRECT:${url}`);
    }),
}));

jest.mock('next/cache', () => ({
    revalidatePath: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
    sql: (...args: unknown[]) => mockSql(...args),
    sqlFor: () => (...args: unknown[]) => mockSql(...args),
    withTenant: (_tenantId: string, fn: (client: unknown) => unknown) => fn({}),
    pool: {
        query: (...args: unknown[]) => mockPoolQuery(...args),
    },
    RLS_BYPASS_JUSTIFICATIONS: {
        WHATSAPP_INBOUND_ROUTING: 'whatsapp_inbound_routing',
        DEMO_TENANT_LOOKUP: 'demo_tenant_lookup',
    },
    runWithRlsBypass: jest.fn(async (_reason: string, fn: () => Promise<unknown>) => fn()),
    runWithTenantContext: jest.fn(async (_tenantId: string, fn: () => Promise<unknown>) => fn()),
}));

jest.mock('@/lib/auth/session', () => ({
    getSession: () => mockGetSession(),
}));

jest.mock('@/lib/auth/middleware', () => ({
    requireAuth: jest.fn(async (requiredPermission?: string) => {
        const session = await mockGetSession();
        if (!session) {
            throw new Error('Unauthorized: No active session');
        }
        const { hasPermission: checkPerm } = jest.requireActual('@/lib/rbac/permissions') as {
            hasPermission: (role: string, permission: string) => boolean;
        };
        if (requiredPermission && !checkPerm(session.role, requiredPermission)) {
            throw new Error(`Forbidden: Role ${session.role} lacks permission ${requiredPermission}`);
        }
        return {
            session,
            tenantId: session.tenantId,
            userId: session.userId,
        };
    }),
}));

jest.mock('@/lib/providers/email', () => ({
    getEmailProvider: () => ({
        send: (...args: unknown[]) => mockEmailSend(...args),
    }),
}));

jest.mock('@/lib/providers/sms', () => ({
    getSmsProvider: () => ({
        send: (...args: unknown[]) => mockSmsSend(...args),
    }),
}));

jest.mock('@/lib/audit', () => ({
    logAudit: (...args: unknown[]) => mockLogAudit(...args),
}));

import { hasPermission } from '@/lib/rbac/permissions';
import { getDashboardStats, getRecentActivity } from '@/lib/actions/dashboard';
import {
    signGatePassToken,
    verifyGatePassToken,
    getCurrentCampusDateIso,
} from '@/lib/security/gate-pass-token';
import { redactPiiForExternalLlm } from '@/lib/ai/telemetry';
import { triggerStageNotification, convertLeadToStudent } from '@/lib/actions/admissions';
import { verifyExamResults, saveMarks } from '@/lib/actions/exams';
import {
    resolveInboundWhatsAppTenant,
    processInboundConciergeMessage,
} from '@/lib/concierge/whatsapp-concierge';
import { clearDemoTenantCache } from '@/lib/tenant/demo-guard';

function sqlResult<T>(rows: T[]) {
    const arr = [...rows] as T[] & {
        one: () => Promise<T>;
        maybeOne: () => Promise<T | null>;
        execute: () => Promise<T[]>;
    };
    arr.one = async () => rows[0];
    arr.maybeOne = async () => rows[0] ?? null;
    arr.execute = async () => rows;
    return Object.assign(Promise.resolve(rows), {
        one: arr.one,
        maybeOne: arr.maybeOne,
        execute: arr.execute,
    });
}

describe('Security Hardening: Scoped RBAC, Gate Passes, AI PII Redaction, Admissions & Maker-Checker', () => {
    const TENANT_ID = '11111111-1111-4111-8111-111111111111';
    const USER_ID = '22222222-2222-4222-8222-222222222222';
    const STUDENT_ID = '33333333-3333-4333-8333-333333333333';

    beforeEach(() => {
        jest.clearAllMocks();
        mockSql.mockReset();
        mockPoolQuery.mockReset();
        mockGetSession.mockReset();
        mockEmailSend.mockReset();
        mockSmsSend.mockReset();
        mockLogAudit.mockReset();
        mockPoolQuery.mockResolvedValue({
            rows: [
                {
                    id: USER_ID,
                    tenant_id: TENANT_ID,
                    is_active: true,
                    tenant_active: true,
                    session_version: 0,
                    code: 'REAL-SCHOOL',
                    is_demo: false,
                },
            ],
            rowCount: 1,
        });
        clearDemoTenantCache();
        process.env.SESSION_SECRET = 'unit-test-session-secret-at-least-32-chars-long-12345';
        process.env.PII_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    });

    describe('HIGH-01: Scoped RBAC denies unscoped dashboard:read for PARENT/STUDENT while preserving :own', () => {
        it('denies unscoped dashboard:read to PARENT and STUDENT while retaining own-scoped grants', () => {
            expect(hasPermission('PARENT', 'dashboard:read')).toBe(false);
            expect(hasPermission('STUDENT', 'dashboard:read')).toBe(false);

            expect(hasPermission('PARENT', 'dashboard:read:own')).toBe(true);
            expect(hasPermission('PARENT', 'parent:read:own')).toBe(true);
            expect(hasPermission('STUDENT', 'dashboard:read:own')).toBe(true);
            expect(hasPermission('TEACHER', 'dashboard:read')).toBe(true);
        });

        it('rejects getDashboardStats and getRecentActivity for PARENT and STUDENT sessions', async () => {
            for (const role of ['PARENT', 'STUDENT'] as const) {
                mockGetSession.mockResolvedValue({
                    userId: USER_ID,
                    tenantId: TENANT_ID,
                    role,
                    email: `${role.toLowerCase()}@school.example`,
                });

                await expect(getDashboardStats()).rejects.toThrow(/Forbidden|Permission|Unauthorized/i);
                await expect(getRecentActivity()).rejects.toThrow(/Forbidden|Permission|Unauthorized/i);
            }
            expect(mockSql).not.toHaveBeenCalled();
        });

        it('returns empty recent activity and masks invoice revenue totals for TEACHER on staff dashboard', async () => {
            mockGetSession.mockResolvedValue({
                userId: USER_ID,
                tenantId: TENANT_ID,
                role: 'TEACHER',
                email: 'teacher@school.example',
            });

            const activity = await getRecentActivity();
            expect(activity).toEqual([]);
            expect(mockSql).not.toHaveBeenCalled();

            mockSql.mockImplementation((strings: TemplateStringsArray) => {
                const text = strings.join('?');
                if (text.includes('FROM invoices')) {
                    throw new Error('TEACHER should never query invoices on getDashboardStats');
                }
                if (text.includes('blocked_count')) {
                    return sqlResult([{ blocked_count: '2' }]);
                }
                return sqlResult([{ count: '12' }]);
            });

            const stats = await getDashboardStats();
            expect(stats.totalStudents).toBe(12);
            expect(stats.feeCollected).toBe(0);
            expect(stats.feesPending).toBe(0);
            expect(stats.overdueAmount).toBe(0);
            expect(stats.collectionRate).toBe(0);
        });
    });

    describe('MED-04: Dismissal gate pass enforces same-day campus date verification', () => {
        it('accepts today campus pass and rejects non-same-day validDate even before exp', () => {
            const todayIst = getCurrentCampusDateIso('Asia/Kolkata');
            expect(todayIst).toMatch(/^\d{4}-\d{2}-\d{2}$/);

            const nowMs = Date.now();
            const validTodayToken = signGatePassToken({
                tenantId: TENANT_ID,
                studentId: STUDENT_ID,
                guardianUserId: USER_ID,
                validDate: todayIst,
                ttlSeconds: 18 * 3600,
                nowMs,
            });
            const verifiedToday = verifyGatePassToken(validTodayToken, nowMs, {
                timeZone: 'Asia/Kolkata',
            });
            expect(verifiedToday.ok).toBe(true);

            const staleYesterdayToken = signGatePassToken({
                tenantId: TENANT_ID,
                studentId: STUDENT_ID,
                guardianUserId: USER_ID,
                validDate: '2025-01-01',
                ttlSeconds: 48 * 3600,
                nowMs,
            });
            const verifiedYesterday = verifyGatePassToken(staleYesterdayToken, nowMs, {
                timeZone: 'Asia/Kolkata',
            });
            expect(verifiedYesterday.ok).toBe(false);
            if (!verifiedYesterday.ok) {
                expect(verifiedYesterday.reason).toMatch(/2025-01-01|valid only for/i);
            }
        });
    });

    describe('HIGH-11: Pre-LLM PII scrubber strips Aadhaar, PAN, email, and phone numbers', () => {
        it('redacts Aadhaar, PAN, email, and 10+ digit phones while preserving academic context', () => {
            const rawPrompt = [
                'Applicant Aarav Sharma for Grade 6 (Academic Year 2026-27).',
                'Parent email: priya.sharma@gmail.com, phone: +91 98765 43210, alt: 9123456789.',
                'Submitted Aadhaar 4567 8901 2345 and PAN ABCDE1234F on 2026-05-12.',
            ].join(' ');

            const scrubbed = redactPiiForExternalLlm(rawPrompt);

            expect(scrubbed).not.toContain('priya.sharma@gmail.com');
            expect(scrubbed).not.toContain('98765 43210');
            expect(scrubbed).not.toContain('9123456789');
            expect(scrubbed).not.toContain('4567 8901 2345');
            expect(scrubbed).not.toContain('ABCDE1234F');

            expect(scrubbed).toContain('[REDACTED_EMAIL]');
            expect(scrubbed).toContain('[REDACTED_PHONE]');
            expect(scrubbed).toContain('[REDACTED_AADHAAR]');
            expect(scrubbed).toContain('[REDACTED_PAN]');
            expect(scrubbed).toContain('Grade 6');
            expect(scrubbed).toContain('2026-05-12');
        });
    });

    describe('MED-07: Admissions HTML escaping and tenant foreign-key enforcement', () => {
        it('neutralizes <script> and <a href=...> injection in triggerStageNotification email HTML', async () => {
            mockGetSession.mockResolvedValue({
                userId: USER_ID,
                tenantId: TENANT_ID,
                role: 'SCHOOL_ADMIN',
                email: 'admin@school.example',
            });
            mockPoolQuery.mockResolvedValue({
                rows: [{ code: 'REAL-SCHOOL', is_demo: false }],
            });
            mockSql.mockResolvedValueOnce([
                {
                    parentName: 'Rohan <script>window.alert(1)</script>',
                    childFirstName: 'Diya"><a href="https://evil.example">Verify</a>',
                    childLastName: 'Verma',
                    applyingForGrade: 'Grade 4 <img src=x onerror=window.alert(2)>',
                    notes: ' Urgent ',
                    parentEmail: 'rohan.verma@example.org',
                },
            ]);
            mockEmailSend.mockResolvedValue({ success: true });

            const res = await triggerStageNotification('lead-1', 'OFFERED');
            expect(res.success).toBe(true);
            expect(mockEmailSend).toHaveBeenCalledTimes(1);

            const sentPayload = mockEmailSend.mock.calls[0][0] as { to: string; html: string };
            expect(sentPayload.to).toBe('rohan.verma@example.org');
            expect(sentPayload.html).not.toContain('<script>');
            expect(sentPayload.html).not.toContain('<a href="https://evil.example">');
            expect(sentPayload.html).not.toContain('<img src=x');
            expect(sentPayload.html).toContain('&lt;script&gt;window.alert(1)&lt;/script&gt;');
            expect(sentPayload.html).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;');
        });

        it('rejects cross-tenant gradeId in convertLeadToStudent', async () => {
            mockGetSession.mockResolvedValue({
                userId: USER_ID,
                tenantId: TENANT_ID,
                role: 'SCHOOL_ADMIN',
                email: 'admin@school.example',
            });
            mockSql
                .mockResolvedValueOnce([
                    {
                        id: 'lead-1',
                        childFirstName: 'Aarav',
                        childLastName: 'Nair',
                        childDob: '2016-04-10',
                        stage: 'OFFERED',
                        parentName: 'Meera Nair',
                        parentPhone: '9876543210',
                        parentEmail: 'meera@example.org',
                    },
                ])
                .mockResolvedValueOnce([]); // gradeId does not belong to tenantId

            const out = await convertLeadToStudent('lead-1', 'foreign-grade-id', 'foreign-section-id');
            expect(out).toEqual({
                success: false,
                error: 'Grade not found or unauthorized',
            });
        });
    });

    describe('HIGH-05 & MED-06: Multi-tenant WhatsApp disambiguation & Exam maker-checker', () => {
        it('asks parent to disambiguate when a shared WhatsApp number matches multiple active tenants', async () => {
            mockSql.mockResolvedValueOnce([
                { tenantId: TENANT_ID, tenantCode: 'DPS-NORTH', tenantName: 'DPS North' },
                {
                    tenantId: '44444444-4444-4444-8444-444444444444',
                    tenantCode: 'DPS-EAST',
                    tenantName: 'DPS East',
                },
            ]);

            const resolution = await resolveInboundWhatsAppTenant({
                phoneNumberId: 'waha',
                fromDigits: '919876543210',
                rawText: 'FEES',
            });

            expect(resolution.status).toBe('AMBIGUOUS');
            if (resolution.status === 'AMBIGUOUS') {
                expect(resolution.candidateCodes).toEqual(['DPS-EAST', 'DPS-NORTH']);
                expect(resolution.replyText).toContain('DPS-EAST');
                expect(resolution.replyText).toContain('DPS-NORTH');
            }
        });

        it('enforces maker-checker separation when verifying self-entered exam marks', async () => {
            mockGetSession.mockResolvedValue({
                userId: USER_ID,
                tenantId: TENANT_ID,
                role: 'SCHOOL_ADMIN',
                email: 'admin@school.example',
            });
            mockSql.mockResolvedValueOnce([
                {
                    entered_by: USER_ID,
                    already_locked: false,
                },
            ]);

            await expect(verifyExamResults(['result-self-1'])).rejects.toThrow(/maker-checker/i);
        });

        it('blocks TEACHER from saving marks for a grade they are not assigned to', async () => {
            mockGetSession.mockResolvedValue({
                userId: USER_ID,
                tenantId: TENANT_ID,
                role: 'TEACHER',
                email: 'teacher@school.example',
            });
            mockSql
                .mockResolvedValueOnce([
                    { maxMarks: '100', gradeId: 'grade-unassigned', examStatus: 'MARKS_ENTRY' },
                ])
                .mockResolvedValueOnce([]); // assertTeacherAssignedToGrade -> empty

            await expect(
                saveMarks('sched-1', [
                    { studentId: STUDENT_ID, marksObtained: 88, isAbsent: false },
                ]),
            ).rejects.toThrow(/not assigned/i);
        });

        it('replaces live signed payment tokens with non-redeemable placeholders in simulatorPreviewOnly mode (HIGH-06)', async () => {
            mockSql
                .mockImplementationOnce(() =>
                    sqlResult([{ name: 'Delhi Heritage School', affiliationBoard: 'CBSE' }]),
                )
                .mockImplementationOnce(() =>
                    sqlResult([
                        {
                            guardianId: 'gd-1',
                            userId: USER_ID,
                            firstName: 'Priya',
                            lastName: 'Sharma',
                            phoneEnc: null,
                            studentId: STUDENT_ID,
                            studentName: 'Aarav Sharma',
                            admissionNumber: 'ADM-101',
                            gradeId: 'grade-6',
                            gradeName: 'Grade 6',
                            sectionName: 'A',
                        },
                    ]),
                )
                .mockImplementationOnce(() => sqlResult([{ isOptedIn: true }]))
                .mockImplementationOnce(() =>
                    sqlResult([
                        {
                            id: '44444444-4444-4444-8444-444444444444',
                            invoiceNumber: 'INV-2026-001',
                            totalAmount: '25000',
                            paidAmount: '6500',
                            dueDate: '2026-06-10',
                            status: 'PARTIALLY_PAID',
                        },
                    ]),
                );

            const preview = await processInboundConciergeMessage({
                tenantId: TENANT_ID,
                guardianUserId: USER_ID,
                fromPhone: '919876543210',
                rawText: '1',
                appOrigin: 'https://school-sis-web.vercel.app',
                simulatorPreviewOnly: true,
            });

            expect(preview?.ok).toBe(true);
            expect(preview?.intent).toBe('PAY_FEES');
            expect(preview?.replyText).toContain('https://school-sis-web.vercel.app/pay/preview-simulated-token');
            expect(preview?.replyText).not.toMatch(/\/pay\/inv1\./);
        });
    });
});
