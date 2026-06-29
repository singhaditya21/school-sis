'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { getSmsProvider } from '@/lib/providers/sms';
import { getEmailProvider } from '@/lib/providers/email';
import { pusher } from '@/lib/pusher';

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

    const { rows: sectionRows } = await pool.query(`
        SELECT s.id AS "sectionId", s.name AS "sectionName", g.id AS "gradeId", g.name AS "gradeName", g.display_order AS "gradeOrder"
        FROM sections s
        INNER JOIN grades g ON s.grade_id = g.id
        WHERE s.tenant_id = $1
        ORDER BY g.display_order ASC, s.name ASC
    `, [tenantId]);

    const result: ClassAttendanceSummary[] = [];

    for (const sec of sectionRows) {
        const { rows: studentCountRows } = await pool.query(`
            SELECT COUNT(*) AS count
            FROM students
            WHERE section_id = $1 AND tenant_id = $2 AND status = 'ACTIVE'
        `, [sec.sectionId, tenantId]);

        const { rows: attendanceRows } = await pool.query(`
            SELECT status, COUNT(*) AS count
            FROM attendance_records
            WHERE section_id = $1 AND tenant_id = $2 AND date = $3
            GROUP BY status
        `, [sec.sectionId, tenantId, targetDate]);

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
            studentCount: parseInt(studentCountRows[0].count, 10),
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

    const { rows } = await pool.query(`
        SELECT status, COUNT(*) AS count
        FROM attendance_records
        WHERE tenant_id = $1 AND date >= $2
        GROUP BY status
    `, [tenantId, startDate]);

    return rows.map((r: any) => ({
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
    const { tenantId } = await requireAuth('attendance:read');

    const { rows: sectionRows } = await pool.query(`
        SELECT s.id AS "sectionId", s.name AS "sectionName", g.name AS "gradeName", g.display_order AS "gradeOrder"
        FROM sections s
        INNER JOIN grades g ON s.grade_id = g.id
        WHERE s.tenant_id = $1
        ORDER BY g.display_order ASC, s.name ASC
    `, [tenantId]);

    const report: AttendanceReportRow[] = [];

    for (const sec of sectionRows) {
        const { rows: studentCountRow } = await pool.query(`
            SELECT COUNT(*) AS count
            FROM students
            WHERE section_id = $1 AND tenant_id = $2 AND status = 'ACTIVE'
        `, [sec.sectionId, tenantId]);

        const { rows: statusRows } = await pool.query(`
            SELECT status, COUNT(*) AS count
            FROM attendance_records
            WHERE section_id = $1 AND tenant_id = $2 AND date >= $3 AND date <= $4
            GROUP BY status
        `, [sec.sectionId, tenantId, startDate, endDate]);

        const stats: Record<string, number> = {};
        let total = 0;
        for (const row of statusRows) {
            const countVal = parseInt(row.count, 10);
            stats[row.status] = countVal;
            total += countVal;
        }

        const presentCount = (stats['PRESENT'] || 0) + (stats['LATE'] || 0);
        
        const { rows: uniqueDays } = await pool.query(`
            SELECT date
            FROM attendance_records
            WHERE section_id = $1 AND tenant_id = $2 AND date >= $3 AND date <= $4
            GROUP BY date
        `, [sec.sectionId, tenantId, startDate, endDate]);

        report.push({
            gradeName: sec.gradeName,
            sectionName: sec.sectionName,
            totalStudents: parseInt(studentCountRow[0].count, 10),
            workingDays: uniqueDays.length,
            presentCount,
            absentCount: stats['ABSENT'] || 0,
            lateCount: stats['LATE'] || 0,
            attendanceRate: total > 0 ? Math.round((presentCount / total) * 100) : 0,
        });
    }

    return report;
}

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

    const { rows: studentRows } = await pool.query(`
        SELECT st.first_name AS "firstName", st.last_name AS "lastName", g.name AS "gradeName", s.name AS "sectionName"
        FROM students st
        INNER JOIN grades g ON st.grade_id = g.id
        INNER JOIN sections s ON st.section_id = s.id
        WHERE st.id = $1 AND st.tenant_id = $2
    `, [studentId, tenantId]);

    if (!studentRows.length) return null;
    const student = studentRows[0];

    const { rows: records } = await pool.query(`
        SELECT date, status, remarks
        FROM attendance_records
        WHERE student_id = $1 AND tenant_id = $2 AND date >= $3 AND date <= $4
        ORDER BY date DESC
    `, [studentId, tenantId, start, end]);

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
        recentRecords: records.slice(0, 30).map((r: any) => ({
            date: r.date,
            status: r.status,
            remarks: r.remarks,
        })),
    };
}

export async function notifyAbsentParents(date?: string): Promise<{ sent: number; failed: number; errors: string[] }> {
    const { tenantId, userId } = await requireAuth('attendance:write');
    const targetDate = date || new Date().toISOString().split('T')[0];

    const { rows: absentRows } = await pool.query(`
        SELECT id AS "recordId", student_id AS "studentId"
        FROM attendance_records
        WHERE tenant_id = $1 AND date = $2 AND status = 'ABSENT' AND is_notified = false
    `, [tenantId, targetDate]);

    if (absentRows.length === 0) return { sent: 0, failed: 0, errors: [] };

    const smsProvider = getSmsProvider();
    const emailProvider = getEmailProvider();
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const row of absentRows) {
        try {
            const { rows: studentRows } = await pool.query(`
                SELECT first_name AS "firstName", last_name AS "lastName"
                FROM students
                WHERE id = $1
            `, [row.studentId]);

            const { rows: guardianRows } = await pool.query(`
                SELECT first_name AS "firstName", phone, email
                FROM guardians
                WHERE student_id = $1 AND is_primary = true
            `, [row.studentId]);

            if (!guardianRows.length || !studentRows.length) {
                failed++;
                continue;
            }

            const student = studentRows[0];
            const guardian = guardianRows[0];

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

            await pool.query(`
                UPDATE attendance_records
                SET is_notified = true
                WHERE id = $1
            `, [row.recordId]);

            sent++;
        } catch (err: any) {
            failed++;
            errors.push(err.message);
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

