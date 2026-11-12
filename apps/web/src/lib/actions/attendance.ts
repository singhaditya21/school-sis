'use server';

import { sql } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { getSession } from '@/lib/auth/session';
import { getSmsProvider } from '@/lib/providers/sms';
import { getEmailProvider } from '@/lib/providers/email';
import { pusher } from '@/lib/pusher';
import { decryptFieldTolerant } from '@/lib/encryption';
import { isDemoSession, isDemoTenantId } from '@/lib/tenant/demo-guard';

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function getTeacherAssignedSectionIds(tenantId: string, userId: string): Promise<string[]> {
    const rows = await sql<{ id: string }>`
        SELECT sec.id
        FROM sections sec
        LEFT JOIN staff_profiles sp ON sp.user_id = ${userId} AND sp.tenant_id = ${tenantId}
        WHERE sec.tenant_id = ${tenantId}
          AND (
              sec.class_teacher_id = ${userId}
              OR (sp.id IS NOT NULL AND sec.class_teacher_id = sp.id)
              OR EXISTS (
                  SELECT 1
                  FROM timetable_entries te
                  WHERE te.tenant_id = ${tenantId}
                    AND te.section_id = sec.id
                    AND (
                        te.teacher_id = ${userId}
                        OR (sp.id IS NOT NULL AND te.teacher_id = sp.id)
                    )
              )
          )
    `;
    return rows.map((r) => r.id);
}

export interface ClassAttendanceSummary {
    gradeName: string;
    sectionName: string;
    sectionId: string;
    gradeId: string;
    studentCount: number;
    presentToday: number;
    absentToday: number;
    lateToday: number;
    attendanceMarked: boolean;
}

export interface AttendanceWeeklyStats {
    status: string;
    count: number;
}

export async function getClassAttendanceSummary(date?: string): Promise<ClassAttendanceSummary[]> {
    const { tenantId, userId, session } = await requireAuth('attendance:read');
    const targetDate = date || new Date().toISOString().split('T')[0];

    let teacherAllowed: Set<string> | null = null;
    if (session.role === 'TEACHER') {
        teacherAllowed = new Set(await getTeacherAssignedSectionIds(tenantId, userId));
    }

    const allSectionRows = await sql<{
        sectionId: string;
        sectionName: string;
        gradeId: string;
        gradeName: string;
        gradeOrder: number;
    }>`
        SELECT s.id AS "sectionId", s.name AS "sectionName", g.id AS "gradeId", g.name AS "gradeName", g.display_order AS "gradeOrder"
        FROM sections s
        INNER JOIN grades g ON s.grade_id = g.id
        WHERE s.tenant_id = ${tenantId}
        ORDER BY g.display_order ASC, s.name ASC
    `;
    const sectionRows = teacherAllowed
        ? allSectionRows.filter((s) => teacherAllowed.has(s.sectionId))
        : allSectionRows;

    const result: ClassAttendanceSummary[] = [];

    for (const sec of sectionRows) {
        const studentCountRow = await sql<{ count: string }>`
            SELECT COUNT(*) AS count
            FROM students
            WHERE section_id = ${sec.sectionId}
              AND tenant_id = ${tenantId}
              AND status = 'ACTIVE'
              AND COALESCE(custom_data->>'erased', 'false') <> 'true'
        `.one();

        const attendanceRows = await sql<{ status: string; count: string }>`
            SELECT status, COUNT(*) AS count
            FROM attendance_records
            WHERE section_id = ${sec.sectionId} AND tenant_id = ${tenantId} AND date = ${targetDate}
            GROUP BY status
        `;

        const statMap: Record<string, number> = {};
        let totalMarked = 0;
        for (const row of attendanceRows) {
            const countVal = parseInt(row.count, 10);
            statMap[row.status] = countVal;
            totalMarked += countVal;
        }

        result.push({
            gradeName: sec.gradeName,
            sectionName: sec.sectionName,
            sectionId: sec.sectionId,
            gradeId: sec.gradeId,
            studentCount: parseInt(studentCountRow.count, 10),
            presentToday: statMap['PRESENT'] || 0,
            absentToday: statMap['ABSENT'] || 0,
            lateToday: statMap['LATE'] || 0,
            attendanceMarked: totalMarked > 0,
        });
    }

    return result;
}

