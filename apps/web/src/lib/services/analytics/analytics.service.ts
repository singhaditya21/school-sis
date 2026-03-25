// Analytics Service — Production (Real DB)
import { db, setTenantContext } from '@/lib/db';
import { sql } from 'drizzle-orm';

export const AnalyticsService = {
    async getAttendanceTrends(tenantId: string, months: number = 6) {
        await setTenantContext(tenantId);
        const rows = await db.execute(sql`SELECT DATE_TRUNC('month',ar.date) AS month,COUNT(*) AS total,COUNT(*) FILTER(WHERE ar.status='PRESENT') AS present,COUNT(*) FILTER(WHERE ar.status='ABSENT') AS absent,ROUND(COUNT(*) FILTER(WHERE ar.status='PRESENT')::numeric/NULLIF(COUNT(*),0)*100,1) AS "attendancePct" FROM attendance_records ar WHERE ar.tenant_id=${tenantId} AND ar.date>=NOW()-(${months}||' months')::interval GROUP BY DATE_TRUNC('month',ar.date) ORDER BY month ASC`);
        return rows;
    },
    async getExamPerformance(tenantId: string) {
        await setTenantContext(tenantId);
        const rows = await db.execute(sql`SELECT e.name AS "examName",sub.name AS subject,ROUND(AVG(er.marks_obtained::numeric/NULLIF(er.total_marks,0)*100),1) AS "avgPct",COUNT(DISTINCT er.student_id) AS students,COUNT(*) FILTER(WHERE er.marks_obtained::numeric/NULLIF(er.total_marks,0)*100>=90) AS "above90",COUNT(*) FILTER(WHERE er.marks_obtained::numeric/NULLIF(er.total_marks,0)*100<40) AS "below40" FROM exam_results er JOIN exam_subjects es ON es.id=er.exam_subject_id JOIN subjects sub ON sub.id=es.subject_id JOIN exams e ON e.id=es.exam_id WHERE e.tenant_id=${tenantId} GROUP BY e.name,sub.name ORDER BY e.name,sub.name`);
        return rows;
    },
    async getFeeCollectionTrends(tenantId: string, months: number = 6) {
        await setTenantContext(tenantId);
        const rows = await db.execute(sql`SELECT DATE_TRUNC('month',p.paid_at) AS month,SUM(p.amount) AS collected,COUNT(p.id) AS payments FROM payments p WHERE p.tenant_id=${tenantId} AND p.status='COMPLETED' AND p.paid_at>=NOW()-(${months}||' months')::interval GROUP BY DATE_TRUNC('month',p.paid_at) ORDER BY month ASC`);
        return rows;
    },
    async getEnrollmentByGrade(tenantId: string) {
        await setTenantContext(tenantId);
        const rows = await db.execute(sql`SELECT g.name AS grade,COUNT(s.id) AS students,COUNT(s.id) FILTER(WHERE s.gender='MALE') AS boys,COUNT(s.id) FILTER(WHERE s.gender='FEMALE') AS girls FROM students s JOIN sections sec ON sec.id=s.section_id JOIN grades g ON g.id=sec.grade_id WHERE s.tenant_id=${tenantId} AND s.status='ACTIVE' GROUP BY g.name,g.display_order ORDER BY g.display_order`);
        return rows;
    },
    async getDashboardSummary(tenantId: string) {
        await setTenantContext(tenantId);
        const [s] = await db.execute(sql`SELECT (SELECT COUNT(*) FROM students WHERE tenant_id=${tenantId} AND status='ACTIVE') AS "totalStudents",(SELECT COUNT(*) FROM users WHERE tenant_id=${tenantId} AND role='TEACHER' AND is_active=true) AS "totalTeachers",(SELECT ROUND(COUNT(*) FILTER(WHERE status='PRESENT')::numeric/NULLIF(COUNT(*),0)*100,1) FROM attendance_records WHERE tenant_id=${tenantId} AND date=CURRENT_DATE) AS "todayAttendance",(SELECT COALESCE(SUM(amount),0) FROM payments WHERE tenant_id=${tenantId} AND status='COMPLETED' AND DATE_TRUNC('month',paid_at)=DATE_TRUNC('month',CURRENT_DATE)) AS "monthlyCollection"`) as any[];
        return { totalStudents: Number(s?.totalStudents||0), totalTeachers: Number(s?.totalTeachers||0), todayAttendance: Number(s?.todayAttendance||0), monthlyCollection: Number(s?.monthlyCollection||0) };
    },
};
