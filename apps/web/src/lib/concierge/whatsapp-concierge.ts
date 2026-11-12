import {
    RLS_BYPASS_JUSTIFICATIONS,
    runWithRlsBypass,
    sql,
    sqlFor,
    withTenant,
} from '@/lib/db';
import { decryptFieldTolerant, encryptPhoneCandidates } from '@/lib/encryption';
import { formatCurrencyPrecise } from '@/lib/format/currency';
import { signInvoicePaymentToken, normalizeWhatsAppDigits } from '@/lib/payments/payment-links';
import {
    computeBoardGrade,
    normalizeBoardPreset,
    signReportCardVerificationToken,
} from '@/lib/academics/board-grading';
import { signGatePassToken, deriveShortVerificationCode } from '@/lib/security/gate-pass-token';

export type ConciergeIntent =
    | 'MENU'
    | 'PAY_FEES'
    | 'LAST_RECEIPT'
    | 'ATTENDANCE'
    | 'REPORT_CARD'
    | 'BUS_STATUS';

export interface InboundWhatsAppMessage {
    messageId: string;
    fromDigits: string;
    text: string;
    phoneNumberId: string | null;
}

export function parseInboundWhatsAppMessages(body: unknown): InboundWhatsAppMessage[] {
    if (!body || typeof body !== 'object') return [];
    const root = body as { entry?: unknown };
    if (!Array.isArray(root.entry)) return [];

    const parsed: InboundWhatsAppMessage[] = [];

    for (const entry of root.entry) {
        if (!entry || typeof entry !== 'object') continue;
        const changes = (entry as { changes?: unknown }).changes;
        if (!Array.isArray(changes)) continue;

        for (const change of changes) {
            if (!change || typeof change !== 'object') continue;
            const value = (change as { value?: unknown }).value;
            if (!value || typeof value !== 'object') continue;

            const valObj = value as {
                metadata?: { phone_number_id?: unknown };
                messages?: unknown;
            };
            const phoneNumberId =
                typeof valObj.metadata?.phone_number_id === 'string'
                    ? valObj.metadata.phone_number_id
                    : null;
            if (!Array.isArray(valObj.messages)) continue;

            for (const rawMsg of valObj.messages) {
                if (!rawMsg || typeof rawMsg !== 'object') continue;
                const m = rawMsg as {
                    id?: unknown;
                    from?: unknown;
                    type?: unknown;
                    text?: { body?: unknown };
                    button?: { text?: unknown; payload?: unknown };
                    interactive?: {
                        button_reply?: { id?: unknown; title?: unknown };
                        list_reply?: { id?: unknown; title?: unknown };
                    };
                };

                const messageId = typeof m.id === 'string' ? m.id.trim() : '';
                const fromDigits = typeof m.from === 'string' ? m.from.replace(/\D/g, '') : '';
                if (!messageId || !fromDigits) continue;

                let text = '';
                if (typeof m.text?.body === 'string') {
                    text = m.text.body;
                } else if (typeof m.interactive?.button_reply?.id === 'string') {
                    text = m.interactive.button_reply.id;
                } else if (typeof m.interactive?.list_reply?.id === 'string') {
                    text = m.interactive.list_reply.id;
                } else if (typeof m.button?.text === 'string') {
                    text = m.button.text;
                }

                if (text.trim()) {
                    parsed.push({
                        messageId,
                        fromDigits,
                        text: text.trim().slice(0, 300),
                        phoneNumberId,
                    });
                }
            }
        }
    }

    return parsed;
}

