'use server';

import { db, setTenantContext } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';

async function tid() {
    const s = await getSession();
    return s.tenantId;
}

export type AnalyticsSummary = {
    totalStudents: number; totalFeeCollected: number; pendingFees: number;
    averageAttendance: number; averageExamScore: number; monthlyGrowth: number;
};

export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
    const tenantId = await tid();
    await setTenantContext(tenantId);
    const [s] = await db.execute(sql`
        SELECT
            (SELECT COUNT(*) FROM students WHERE tenant_id=${tenantId} AND status='ACTIVE') AS students,
            (SELECT COALESCE(SUM(amount),0) FROM payments WHERE tenant_id=${tenantId} AND status='COMPLETED') AS collected,
            (SELECT COALESCE(SUM(total_amount - paid_amount),0) FROM invoices WHERE tenant_id=${tenantId} AND status IN('PENDING','OVERDUE')) AS pending,
            (SELECT ROUND(COUNT(*) FILTER(WHERE status='PRESENT')::numeric / NULLIF(COUNT(*),0) * 100, 1) FROM attendance_records WHERE tenant_id=${tenantId} AND date >= CURRENT_DATE - 30) AS attendance,
            (SELECT ROUND(AVG(marks_obtained::numeric / NULLIF(total_marks,0) * 100), 1) FROM exam_results er JOIN exam_subjects es ON es.id=er.exam_subject_id JOIN exams e ON e.id=es.exam_id WHERE e.tenant_id=${tenantId}) AS exam_avg
    `) as any[];
    return {
        totalStudents: Number(s?.students || 0),
        totalFeeCollected: Number(s?.collected || 0),
        pendingFees: Number(s?.pending || 0),
        averageAttendance: Number(s?.attendance || 0),
        averageExamScore: Number(s?.exam_avg || 0),
        monthlyGrowth: 0,
    };
}

export async function getFeeCollectionData() {
    const tenantId = await tid();
    await setTenantContext(tenantId);
    const rows = await db.execute(sql`
        SELECT TO_CHAR(DATE_TRUNC('month', p.paid_at), 'Mon') AS month,
               SUM(p.amount) AS collected,
               (SELECT COALESCE(SUM(i.total_amount),0) FROM invoices i WHERE i.tenant_id=${tenantId} AND DATE_TRUNC('month',i.due_date)=DATE_TRUNC('month',p.paid_at)) AS target,
               (SELECT COALESCE(SUM(i.total_amount - i.paid_amount),0) FROM invoices i WHERE i.tenant_id=${tenantId} AND DATE_TRUNC('month',i.due_date)=DATE_TRUNC('month',p.paid_at) AND i.status IN('PENDING','OVERDUE')) AS pending
        FROM payments p WHERE p.tenant_id=${tenantId} AND p.status='COMPLETED' AND p.paid_at >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', p.paid_at), TO_CHAR(DATE_TRUNC('month', p.paid_at), 'Mon')
        ORDER BY DATE_TRUNC('month', p.paid_at)
    `);
    return (rows as any[]).map(r => ({
        month: r.month, collected: Number(r.collected || 0),
        target: Number(r.target || 0), pending: Number(r.pending || 0),
    }));
}

export async function getClassWiseSummary() {
    const tenantId = await tid();
    await setTenantContext(tenantId);
    const rows = await db.execute(sql`
        SELECT g.name AS label,
               ROUND(AVG(er.marks_obtained::numeric / NULLIF(er.total_marks,0) * 100),0) AS value
        FROM exam_results er
        JOIN exam_subjects es ON es.id = er.exam_subject_id
        JOIN exams e ON e.id = es.exam_id
        JOIN students s ON s.id = er.student_id
        LEFT JOIN sections sec ON sec.id = s.section_id
        LEFT JOIN grades g ON g.id = sec.grade_id
        WHERE e.tenant_id=${tenantId}
        GROUP BY g.name, g.display_order ORDER BY g.display_order
    `);
    return (rows as any[]).map(r => ({ label: r.label || 'N/A', value: Number(r.value || 0) }));
}

export async function getTopPerformers() {
    const tenantId = await tid();
    await setTenantContext(tenantId);
    const rows = await db.execute(sql`
        SELECT s.first_name || ' ' || s.last_name AS name,
               g.name AS class,
               ROUND(AVG(er.marks_obtained::numeric / NULLIF(er.total_marks,0) * 100),1) AS percentage
        FROM exam_results er
        JOIN students s ON s.id = er.student_id
        JOIN exam_subjects es ON es.id = er.exam_subject_id
        JOIN exams e ON e.id = es.exam_id
        LEFT JOIN sections sec ON sec.id = s.section_id
        LEFT JOIN grades g ON g.id = sec.grade_id
        WHERE e.tenant_id=${tenantId}
        GROUP BY s.id, s.first_name, s.last_name, g.name
        ORDER BY percentage DESC LIMIT 10
    `);
    return (rows as any[]).map(r => ({ name: r.name, class: r.class || 'N/A', percentage: Number(r.percentage || 0) }));
}