export async function getAttendanceWeeklyStats(): Promise<AttendanceWeeklyStats[]> {
    const { tenantId } = await requireAuth('attendance:read');

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const startDate = sevenDaysAgo.toISOString().split('T')[0];

    const rows = await sql<{ status: string; count: string }>`
        SELECT status, COUNT(*) AS count
        FROM attendance_records
        WHERE tenant_id = ${tenantId} AND date >= ${startDate}
        GROUP BY status
    `;

    return rows.map((r) => ({
        status: r.status,
        count: parseInt(r.count, 10),
    }));
}

export interface AttendanceReportRow {
    gradeName: string;
    sectionName: string;
    totalStudents: number;
    workingDays: number;
    presentCount: number;
    absentCount: number;
    lateCount: number;
    attendanceRate: number;
}

export async function getAttendanceReport(
    startDate: string,
    endDate: string,
): Promise<AttendanceReportRow[]> {
    const { tenantId, userId, session } = await requireAuth('attendance:read');

    let teacherAllowed: Set<string> | null = null;
    if (session.role === 'TEACHER') {
        teacherAllowed = new Set(await getTeacherAssignedSectionIds(tenantId, userId));
    }

    const allSectionRows = await sql<{
        sectionId: string;
        sectionName: string;
        gradeName: string;
        gradeOrder: number;
    }>`
        SELECT s.id AS "sectionId", s.name AS "sectionName", g.name AS "gradeName", g.display_order AS "gradeOrder"
        FROM sections s
        INNER JOIN grades g ON s.grade_id = g.id
        WHERE s.tenant_id = ${tenantId}
        ORDER BY g.display_order ASC, s.name ASC
    `;
    const sectionRows = teacherAllowed
        ? allSectionRows.filter((s) => teacherAllowed.has(s.sectionId))
        : allSectionRows;

    const report: AttendanceReportRow[] = [];

    for (const sec of sectionRows) {
        const studentCountRow = await sql<{ count: string }>`
            SELECT COUNT(*) AS count
            FROM students
            WHERE section_id = ${sec.sectionId}
              AND tenant_id = ${tenantId}
              AND status = 'ACTIVE'
              AND COALESCE(custom_data->>'erased', 'false') <> 'true'
        `.one();

        const statusRows = await sql<{ status: string; count: string }>`
            SELECT status, COUNT(*) AS count
            FROM attendance_records
            WHERE section_id = ${sec.sectionId} AND tenant_id = ${tenantId} AND date >= ${startDate} AND date <= ${endDate}
            GROUP BY status
        `;

        const stats: Record<string, number> = {};
        let total = 0;
        for (const row of statusRows) {
            const countVal = parseInt(row.count, 10);
            stats[row.status] = countVal;
            total += countVal;
        }

        const presentCount = (stats['PRESENT'] || 0) + (stats['LATE'] || 0);
        
        const uniqueDays = await sql<{ date: string }>`
            SELECT date
            FROM attendance_records
            WHERE section_id = ${sec.sectionId} AND tenant_id = ${tenantId} AND date >= ${startDate} AND date <= ${endDate}
            GROUP BY date
        `;

        report.push({
            gradeName: sec.gradeName,
            sectionName: sec.sectionName,
            totalStudents: parseInt(studentCountRow.count, 10),
            workingDays: uniqueDays.length,
            presentCount,
            absentCount: stats['ABSENT'] || 0,
            lateCount: stats['LATE'] || 0,
            attendanceRate: total > 0 ? Math.round((presentCount / total) * 100) : 0,
        });
    }

    return report;
}

