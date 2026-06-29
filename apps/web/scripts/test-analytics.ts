import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function run() {
    const tenantId = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
    console.log('Testing analytics queries with tenant:', tenantId);
    
    try {
        console.log('Query 1: getAnalyticsSummary');
        const res1 = await pool.query(`
            SELECT
                (SELECT COUNT(*) FROM students WHERE tenant_id=$1 AND status='ACTIVE') AS students,
                (SELECT COALESCE(SUM(amount),0) FROM payments WHERE tenant_id=$1 AND status='COMPLETED') AS collected,
                (SELECT COALESCE(SUM(total_amount - paid_amount),0) FROM invoices WHERE tenant_id=$1 AND status IN('PENDING','OVERDUE')) AS pending,
                (SELECT ROUND(COUNT(*) FILTER(WHERE status='PRESENT')::numeric / NULLIF(COUNT(*),0) * 100, 1) FROM attendance_records WHERE tenant_id=$1 AND date >= CURRENT_DATE - 30) AS attendance,
                (SELECT ROUND(AVG(marks_obtained::numeric / NULLIF(es.max_marks,0) * 100), 1) FROM student_results er JOIN exam_schedules es ON es.id=er.exam_schedule_id JOIN exams e ON e.id=es.exam_id WHERE e.tenant_id=$1) AS exam_avg
        `, [tenantId]);
        console.log('Result 1:', res1.rows[0]);
    } catch (e) {
        console.error('Error in Query 1:', e);
    }

    try {
        console.log('Query 2: getFeeCollectionData');
        const res2 = await pool.query(`
            WITH monthly_payments AS (
                SELECT DATE_TRUNC('month', paid_at) AS month_date,
                       SUM(amount) AS collected
                FROM payments
                WHERE tenant_id = $1 AND status = 'COMPLETED' AND paid_at >= NOW() - INTERVAL '12 months'
                GROUP BY DATE_TRUNC('month', paid_at)
            )
            SELECT TO_CHAR(month_date, 'Mon') AS month,
                   collected,
                   (SELECT COALESCE(SUM(i.total_amount),0) FROM invoices i WHERE i.tenant_id = $1 AND DATE_TRUNC('month', i.due_date) = month_date) AS target,
                   (SELECT COALESCE(SUM(i.total_amount - i.paid_amount),0) FROM invoices i WHERE i.tenant_id = $1 AND DATE_TRUNC('month', i.due_date) = month_date AND i.status IN('PENDING','OVERDUE')) AS pending
            FROM monthly_payments
            ORDER BY month_date
        `, [tenantId]);
        console.log('Result 2 count:', res2.rows.length);
        console.log('Result 2 rows:', res2.rows);
    } catch (e) {
        console.error('Error in Query 2:', e);
    }

    try {
        console.log('Query 3: getClassWiseSummary');
        const res3 = await pool.query(`
            SELECT g.name AS label,
                   ROUND(AVG(er.marks_obtained::numeric / NULLIF(es.max_marks,0) * 100),0) AS value
            FROM student_results er
            JOIN exam_schedules es ON es.id = er.exam_schedule_id
            JOIN exams e ON e.id = es.exam_id
            JOIN students s ON s.id = er.student_id
            LEFT JOIN sections sec ON sec.id = s.section_id
            LEFT JOIN grades g ON g.id = sec.grade_id
            WHERE e.tenant_id=$1
            GROUP BY g.name, g.display_order ORDER BY g.display_order
        `, [tenantId]);
        console.log('Result 3 count:', res3.rows.length);
    } catch (e) {
        console.error('Error in Query 3:', e);
    }

    try {
        console.log('Query 4: getTopPerformers');
        const res4 = await pool.query(`
            SELECT s.first_name || ' ' || s.last_name AS name,
                   g.name AS class,
                   ROUND(AVG(er.marks_obtained::numeric / NULLIF(es.max_marks,0) * 100),1) AS percentage
            FROM student_results er
            JOIN students s ON s.id = er.student_id
            JOIN exam_schedules es ON es.id = er.exam_schedule_id
            JOIN exams e ON e.id = es.exam_id
            LEFT JOIN sections sec ON sec.id = s.section_id
            LEFT JOIN grades g ON g.id = sec.grade_id
            WHERE e.tenant_id=$1
            GROUP BY s.id, s.first_name, s.last_name, g.name
            ORDER BY percentage DESC LIMIT 10
        `, [tenantId]);
        console.log('Result 4 count:', res4.rows.length);
    } catch (e) {
        console.error('Error in Query 4:', e);
    }

    try {
        console.log('Query 5: getDailyAttendance');
        const res5 = await pool.query(`
            SELECT TO_CHAR(date, 'DD Mon') AS date,
                   ROUND(COUNT(*) FILTER(WHERE status='PRESENT')::numeric / NULLIF(COUNT(*),0) * 100, 0) AS value
            FROM attendance_records WHERE tenant_id=$1 AND date >= CURRENT_DATE - 30
            GROUP BY date ORDER BY date
        `, [tenantId]);
        console.log('Result 5 count:', res5.rows.length);
    } catch (e) {
        console.error('Error in Query 5:', e);
    }

    await pool.end();
}

run();