export function classifyConciergeIntent(rawText: string): ConciergeIntent {
    const cleaned = rawText.trim().toLowerCase();
    if (!cleaned) return 'MENU';

    if (
        cleaned === '2' ||
        /\b(receipt|receipts|voucher|acknowledgement)\b/.test(cleaned)
    ) {
        return 'LAST_RECEIPT';
    }
    if (
        cleaned === '1' ||
        /\b(pay|fee|fees|due|dues|invoice|upi|balance|paid)\b/.test(cleaned)
    ) {
        return 'PAY_FEES';
    }
    if (
        cleaned === '3' ||
        /\b(attend|attendance|present|absent|register)\b/.test(cleaned)
    ) {
        return 'ATTENDANCE';
    }
    if (
        cleaned === '4' ||
        /\b(report|result|results|mark|marks|exam|grade|transcript)\b/.test(cleaned)
    ) {
        return 'REPORT_CARD';
    }
    if (
        cleaned === '5' ||
        /\b(bus|transport|route|stop|van|pickup|gate|dismissal)\b/.test(cleaned)
    ) {
        return 'BUS_STATUS';
    }

    return 'MENU';
}

export function buildPhoneLookupCandidates(rawPhone: string): string[] {
    const digits = normalizeWhatsAppDigits(rawPhone);
    if (!digits) return [];
    const variants = new Set<string>([digits, `+${digits}`]);
    if (digits.startsWith('91') && digits.length === 12) {
        const local10 = digits.slice(2);
        variants.add(local10);
        variants.add(`+91${local10}`);
    }
    const ciphertexts = new Set<string>();
    for (const v of variants) {
        for (const enc of encryptPhoneCandidates(v)) {
            ciphertexts.add(enc);
        }
    }
    return [...ciphertexts];
}

export async function locateGuardianTenantByPhone(
    fromDigits: string,
): Promise<{ tenantId: string; guardianPhone: string } | null> {
    const candidates = buildPhoneLookupCandidates(fromDigits);
    if (candidates.length === 0) return null;

    return runWithRlsBypass(RLS_BYPASS_JUSTIFICATIONS.NOTIFICATION_RECEIPT, async () => {
        const rows = await sql<{ tenantId: string }>`
            SELECT gd.tenant_id AS "tenantId"
            FROM guardians gd
            JOIN tenants t ON t.id = gd.tenant_id
            WHERE gd.phone_enc = ANY(${candidates}::text[])
              AND t.is_active = true
            ORDER BY gd.is_primary DESC, gd.created_at DESC
            LIMIT 1
        `;
        if (!rows[0]) return null;
        return { tenantId: rows[0].tenantId, guardianPhone: `+${fromDigits}` };
    });
}

export interface ConciergeReplyResult {
    ok: boolean;
    intent: ConciergeIntent;
    guardianName: string;
    guardianPhoneMasked: string;
    consentVerified: boolean;
    studentNames: string[];
    replyText: string;
    actionLinks: { label: string; href: string }[];
}