export async function notifyAbsentParents(
    date?: string,
    sectionId?: string,
): Promise<{ sent: number; failed: number; errors: string[] }> {
    const { tenantId, userId, session } = await requireAuth('attendance:write');
    const targetDate = date || new Date().toISOString().split('T')[0];

    let allowedTeacherSections: Set<string> | null = null;
    if (session.role === 'TEACHER') {
        const assignedIds = await getTeacherAssignedSectionIds(tenantId, userId);
        if (assignedIds.length === 0) {
            throw new Error('Unauthorized: Teacher is not assigned to any class section.');
        }
        allowedTeacherSections = new Set(assignedIds);
        if (sectionId && !allowedTeacherSections.has(sectionId)) {
            throw new Error('Unauthorized: Teacher is not assigned to the target class section.');
        }
    }

    const sectionFilter = sectionId ? sql`AND section_id = ${sectionId}` : sql``;

    const rawAbsentRows = await sql<{ recordId: string; studentId: string; sectionId: string }>`
        SELECT id AS "recordId", student_id AS "studentId", section_id AS "sectionId"
        FROM attendance_records
        WHERE tenant_id = ${tenantId}
          AND date = ${targetDate}
          AND status = 'ABSENT'
          AND is_notified = false
          ${sectionFilter}
    `;

    const absentRows = allowedTeacherSections
        ? rawAbsentRows.filter((r) => allowedTeacherSections.has(r.sectionId))
        : rawAbsentRows;

    if (absentRows.length === 0) return { sent: 0, failed: 0, errors: [] };

    let fullSession: Awaited<ReturnType<typeof getSession>> = null;
    try {
        fullSession = await getSession();
    } catch {
        fullSession = null;
    }
    if (isDemoSession(fullSession) || (await isDemoTenantId(tenantId))) {
        return { sent: absentRows.length, failed: 0, errors: [] };
    }

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const row of absentRows) {
        try {
            const student = await sql<{ firstName: string; lastName: string }>`
                SELECT first_name AS "firstName", last_name AS "lastName"
                FROM students
                WHERE id = ${row.studentId}
                  AND tenant_id = ${tenantId}
                  AND COALESCE(custom_data->>'erased', 'false') <> 'true'
            `.maybeOne();

            const rawGuardian = await sql<{ firstName: string; phone: string | null; email: string | null }>`
                SELECT first_name AS "firstName",
                       COALESCE(phone_enc, phone) AS "phone",
                       COALESCE(email_enc, email) AS "email"
                FROM guardians
                WHERE student_id = ${row.studentId}
                  AND tenant_id = ${tenantId}
                  AND is_primary = true
            `.maybeOne();

            if (!rawGuardian || !student) {
                failed++;
                continue;
            }

            const guardian = {
                ...rawGuardian,
                phone: rawGuardian.phone == null ? null : decryptFieldTolerant(rawGuardian.phone),
                email: rawGuardian.email == null ? null : decryptFieldTolerant(rawGuardian.email),
            };

            const studentName = `${student.firstName} ${student.lastName}`;
            const dateFormatted = new Date(targetDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
            let attempted = 0;
            let delivered = 0;

            if (guardian.phone) {
                attempted++;
                const smsResult = await getSmsProvider().send(
                    guardian.phone,
                    `Dear ${guardian.firstName}, ${studentName} was marked absent on ${dateFormatted}. If incorrect, please contact the school. - ScholarMind`,
                );
                if (smsResult.success) delivered++;
                else errors.push(`SMS for ${row.studentId}: ${smsResult.error || 'provider rejected delivery'}`);
            }

            if (guardian.email) {
                attempted++;
                const emailResult = await getEmailProvider().send({
                    to: guardian.email,
                    subject: `Absence Alert - ${studentName}`,
                    html: `<p>Dear ${escapeHtml(guardian.firstName)},</p><p>${escapeHtml(studentName)} was marked <strong>absent</strong> on ${escapeHtml(dateFormatted)}.</p><p>If this is incorrect, please contact the school office.</p><p style="color:#888;font-size:12px">ScholarMind Automated Notification</p>`,
                });
                if (emailResult.success) delivered++;
                else errors.push(`Email for ${row.studentId}: ${emailResult.error || 'provider rejected delivery'}`);
            }

            if (attempted === 0 || delivered === 0) {
                failed++;
                if (attempted === 0) errors.push(`No guardian delivery address for ${row.studentId}.`);
                continue;
            }

            await sql`
                UPDATE attendance_records
                SET is_notified = true
                WHERE id = ${row.recordId} AND tenant_id = ${tenantId}
            `.execute();

            sent++;
        } catch (err) {
            failed++;
            errors.push((err as Error).message);
        }
    }

    await pusher.trigger('attendance-channel', 'attendance-marked', {
        tenantId,
        date: targetDate,
        sent,
        failed
    });

    return { sent, failed, errors };
}
