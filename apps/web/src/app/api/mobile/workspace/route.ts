import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { sqlFor, withTenant } from '@/lib/db';
import { requireApiAuth, ROLE_GROUPS } from '@/lib/auth/api';
import { hasPermission, type UserRole } from '@/lib/rbac/permissions';
import { signInvoicePaymentToken } from '@/lib/payments/payment-links';
import {
    buildVerificationMatrix,
    deriveShortVerificationCode,
    signGatePassToken,
} from '@/lib/security/gate-pass-token';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_ATTENDANCE_STATUSES = new Set(['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'EXCUSED']);

export async function GET(request: Request) {
    const auth = await requireApiAuth();
    if (auth.ok === false) return auth.response;

    const { tenantId, userId, role } = auth.context;
    const url = new URL(request.url);
    const requestedChildId = url.searchParams.get('childId');
    const requestedSectionId = url.searchParams.get('sectionId');
    const todayIso = new Date().toISOString().slice(0, 10);

    if (role === 'PARENT') {
        const payload = await withTenant(tenantId, async (client) => {
            const q = sqlFor(client);
            const children = await q<{
                id: string;
                name: string;
                gradeId: string;
                sectionId: string;
                gradeName: string;
                sectionName: string;
                admissionNumber: string;
            }>`
                SELECT
                    s.id,
                    s.first_name || ' ' || s.last_name AS name,
                    s.grade_id AS "gradeId",
                    s.section_id AS "sectionId",
                    g.name AS "gradeName",
                    sec.name AS "sectionName",
                    s.admission_number AS "admissionNumber"
                FROM students s
                JOIN guardians gd ON gd.student_id = s.id AND gd.tenant_id = s.tenant_id
                JOIN grades g ON g.id = s.grade_id AND g.tenant_id = s.tenant_id
                JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = s.tenant_id
                WHERE s.tenant_id = ${tenantId} AND gd.user_id = ${userId}
                GROUP BY s.id, s.first_name, s.last_name, s.grade_id, s.section_id, g.name, sec.name, s.admission_number
                ORDER BY s.first_name ASC
            `;

            if (children.length === 0) {
                return { mode: 'PARENT' as const, children: [], selectedChild: null };
            }

            const selectedChild =
                (requestedChildId && UUID_RE.test(requestedChildId)
                    ? children.find((c) => c.id === requestedChildId)
                    : undefined) ?? children[0];

            const invoices = await q<{
                id: string;
                invoiceNumber: string;
                description: string | null;
                totalAmount: string;
                paidAmount: string;
                dueDate: string | null;
                status: string;
            }>`
                SELECT
                    i.id,
                    i.invoice_number AS "invoiceNumber",
                    i.description,
                    i.total_amount AS "totalAmount",
                    i.paid_amount AS "paidAmount",
                    to_char(i.due_date, 'YYYY-MM-DD') AS "dueDate",
                    i.status::text AS status
                FROM invoices i
                WHERE i.tenant_id = ${tenantId}
                  AND i.student_id = ${selectedChild.id}
                  AND i.status <> 'PAID'
                  AND i.status <> 'CANCELLED'
                  AND i.status <> 'WAIVED'
                ORDER BY i.due_date ASC NULLS LAST
                LIMIT 5
            `;

            const latestReceipt = await q<{
                receiptNumber: string;
                amount: string;
                paidAt: string | null;
            }>`
                SELECT
                    r.receipt_number AS "receiptNumber",
                    p.amount,
                    to_char(p.paid_at, 'YYYY-MM-DD') AS "paidAt"
                FROM payments p
                JOIN invoices i ON i.id = p.invoice_id AND i.tenant_id = p.tenant_id
                JOIN receipts r ON r.payment_id = p.id AND r.tenant_id = p.tenant_id
                WHERE p.tenant_id = ${tenantId}
                  AND i.student_id = ${selectedChild.id}
                  AND p.status = 'COMPLETED'
                ORDER BY p.paid_at DESC NULLS LAST
                LIMIT 1
            `.maybeOne();

            const now = new Date();
            const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
            const attSummary = await q<{
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
                WHERE tenant_id = ${tenantId}
                  AND student_id = ${selectedChild.id}
                  AND date >= ${monthStart}::date
            `.one();

            const homework = await q<{
                id: string;
                title: string;
                dueDate: string | null;
                subjectName: string;
            }>`
                SELECT
                    ha.id,
                    ha.title,
                    to_char(ha.due_date, 'YYYY-MM-DD') AS "dueDate",
                    sub.name AS "subjectName"
                FROM homework_assignments ha
                JOIN subjects sub ON sub.id = ha.subject_id AND sub.tenant_id = ha.tenant_id
                WHERE ha.tenant_id = ${tenantId}
                  AND ha.grade_id = ${selectedChild.gradeId}
                  AND (ha.section_id IS NULL OR ha.section_id = ${selectedChild.sectionId})
                ORDER BY ha.due_date DESC NULLS LAST
                LIMIT 5
            `;

            const transport = await q<{
                routeName: string;
                vehicleNumber: string;
                stopName: string | null;
                pickupTime: string | null;
                dropTime: string | null;
                driverName: string | null;
                driverPhone: string | null;
            }>`
                SELECT
                    r.name AS "routeName",
                    v.vehicle_number AS "vehicleNumber",
                    stp.name AS "stopName",
                    stp.pickup_time AS "pickupTime",
                    stp.drop_time AS "dropTime",
                    v.driver_name AS "driverName",
                    v.driver_phone AS "driverPhone"
                FROM student_transport st
                JOIN routes r ON r.id = st.route_id AND r.tenant_id = st.tenant_id
                JOIN vehicles v ON v.id = r.vehicle_id AND v.tenant_id = st.tenant_id
                LEFT JOIN stops stp ON stp.id = st.stop_id AND stp.route_id = r.id
                WHERE st.tenant_id = ${tenantId}
                  AND st.student_id = ${selectedChild.id}
                ORDER BY st.start_date DESC NULLS LAST
                LIMIT 1
            `.maybeOne();

            const gateToken = signGatePassToken({
                tenantId,
                studentId: selectedChild.id,
                guardianUserId: userId,
                validDate: todayIso,
            });

            const pendingInvoices = invoices.map((inv) => {
                const balance = Math.max(0, Number(inv.totalAmount) - Number(inv.paidAmount || 0));
                const payToken = signInvoicePaymentToken({ tenantId, invoiceId: inv.id });
                return {
                    id: inv.id,
                    invoiceNumber: inv.invoiceNumber,
                    description: inv.description,
                    balance,
                    dueDate: inv.dueDate,
                    status: inv.status,
                    payPath: `/pay/${payToken}`,
                };
            });

            const outstanding = pendingInvoices.reduce((acc, item) => acc + item.balance, 0);
            const marked = attSummary?.marked ?? 0;
            const present = attSummary?.present ?? 0;
            const late = attSummary?.late ?? 0;

            return {
                mode: 'PARENT' as const,
                children: children.map((c) => ({
                    id: c.id,
                    name: c.name,
                    gradeName: c.gradeName,
                    sectionName: c.sectionName,
                    admissionNumber: c.admissionNumber,
                })),
                selectedChild: {
                    id: selectedChild.id,
                    name: selectedChild.name,
                    gradeName: selectedChild.gradeName,
                    sectionName: selectedChild.sectionName,
                    admissionNumber: selectedChild.admissionNumber,
                },
                fees: {
                    outstanding,
                    pendingInvoices,
                },
                latestReceipt: latestReceipt
                    ? {
                          receiptNumber: latestReceipt.receiptNumber,
                          amount: Number(latestReceipt.amount),
                          paidAt: latestReceipt.paidAt,
                      }
                    : null,
                attendance: {
                    present,
                    absent: attSummary?.absent ?? 0,
                    late,
                    marked,
                    rate: marked > 0 ? Math.round(((present + late) / marked) * 100) : null,
                },
                homework,
                transport: transport ?? null,
                gatePass: {
                    token: gateToken,
                    deskCode: deriveShortVerificationCode(gateToken, 'GP'),
                    validDate: todayIso,
                    verifyPath: `/verify/gate-pass/${gateToken}`,
                    matrix: buildVerificationMatrix(gateToken, 21),
                },
            };
        });

        return NextResponse.json(payload);
    }

    if ((ROLE_GROUPS.staff as readonly string[]).includes(role)) {
        const payload = await withTenant(tenantId, async (client) => {
            const q = sqlFor(client);
            const sections = await q<{
                id: string;
                gradeName: string;
                sectionName: string;
                studentCount: number;
            }>`
                SELECT
                    sec.id,
                    g.name AS "gradeName",
                    sec.name AS "sectionName",
                    (
                        SELECT COUNT(*)::int
                        FROM students s
                        WHERE s.section_id = sec.id AND s.tenant_id = sec.tenant_id AND s.status = 'ACTIVE'
                    ) AS "studentCount"
                FROM sections sec
                JOIN grades g ON g.id = sec.grade_id AND g.tenant_id = sec.tenant_id
                WHERE sec.tenant_id = ${tenantId}
                ORDER BY g.display_order ASC, sec.name ASC
                LIMIT 20
            `;

            const activeSection =
                (requestedSectionId && UUID_RE.test(requestedSectionId)
                    ? sections.find((s) => s.id === requestedSectionId)
                    : undefined) ?? sections[0] ?? null;

            const roster = activeSection
                ? await q<{
                      studentId: string;
                      name: string;
                      rollNumber: number | null;
                      admissionNumber: string;
                      todayStatus: string | null;
                  }>`
                      SELECT
                          s.id AS "studentId",
                          s.first_name || ' ' || s.last_name AS name,
                          s.roll_number AS "rollNumber",
                          s.admission_number AS "admissionNumber",
                          (
                              SELECT ar.status::text
                              FROM attendance_records ar
                              WHERE ar.student_id = s.id
                                AND ar.tenant_id = s.tenant_id
                                AND ar.date = ${todayIso}::date
                              LIMIT 1
                          ) AS "todayStatus"
                      FROM students s
                      WHERE s.tenant_id = ${tenantId}
                        AND s.section_id = ${activeSection.id}
                        AND s.status = 'ACTIVE'
                      ORDER BY s.roll_number ASC NULLS LAST, s.first_name ASC
                  `
                : [];

            return {
                mode: 'STAFF' as const,
                date: todayIso,
                sections,
                selectedSection: activeSection,
                roster,
            };
        });

        return NextResponse.json(payload);
    }

    return NextResponse.json({ mode: 'STUDENT', date: todayIso });
}

export async function POST(request: Request) {
    const auth = await requireApiAuth();
    if (auth.ok === false) return auth.response;

    const { tenantId, userId, role } = auth.context;
    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
    }

    const action = typeof body.action === 'string' ? body.action : '';

    if (action === 'SYNC_ATTENDANCE') {
        const canWriteAttendance =
            hasPermission(role as UserRole, 'attendance:write') ||
            ['TEACHER', 'PRINCIPAL', 'SCHOOL_ADMIN', 'SUPER_ADMIN', 'PLATFORM_ADMIN'].includes(role);
        if (!canWriteAttendance) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const sectionId = typeof body.sectionId === 'string' ? body.sectionId.trim() : '';
        const date = typeof body.date === 'string' ? body.date.trim() : '';
        const entries = Array.isArray(body.entries) ? body.entries : [];

        if (!UUID_RE.test(sectionId) || !DATE_RE.test(date) || entries.length === 0 || entries.length > 150) {
            return NextResponse.json(
                { error: 'Provide a valid sectionId, YYYY-MM-DD date, and 1–150 attendance entries.' },
                { status: 400 },
            );
        }

        const synced = await withTenant(tenantId, async (client) => {
            const q = sqlFor(client);
            const secRow = await q<{ id: string }>`
                SELECT id FROM sections WHERE id = ${sectionId} AND tenant_id = ${tenantId} LIMIT 1
            `.maybeOne();
            if (!secRow) {
                return { error: 'Section not found in active campus.' };
            }

            let savedCount = 0;
            for (const rawEntry of entries) {
                if (!rawEntry || typeof rawEntry !== 'object') continue;
                const rec = rawEntry as Record<string, unknown>;
                const studentId = typeof rec.studentId === 'string' ? rec.studentId.trim() : '';
                const status = typeof rec.status === 'string' ? rec.status.trim().toUpperCase() : '';
                if (!UUID_RE.test(studentId) || !ALLOWED_ATTENDANCE_STATUSES.has(status)) continue;

                const validStudent = await q<{ id: string }>`
                    SELECT id
                    FROM students
                    WHERE id = ${studentId} AND section_id = ${sectionId} AND tenant_id = ${tenantId}
                    LIMIT 1
                `.maybeOne();
                if (!validStudent) continue;

                const existing = await q<{ id: string }>`
                    SELECT id
                    FROM attendance_records
                    WHERE tenant_id = ${tenantId} AND student_id = ${studentId} AND date = ${date}::date
                    LIMIT 1
                `.maybeOne();

                if (existing) {
                    await q`
                        UPDATE attendance_records
                        SET status = ${status},
                            marked_by = ${userId},
                            updated_at = NOW()
                        WHERE id = ${existing.id} AND tenant_id = ${tenantId}
                    `.execute();
                } else {
                    await q`
                        INSERT INTO attendance_records (id, tenant_id, student_id, section_id, date, status, marked_by)
                        VALUES (${crypto.randomUUID()}, ${tenantId}, ${studentId}, ${sectionId}, ${date}::date, ${status}, ${userId})
                    `.execute();
                }
                savedCount += 1;
            }

            return { savedCount };
        });

        if ('error' in synced) {
            return NextResponse.json({ error: synced.error }, { status: 404 });
        }

        return NextResponse.json({
            ok: true,
            savedCount: synced.savedCount,
            syncedAt: new Date().toISOString(),
        });
    }

    if (action === 'SUBMIT_PARENT_LEAVE_NOTE') {
        if (role !== 'PARENT') {
            return NextResponse.json({ error: 'Only guardian accounts can submit leave notes.' }, { status: 403 });
        }

        const studentId = typeof body.studentId === 'string' ? body.studentId.trim() : '';
        const leaveDate = typeof body.leaveDate === 'string' ? body.leaveDate.trim() : '';
        const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 400) : '';

        if (!UUID_RE.test(studentId) || !DATE_RE.test(leaveDate) || reason.length < 3) {
            return NextResponse.json(
                { error: 'Select a child, leave date (YYYY-MM-DD), and brief reason.' },
                { status: 400 },
            );
        }

        const result = await withTenant(tenantId, async (client) => {
            const q = sqlFor(client);
            const linked = await q<{ studentName: string }>`
                SELECT s.first_name || ' ' || s.last_name AS "studentName"
                FROM students s
                JOIN guardians gd ON gd.student_id = s.id AND gd.tenant_id = s.tenant_id
                WHERE s.id = ${studentId}
                  AND gd.user_id = ${userId}
                  AND s.tenant_id = ${tenantId}
                LIMIT 1
            `.maybeOne();

            if (!linked) {
                return { error: 'Guardian link not verified for this student.' };
            }

            await q`
                INSERT INTO messages (
                    id, tenant_id, recipient_id, sent_by, channel, subject, body, status, sent_at
                ) VALUES (
                    ${crypto.randomUUID()},
                    ${tenantId},
                    ${userId},
                    ${userId},
                    'IN_APP',
                    ${`Leave Note Logged — ${linked.studentName} (${leaveDate})`},
                    ${`Guardian leave request recorded for ${leaveDate}: ${reason}`},
                    'SENT',
                    NOW()
                )
            `.execute();

            return { ok: true };
        });

        if ('error' in result) {
            return NextResponse.json({ error: result.error }, { status: 403 });
        }

        return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unsupported mobile workspace action.' }, { status: 400 });
}