export async function resolveConciergeReplyForTenant(input: {
    tenantId: string;
    rawText: string;
    appOrigin: string;
    guardianUserId?: string | null;
    guardianStudentId?: string | null;
    fromPhone?: string | null;
}): Promise<ConciergeReplyResult | null> {
    const intent = classifyConciergeIntent(input.rawText);
    const cleanOrigin = input.appOrigin.replace(/\/+$/, '');

    return withTenant(input.tenantId, async (client) => {
        const q = sqlFor(client);

        const schoolRow = await q<{ name: string; affiliationBoard: string | null }>`
            SELECT name, affiliation_board AS "affiliationBoard"
            FROM tenants
            WHERE id = ${input.tenantId}
            LIMIT 1
        `.maybeOne();
        if (!schoolRow) return null;

        let guardianRows: {
            guardianId: string;
            userId: string | null;
            firstName: string;
            lastName: string;
            phoneEnc: string | null;
            studentId: string;
            studentName: string;
            admissionNumber: string;
            gradeId: string;
            gradeName: string;
            sectionName: string;
        }[] = [];

        if (input.guardianUserId) {
            guardianRows = await q`
                SELECT
                    gd.id AS "guardianId",
                    gd.user_id AS "userId",
                    gd.first_name AS "firstName",
                    gd.last_name AS "lastName",
                    gd.phone_enc AS "phoneEnc",
                    s.id AS "studentId",
                    s.first_name || ' ' || s.last_name AS "studentName",
                    s.admission_number AS "admissionNumber",
                    s.grade_id AS "gradeId",
                    g.name AS "gradeName",
                    sec.name AS "sectionName"
                FROM guardians gd
                JOIN students s ON s.id = gd.student_id AND s.tenant_id = gd.tenant_id
                JOIN grades g ON g.id = s.grade_id AND g.tenant_id = s.tenant_id
                JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = s.tenant_id
                WHERE gd.tenant_id = ${input.tenantId}
                  AND gd.user_id = ${input.guardianUserId}
                  AND s.status = 'ACTIVE'
                ORDER BY s.first_name ASC
            `;
        } else if (input.guardianStudentId) {
            guardianRows = await q`
                SELECT
                    gd.id AS "guardianId",
                    gd.user_id AS "userId",
                    gd.first_name AS "firstName",
                    gd.last_name AS "lastName",
                    gd.phone_enc AS "phoneEnc",
                    s.id AS "studentId",
                    s.first_name || ' ' || s.last_name AS "studentName",
                    s.admission_number AS "admissionNumber",
                    s.grade_id AS "gradeId",
                    g.name AS "gradeName",
                    sec.name AS "sectionName"
                FROM guardians gd
                JOIN students s ON s.id = gd.student_id AND s.tenant_id = gd.tenant_id
                JOIN grades g ON g.id = s.grade_id AND g.tenant_id = s.tenant_id
                JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = s.tenant_id
                WHERE gd.tenant_id = ${input.tenantId}
                  AND gd.student_id = ${input.guardianStudentId}
                  AND s.status = 'ACTIVE'
                ORDER BY gd.is_primary DESC, s.first_name ASC
                LIMIT 4
            `;
        } else if (input.fromPhone) {
            const phoneCandidates = buildPhoneLookupCandidates(input.fromPhone);
            if (phoneCandidates.length > 0) {
                guardianRows = await q`
                    SELECT
                        gd.id AS "guardianId",
                        gd.user_id AS "userId",
                        gd.first_name AS "firstName",
                        gd.last_name AS "lastName",
                        gd.phone_enc AS "phoneEnc",
                        s.id AS "studentId",
                        s.first_name || ' ' || s.last_name AS "studentName",
                        s.admission_number AS "admissionNumber",
                        s.grade_id AS "gradeId",
                        g.name AS "gradeName",
                        sec.name AS "sectionName"
                    FROM guardians gd
                    JOIN students s ON s.id = gd.student_id AND s.tenant_id = gd.tenant_id
                    JOIN grades g ON g.id = s.grade_id AND g.tenant_id = s.tenant_id
                    JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = s.tenant_id
                    WHERE gd.tenant_id = ${input.tenantId}
                      AND gd.phone_enc = ANY(${phoneCandidates}::text[])
                      AND s.status = 'ACTIVE'
                    ORDER BY s.first_name ASC
                `;
            }
        }

        if (guardianRows.length === 0) return null;

        const firstGuardian = guardianRows[0];
        const guardianName = `${firstGuardian.firstName} ${firstGuardian.lastName}`.trim();
        const rawDecryptedPhone = firstGuardian.phoneEnc
            ? decryptFieldTolerant(firstGuardian.phoneEnc)
            : input.fromPhone || '';
        const digits = normalizeWhatsAppDigits(rawDecryptedPhone);
        const guardianPhoneMasked =
            digits && digits.length >= 6 ? `+${digits.slice(0, 2)} ••••••${digits.slice(-4)}` : 'Verified Guardian';

        let consentVerified = true;
        if (firstGuardian.userId) {
            const consentRow = await q<{ isOptedIn: boolean }>`
                SELECT is_opted_in AS "isOptedIn"
                FROM consents
                WHERE tenant_id = ${input.tenantId}
                  AND user_id = ${firstGuardian.userId}
                  AND channel = 'WHATSAPP'
                ORDER BY updated_at DESC
                LIMIT 1
            `.maybeOne();
            if (consentRow && consentRow.isOptedIn === false) {
                consentVerified = false;
            }
        }

        const uniqueStudents = new Map<string, (typeof guardianRows)[number]>();
        for (const row of guardianRows) {
            if (!uniqueStudents.has(row.studentId)) {
                uniqueStudents.set(row.studentId, row);
            }
        }
        const students = [...uniqueStudents.values()];
        const studentNames = students.map((s) => `${s.studentName} (${s.gradeName}-${s.sectionName})`);
        const actionLinks: { label: string; href: string }[] = [];

        if (!consentVerified) {
            return {
                ok: false,
                intent,
                guardianName,
                guardianPhoneMasked,
                consentVerified: false,
                studentNames,
                replyText: [
                    `*${schoolRow.name} — WhatsApp Concierge*`,
                    '',
                    `Namaste ${guardianName}, WhatsApp messaging is currently paused per your DPDP consent preference.`,
                    'Update your channel consent in the Parent Portal (/parent-consent) to resume instant fee & academic replies.',
                ].join('\n'),
                actionLinks: [],
            };
        }

        if (intent === 'MENU') {
            return {
                ok: true,
                intent,
                guardianName,
                guardianPhoneMasked,
                consentVerified: true,
                studentNames,
                replyText: [
                    `Namaste *${guardianName}*, welcome to *${schoolRow.name}* Official Concierge.`,
                    `Linked Ward(s): ${studentNames.join(', ')}`,
                    '',
                    'Reply with a number anytime:',
                    '*1* — Pay Pending Fees (1-Tap UPI Link)',
                    '*2* — Latest Official Fee Receipt',
                    '*3* — Monthly Attendance Summary',
                    '*4* — Published Exam Result & Transcript Seal',
                    '*5* — Bus Stop Timing & Dismissal Gate Pass',
                ].join('\n'),
                actionLinks: [],
            };
        }

        if (intent === 'PAY_FEES') {
            const lines: string[] = [`*${schoolRow.name} — Fee Ledger Summary*`, ''];
            for (const st of students) {
                const invoices = await q<{
                    id: string;
                    invoiceNumber: string;
                    totalAmount: string;
                    paidAmount: string;
                    dueDate: string | null;
                }>`
                    SELECT
                        id,
                        invoice_number AS "invoiceNumber",
                        total_amount AS "totalAmount",
                        paid_amount AS "paidAmount",
                        to_char(due_date, 'YYYY-MM-DD') AS "dueDate"
                    FROM invoices
                    WHERE tenant_id = ${input.tenantId}
                      AND student_id = ${st.studentId}
                      AND status NOT IN ('PAID', 'CANCELLED', 'WAIVED')
                    ORDER BY due_date ASC NULLS LAST
                    LIMIT 2
                `;

                if (invoices.length === 0) {
                    lines.push(`• *${st.studentName}* (${st.gradeName}): All billed dues settled ✓`);
                } else {
                    for (const inv of invoices) {
                        const bal = Math.max(0, Number(inv.totalAmount) - Number(inv.paidAmount || 0));
                        const token = signInvoicePaymentToken({
                            tenantId: input.tenantId,
                            invoiceId: inv.id,
                        });
                        const payPath = `/pay/${token}`;
                        actionLinks.push({
                            label: `Pay ${inv.invoiceNumber} (${st.studentName})`,
                            href: payPath,
                        });
                        lines.push(
                            `• *${st.studentName}* — *${inv.invoiceNumber}*: *${formatCurrencyPrecise(bal)}*${inv.dueDate ? ` (Due ${inv.dueDate})` : ''}`,
                            `  Pay via UPI / Card: ${cleanOrigin}${payPath}`,
                        );
                    }
                }
            }
            lines.push('', 'Reply *MENU* for other school services.');
            return {
                ok: true,
                intent,
                guardianName,
                guardianPhoneMasked,
                consentVerified: true,
                studentNames,
                replyText: lines.join('\n'),
                actionLinks,
            };
        }

        if (intent === 'LAST_RECEIPT') {
            const lines: string[] = [`*${schoolRow.name} — Official Payment Receipts*`, ''];
            for (const st of students) {
                const rec = await q<{
                    receiptNumber: string;
                    amount: string;
                    method: string;
                    paidAt: string | null;
                    invoiceNumber: string;
                }>`
                    SELECT
                        r.receipt_number AS "receiptNumber",
                        p.amount,
                        p.method::text AS method,
                        to_char(p.paid_at, 'YYYY-MM-DD') AS "paidAt",
                        i.invoice_number AS "invoiceNumber"
                    FROM payments p
                    JOIN invoices i ON i.id = p.invoice_id AND i.tenant_id = p.tenant_id
                    JOIN receipts r ON r.payment_id = p.id AND r.tenant_id = p.tenant_id
                    WHERE p.tenant_id = ${input.tenantId}
                      AND i.student_id = ${st.studentId}
                      AND p.status = 'COMPLETED'
                    ORDER BY p.paid_at DESC NULLS LAST
                    LIMIT 1
                `.maybeOne();

                if (!rec) {
                    lines.push(`• *${st.studentName}*: No completed fee receipt recorded yet.`);
                } else {
                    lines.push(
                        `• *${st.studentName}*: Receipt *${rec.receiptNumber}* · *${formatCurrencyPrecise(Number(rec.amount))}* via ${rec.method}${rec.paidAt ? ` on ${rec.paidAt}` : ''} (${rec.invoiceNumber})`,
                    );
                }
            }
            lines.push('', 'Reply *1* to view any pending invoices or *MENU* for all options.');
            return {
                ok: true,
                intent,
                guardianName,
                guardianPhoneMasked,
                consentVerified: true,
                studentNames,
                replyText: lines.join('\n'),
                actionLinks,
            };
        }

        if (intent === 'ATTENDANCE') {
            const now = new Date();
            const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
            const lines: string[] = [`*${schoolRow.name} — Monthly Attendance Register*`, ''];

            for (const st of students) {
                const att = await q<{
                    present: number;
                    absent: number;
                    late: number;
                    marked: number;
                }>`
                    SELECT
                        COUNT(*) FILTER (WHERE status = 'PRESENT')::int AS present,
                        COUNT(*) FILTER (WHERE status = 'ABSENT')::int AS absent,
                        COUNT(*) FILTER (WHERE status = 'LATE')::int AS late,
                        COUNT(*) FILTER (WHERE status <> 'HOLIDAY')::int AS marked
                    FROM attendance_records
                    WHERE tenant_id = ${input.tenantId}
                      AND student_id = ${st.studentId}
                      AND date >= ${monthStart}::date
                `.one();

                const marked = att?.marked ?? 0;
                const present = att?.present ?? 0;
                const late = att?.late ?? 0;
                const absent = att?.absent ?? 0;
                const rate = marked > 0 ? Math.round(((present + late) / marked) * 100) : null;

                lines.push(
                    rate !== null
                        ? `• *${st.studentName}* (${st.gradeName}-${st.sectionName}): *${rate}%* (${present} Present · ${late} Late · ${absent} Absent of ${marked} days)`
                        : `• *${st.studentName}* (${st.gradeName}-${st.sectionName}): No register entries marked yet this month.`,
                );
            }
            lines.push('', 'Reply *MENU* for other services.');
            return {
                ok: true,
                intent,
                guardianName,
                guardianPhoneMasked,
                consentVerified: true,
                studentNames,
                replyText: lines.join('\n'),
                actionLinks,
            };
        }

        if (intent === 'REPORT_CARD') {
            const board = normalizeBoardPreset(schoolRow.affiliationBoard);
            const lines: string[] = [`*${schoolRow.name} — Published Academic Results (${board})*`, ''];

            for (const st of students) {
                const latestExam = await q<{
                    examId: string;
                    examName: string;
                    avgPct: string;
                    subjectCount: number;
                }>`
                    SELECT
                        e.id AS "examId",
                        e.name AS "examName",
                        ROUND(AVG(sr.marks_obtained::numeric / NULLIF(es.max_marks::numeric, 0)) * 100, 1)::text AS "avgPct",
                        COUNT(*)::int AS "subjectCount"
                    FROM student_results sr
                    JOIN exam_schedules es ON es.id = sr.exam_schedule_id
                    JOIN exams e ON e.id = es.exam_id AND e.tenant_id = sr.tenant_id
                    WHERE sr.tenant_id = ${input.tenantId}
                      AND sr.student_id = ${st.studentId}
                      AND e.status = 'PUBLISHED'
                      AND sr.is_absent = false
                    GROUP BY e.id, e.name, e.start_date
                    ORDER BY e.start_date DESC
                    LIMIT 1
                `.maybeOne();

                if (!latestExam) {
                    lines.push(`• *${st.studentName}*: No published examination results yet.`);
                } else {
                    const pct = Number(latestExam.avgPct);
                    const bg = computeBoardGrade(pct, board, false);
                    const rcToken = signReportCardVerificationToken({
                        tenantId: input.tenantId,
                        studentId: st.studentId,
                        examId: latestExam.examId,
                        board,
                    });
                    const verifyPath = `/verify/report-card/${rcToken}`;
                    actionLinks.push({
                        label: `Verify Transcript (${st.studentName})`,
                        href: verifyPath,
                    });
                    lines.push(
                        `• *${st.studentName}* — *${latestExam.examName}*: *${pct}%* · Grade *${bg.grade}* (${bg.descriptor}) across ${latestExam.subjectCount} papers.`,
                        `  Official Seal: ${cleanOrigin}${verifyPath}`,
                    );
                }
            }
            lines.push('', 'Reply *MENU* for other services.');
            return {
                ok: true,
                intent,
                guardianName,
                guardianPhoneMasked,
                consentVerified: true,
                studentNames,
                replyText: lines.join('\n'),
                actionLinks,
            };
        }

        // BUS_STATUS
        const todayIso = new Date().toISOString().slice(0, 10);
        const lines: string[] = [`*${schoolRow.name} — Transport & Dismissal Gate Pass*`, ''];
        for (const st of students) {
            const tr = await q<{
                routeName: string;
                vehicleNumber: string;
                stopName: string | null;
                pickupTime: string | null;
                dropTime: string | null;
            }>`
                SELECT
                    r.name AS "routeName",
                    v.vehicle_number AS "vehicleNumber",
                    stp.name AS "stopName",
                    stp.pickup_time AS "pickupTime",
                    stp.drop_time AS "dropTime"
                FROM student_transport stp_link
                JOIN routes r ON r.id = stp_link.route_id AND r.tenant_id = stp_link.tenant_id
                JOIN vehicles v ON v.id = r.vehicle_id AND v.tenant_id = stp_link.tenant_id
                LEFT JOIN stops stp ON stp.id = stp_link.stop_id AND stp.route_id = r.id
                WHERE stp_link.tenant_id = ${input.tenantId}
                  AND stp_link.student_id = ${st.studentId}
                ORDER BY stp_link.start_date DESC NULLS LAST
                LIMIT 1
            `.maybeOne();

            if (tr) {
                lines.push(
                    `• *${st.studentName}*: *${tr.routeName}* (${tr.vehicleNumber})${tr.stopName ? ` · Stop: ${tr.stopName}` : ''} · Pickup ${tr.pickupTime || '—'} / Drop ${tr.dropTime || '—'}`,
                );
            } else {
                lines.push(`• *${st.studentName}*: Direct Guardian Dismissal`);
            }

            if (firstGuardian.userId) {
                const gpToken = signGatePassToken({
                    tenantId: input.tenantId,
                    studentId: st.studentId,
                    guardianUserId: firstGuardian.userId,
                    validDate: todayIso,
                });
                const verifyPath = `/verify/gate-pass/${gpToken}`;
                const deskCode = deriveShortVerificationCode(gpToken, 'GP');
                actionLinks.push({
                    label: `Gate Pass ${deskCode} (${st.studentName})`,
                    href: verifyPath,
                });
                lines.push(`  Gate Code *${deskCode}*: ${cleanOrigin}${verifyPath}`);
            }
        }
        lines.push('', 'Reply *MENU* for other services.');
        return {
            ok: true,
            intent,
            guardianName,
            guardianPhoneMasked,
            consentVerified: true,
            studentNames,
            replyText: lines.join('\n'),
            actionLinks,
        };
    });
}
