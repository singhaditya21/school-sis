'use server';

import { db } from '@/lib/db';
import { attendanceRecords, students, grades, sections, guardians } from '@/lib/db/schema';
import { eq, and, count, sql, asc, gte, lte, ne } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { getSmsProvider } from '@/lib/providers/sms';
import { getEmailProvider } from '@/lib/providers/email';
import { randomUUID } from 'crypto';

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
    const { tenantId } = await requireAuth('attendance:read');
    const targetDate = date || new Date().toISOString().split('T')[0];

    // Get all sections with grade info and student counts
    const sectionRows = await db
        .select({
            sectionId: sections.id,
            sectionName: sections.name,
            gradeId: grades.id,
            gradeName: grades.name,
            gradeOrder: grades.displayOrder,
        })
        .from(sections)
        .innerJoin(grades, eq(sections.gradeId, grades.id))
        .where(eq(sections.tenantId, tenantId))
        .orderBy(asc(grades.displayOrder), asc(sections.name));

    const result: ClassAttendanceSummary[] = [];

    for (const sec of sectionRows) {
        // Count students in this section
        const [studentCountRow] = await db
            .select({ count: count() })
            .from(students)
            .where(and(
                eq(students.sectionId, sec.sectionId),
                eq(students.tenantId, tenantId),
                eq(students.status, 'ACTIVE')
            ));

        // Get attendance for this section today
        const attendanceRows = await db
            .select({
                status: attendanceRecords.status,
                count: count(),
            })
            .from(attendanceRecords)
            .where(and(
                eq(attendanceRecords.sectionId, sec.sectionId),
                eq(attendanceRecords.tenantId, tenantId),
                eq(attendanceRecords.date, targetDate)
            ))
            .groupBy(attendanceRecords.status);

        const statMap: Record<string, number> = {};
        let totalMarked = 0;
        for (const row of attendanceRows) {
            statMap[row.status] = row.count;
            totalMarked += row.count;
        }

        result.push({
            gradeName: sec.gradeName,
            sectionName: sec.sectionName,
            sectionId: sec.sectionId,
            gradeId: sec.gradeId,
            studentCount: studentCountRow.count,
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

    // Get stats for the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const startDate = sevenDaysAgo.toISOString().split('T')[0];

    const rows = await db
        .select({
            status: attendanceRecords.status,
            count: count(),
        })
        .from(attendanceRecords)
        .where(and(
            eq(attendanceRecords.tenantId, tenantId),
            sql`${attendanceRecords.date} >= ${startDate}`
        ))
        .groupBy(attendanceRecords.status);

    return rows.map(r => ({
        status: r.status,
        count: r.count,
    }));
}

// ─── Attendance Report ───────────────────────────────────────

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
    const { tenantId } = await requireAuth('attendance:read');

    const sectionRows = await db
        .select({
            sectionId: sections.id,
            sectionName: sections.name,
            gradeName: grades.name,
            gradeOrder: grades.displayOrder,
        })
        .from(sections)
        .innerJoin(grades, eq(sections.gradeId, grades.id))
        .where(eq(sections.tenantId, tenantId))
        .orderBy(asc(grades.displayOrder), asc(sections.name));

    const report: AttendanceReportRow[] = [];

    for (const sec of sectionRows) {
        const [studentCount] = await db
            .select({ count: count() })
            .from(students)
            .where(and(
                eq(students.sectionId, sec.sectionId),
                eq(students.tenantId, tenantId),
                eq(students.status, 'ACTIVE'),
            ));

        // Get attendance stats for date range
        const statusRows = await db
            .select({
                status: attendanceRecords.status,
                count: count(),
            })
            .from(attendanceRecords)
            .where(and(
                eq(attendanceRecords.sectionId, sec.sectionId),
                eq(attendanceRecords.tenantId, tenantId),
                gte(attendanceRecords.date, startDate),
                lte(attendanceRecords.date, endDate),
            ))
            .groupBy(attendanceRecords.status);

        const stats: Record<string, number> = {};
        let total = 0;
        for (const row of statusRows) {
            stats[row.status] = row.count;
            total += row.count;
        }

        const presentCount = (stats['PRESENT'] || 0) + (stats['LATE'] || 0);
        const uniqueDays = await db
            .select({ date: attendanceRecords.date })
            .from(attendanceRecords)
            .where(and(
                eq(attendanceRecords.sectionId, sec.sectionId),
                eq(attendanceRecords.tenantId, tenantId),
                gte(attendanceRecords.date, startDate),
                lte(attendanceRecords.date, endDate),
            ))
            .groupBy(attendanceRecords.date);

        report.push({
            gradeName: sec.gradeName,
            sectionName: sec.sectionName,
            totalStudents: studentCount.count,
            workingDays: uniqueDays.length,
            presentCount,
            absentCount: stats['ABSENT'] || 0,
            lateCount: stats['LATE'] || 0,
            attendanceRate: total > 0 ? Math.round((presentCount / total) * 100) : 0,
        });
    }

    return report;
}

// ─── Student Attendance Detail ───────────────────────────────

export interface StudentAttendanceDetail {
    studentName: string;
    className: string;
    totalDays: number;
    presentDays: number;
    absentDays: number;
    lateDays: number;
    attendanceRate: number;
    recentRecords: { date: string; status: string; remarks: string | null }[];
}

export async function getStudentAttendanceDetail(
    studentId: string,
    startDate?: string,
    endDate?: string,
): Promise<StudentAttendanceDetail | null> {
    const { tenantId } = await requireAuth('attendance:read');

    const start = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];

    const [student] = await db
        .select({
            firstName: students.firstName,
            lastName: students.lastName,
            gradeName: grades.name,
            sectionName: sections.name,
        })
        .from(students)
        .innerJoin(grades, eq(students.gradeId, grades.id))
        .innerJoin(sections, eq(students.sectionId, sections.id))
        .where(and(eq(students.id, studentId), eq(students.tenantId, tenantId)));

    if (!student) return null;

    const records = await db
        .select({
            date: attendanceRecords.date,
            status: attendanceRecords.status,
            remarks: attendanceRecords.remarks,
        })
        .from(attendanceRecords)
        .where(and(
            eq(attendanceRecords.studentId, studentId),
            eq(attendanceRecords.tenantId, tenantId),
            gte(attendanceRecords.date, start),
            lte(attendanceRecords.date, end),
        ))
        .orderBy(sql`${attendanceRecords.date} DESC`);

    const stats: Record<string, number> = {};
    for (const r of records) {
        stats[r.status] = (stats[r.status] || 0) + 1;
    }

    const present = (stats['PRESENT'] || 0) + (stats['LATE'] || 0);

    return {
        studentName: `${student.firstName} ${student.lastName}`,
        className: `${student.gradeName} - ${student.sectionName}`,
        totalDays: records.length,
        presentDays: stats['PRESENT'] || 0,
        absentDays: stats['ABSENT'] || 0,
        lateDays: stats['LATE'] || 0,
        attendanceRate: records.length > 0 ? Math.round((present / records.length) * 100) : 0,
        recentRecords: records.slice(0, 30).map(r => ({
            date: r.date,
            status: r.status,
            remarks: r.remarks,
        })),
    };
}