export async function getDailyAttendance() {
    const tenantId = await tid();
    await setTenantContext(tenantId);
    const rows = await db.execute(sql`
        SELECT TO_CHAR(date, 'DD Mon') AS date,
               ROUND(COUNT(*) FILTER(WHERE status='PRESENT')::numeric / NULLIF(COUNT(*),0) * 100, 0) AS value
        FROM attendance_records WHERE tenant_id=${tenantId} AND date >= CURRENT_DATE - 30
        GROUP BY date ORDER BY date
    `);
    return (rows as any[]).map(r => ({ date: r.date, value: Number(r.value || 0) }));
}

export async function getWeeklyAttendance(weeks: number = 12) {
    const tenantId = await tid();
    await setTenantContext(tenantId);
    const rows = await db.execute(sql`
        SELECT DATE_TRUNC('week', date) AS week_start,
               COUNT(*) FILTER(WHERE status='PRESENT') AS present,
               COUNT(*) FILTER(WHERE status='ABSENT') AS absent,
               ROUND(COUNT(*) FILTER(WHERE status='PRESENT')::numeric / NULLIF(COUNT(*),0) * 100, 1) AS percentage
        FROM attendance_records WHERE tenant_id=${tenantId} AND date >= CURRENT_DATE - (${weeks * 7})
        GROUP BY DATE_TRUNC('week', date) ORDER BY week_start
    `);
    return (rows as any[]).map(r => ({
        date: String(r.week_start), present: Number(r.present || 0),
        absent: Number(r.absent || 0), percentage: Number(r.percentage || 0),
    }));
}

export async function getSubjectPerformance() {
    const tenantId = await tid();
    await setTenantContext(tenantId);
    const rows = await db.execute(sql`
        SELECT sub.name AS label,
               ROUND(AVG(er.marks_obtained::numeric / NULLIF(er.total_marks,0) * 100),0) AS value
        FROM exam_results er
        JOIN exam_subjects es ON es.id = er.exam_subject_id
        JOIN subjects sub ON sub.id = es.subject_id
        JOIN exams e ON e.id = es.exam_id
        WHERE e.tenant_id=${tenantId}
        GROUP BY sub.name ORDER BY value DESC
    `);
    return (rows as any[]).map(r => ({ label: r.label, value: Number(r.value || 0) }));
}

export async function getExamClassPerformance() {
    const tenantId = await tid();
    await setTenantContext(tenantId);
    const rows = await db.execute(sql`
        SELECT g.name AS class, sec.name AS section,
               ROUND(AVG(er.marks_obtained::numeric / NULLIF(er.total_marks,0) * 100),1) AS "averagePercent",
               ROUND(COUNT(*) FILTER(WHERE er.marks_obtained::numeric / NULLIF(er.total_marks,0) * 100 >= 40)::numeric / NULLIF(COUNT(*),0) * 100, 1) AS "passPercent"
        FROM exam_results er
        JOIN students s ON s.id = er.student_id
        JOIN exam_subjects es ON es.id = er.exam_subject_id
        JOIN exams e ON e.id = es.exam_id
        LEFT JOIN sections sec ON sec.id = s.section_id
        LEFT JOIN grades g ON g.id = sec.grade_id
        WHERE e.tenant_id=${tenantId}
        GROUP BY g.name, sec.name, g.display_order
        ORDER BY g.display_order, sec.name
    `);
    return (rows as any[]).map(r => ({
        class: r.class || 'N/A', section: r.section || 'N/A',
        averagePercent: Number(r.averagePercent || 0), passPercent: Number(r.passPercent || 0),
    }));
}

export async function getClassWiseAttendance() {
    const tenantId = await tid();
    await setTenantContext(tenantId);
    const rows = await db.execute(sql`
        SELECT g.name AS class,
               ROUND(COUNT(*) FILTER(WHERE ar.status='PRESENT')::numeric / NULLIF(COUNT(*),0) * 100, 1) AS percentage,
               COUNT(*) FILTER(WHERE ar.status='PRESENT') AS present,
               COUNT(*) AS total
        FROM attendance_records ar
        JOIN students s ON s.id = ar.student_id
        LEFT JOIN sections sec ON sec.id = s.section_id
        LEFT JOIN grades g ON g.id = sec.grade_id
        WHERE ar.tenant_id=${tenantId} AND ar.date >= CURRENT_DATE - 30
        GROUP BY g.name, g.display_order ORDER BY g.display_order
    `);
    return (rows as any[]).map(r => ({
        class: r.class || 'N/A', percentage: Number(r.percentage || 0),
        present: Number(r.present || 0), total: Number(r.total || 0),
    }));
}

export async function getClassWiseFees() {
    const tenantId = await tid();
    await setTenantContext(tenantId);
    const rows = await db.execute(sql`
        SELECT g.name AS class,
               COUNT(DISTINCT s.id) AS students,
               COALESCE(SUM(i.paid_amount), 0) AS collected,
               COALESCE(SUM(i.total_amount - i.paid_amount), 0) AS pending
        FROM invoices i
        JOIN students s ON s.id = i.student_id
        LEFT JOIN sections sec ON sec.id = s.section_id
        LEFT JOIN grades g ON g.id = sec.grade_id
        WHERE i.tenant_id=${tenantId}
        GROUP BY g.name, g.display_order ORDER BY g.display_order
    `);
    return (rows as any[]).map(r => ({
        class: r.class || 'N/A', students: Number(r.students || 0),
        collected: Number(r.collected || 0), pending: Number(r.pending || 0),
    }));
}