// ─── Absence Notification ────────────────────────────────────

export async function notifyAbsentParents(date?: string): Promise<{ sent: number; failed: number; errors: string[] }> {
    const { tenantId, userId } = await requireAuth('attendance:write');
    const targetDate = date || new Date().toISOString().split('T')[0];

    // Get absent students not yet notified
    const absentRows = await db
        .select({
            recordId: attendanceRecords.id,
            studentId: attendanceRecords.studentId,
        })
        .from(attendanceRecords)
        .where(and(
            eq(attendanceRecords.tenantId, tenantId),
            eq(attendanceRecords.date, targetDate),
            eq(attendanceRecords.status, 'ABSENT'),
            eq(attendanceRecords.isNotified, false),
        ));

    if (absentRows.length === 0) return { sent: 0, failed: 0, errors: [] };

    const smsProvider = getSmsProvider();
    const emailProvider = getEmailProvider();
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const row of absentRows) {
        try {
            const [student] = await db
                .select({ firstName: students.firstName, lastName: students.lastName })
                .from(students)
                .where(eq(students.id, row.studentId));

            const [guardian] = await db
                .select({ firstName: guardians.firstName, phone: guardians.phone, email: guardians.email })
                .from(guardians)
                .where(and(eq(guardians.studentId, row.studentId), eq(guardians.isPrimary, true)));

            if (!guardian) {
                failed++;
                continue;
            }

            const studentName = `${student.firstName} ${student.lastName}`;
            const dateFormatted = new Date(targetDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });

            if (guardian.phone) {
                await smsProvider.send(guardian.phone, `Dear ${guardian.firstName}, ${studentName} was marked absent on ${dateFormatted}. If incorrect, please contact the school. - ScholarMind`);
            }

            if (guardian.email) {
                await emailProvider.send({
                    to: guardian.email,
                    subject: `Absence Alert - ${studentName}`,
                    html: `<p>Dear ${guardian.firstName},</p><p>${studentName} was marked <strong>absent</strong> on ${dateFormatted}.</p><p>If this is incorrect, please contact the school office.</p><p style="color:#888;font-size:12px">ScholarMind Automated Notification</p>`,
                });
            }

            // Mark as notified
            await db.update(attendanceRecords)
                .set({ isNotified: true })
                .where(eq(attendanceRecords.id, row.recordId));

            sent++;
        } catch (err: any) {
            failed++;
            errors.push(err.message);
        }
    }

    return { sent, failed, errors };
}

