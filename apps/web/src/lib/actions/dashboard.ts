'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

export interface DashboardStats {
    totalStudents: number;
    totalTeachers: number;
    totalClasses: number;
    totalGrades: number;
    attendanceToday: number;
    feeCollected: number;
    feesPending: number;
    admissionLeads: number;
    collectionRate: number;
    overdueAmount: number;
    defaulterCount: number;
    overdueInvoiceCount: number;
}

export interface TenantInfo {
    name: string;
    code: string;
    hasAcademicYear: boolean;
}

export async function getDashboardStats(): Promise<DashboardStats> {
    const { tenantId } = await requireAuth();

    // Run all aggregate queries in parallel
    const [
        studentCountRes,
        teacherCountRes,
        gradeCountRes,
        sectionCountRes,
        todayAttendanceRes,
        feeAggregatesRes,
        leadCountRes,
        overdueDataRes,
    ] = await Promise.all([
        pool.query(`SELECT count(*) FROM students WHERE tenant_id = $1 AND status = 'ACTIVE'`, [tenantId]),
        pool.query(`SELECT count(*) FROM users WHERE tenant_id = $1 AND role = 'TEACHER' AND is_active = true`, [tenantId]),
        pool.query(`SELECT count(*) FROM grades WHERE tenant_id = $1`, [tenantId]),
        pool.query(`SELECT count(*) FROM sections WHERE tenant_id = $1`, [tenantId]),
        pool.query(`SELECT count(*) FROM attendance_records WHERE tenant_id = $1 AND status = 'PRESENT' AND date >= CURRENT_DATE`, [tenantId]),
        pool.query(`SELECT sum(amount) as collected FROM payments WHERE tenant_id = $1 AND status = 'COMPLETED'`, [tenantId]),
        pool.query(`SELECT count(*) FROM admission_leads WHERE tenant_id = $1 AND stage = 'NEW'`, [tenantId]),
        pool.query(`
            SELECT 
                sum(total_amount - paid_amount) as overdue_amount, 
                count(*) as overdue_count, 
                count(DISTINCT student_id) as defaulter_count
            FROM invoices 
            WHERE tenant_id = $1 AND status = 'OVERDUE' AND due_date < CURRENT_DATE
        `, [tenantId])
    ]);

    const collected = Number(feeAggregatesRes.rows[0]?.collected || 0);
    const overdue = Number(overdueDataRes.rows[0]?.overdue_amount || 0);
    const totalBilled = collected + overdue;
    const collectionRate = totalBilled > 0 ? Math.round((collected / totalBilled) * 100) : 0;

    return {
        totalStudents: parseInt(studentCountRes.rows[0]?.count || '0', 10),
        totalTeachers: parseInt(teacherCountRes.rows[0]?.count || '0', 10),
        totalGrades: parseInt(gradeCountRes.rows[0]?.count || '0', 10),
        totalClasses: parseInt(sectionCountRes.rows[0]?.count || '0', 10),
        attendanceToday: parseInt(todayAttendanceRes.rows[0]?.count || '0', 10),
        feeCollected: collected,
        feesPending: overdue,
        admissionLeads: parseInt(leadCountRes.rows[0]?.count || '0', 10),
        collectionRate,
        overdueAmount: overdue,
        defaulterCount: Number(overdueDataRes.rows[0]?.defaulter_count || 0),
        overdueInvoiceCount: Number(overdueDataRes.rows[0]?.overdue_count || 0),
    };
}

export async function getTenantInfo(): Promise<TenantInfo> {
    const { tenantId } = await requireAuth();

    const [tenantRes, yearRes] = await Promise.all([
        pool.query(`SELECT name, code FROM tenants WHERE id = $1 LIMIT 1`, [tenantId]),
        pool.query(`SELECT id FROM academic_years WHERE tenant_id = $1 LIMIT 1`, [tenantId])
    ]);

    const tenant = tenantRes.rows[0] || { name: 'Unknown School', code: '???' };
    const hasAcademicYear = yearRes.rows.length > 0;

    return { ...tenant, hasAcademicYear };
}

export interface ActivityLogItem {
    id: string;
    type: string;
    title: string;
    description: string;
    timestamp: string;
    user?: string;
}

export async function getRecentActivity(limit_num: number = 10): Promise<ActivityLogItem[]> {
    const { tenantId } = await requireAuth();

    try {
        const { rows } = await pool.query(`
            SELECT 
                a.id, 
                a.action, 
                a.entity_type as "entityType", 
                a.description, 
                a.created_at as "timestamp",
                u.first_name as "userName", 
                u.last_name as "userLastName", 
                u.role as "userRole"
            FROM audit_logs a
            LEFT JOIN users u ON a.user_id = u.id
            WHERE a.tenant_id = $1
            ORDER BY a.created_at DESC
            LIMIT $2
        `, [tenantId, limit_num]);

        return rows.map((log) => {
            let uiType = 'login';
            let title = 'System Activity';
            
            switch (log.action) {
                case 'PAYMENT': uiType = 'payment'; title = 'Payment Processed'; break;
                case 'CREATE': 
                    if (log.entityType === 'invoice') { uiType = 'invoice'; title = 'Invoice Generated'; }
                    else if (log.entityType === 'admission') { uiType = 'admission'; title = 'New Lead Added'; }
                    else { uiType = 'login'; title = 'Record Created'; }
                    break;
                case 'UPDATE': uiType = 'consent'; title = 'Record Updated'; break;
                case 'LOGIN': uiType = 'login'; title = 'User Login'; break;
            }

            const descStr = log.description || `${log.action} performed on ${log.entityType}`;
            
            return {
                id: log.id,
                type: uiType,
                title: title,
                description: descStr,
                timestamp: log.timestamp ? new Date(log.timestamp).toISOString() : new Date().toISOString(),
                user: log.userName ? `${log.userName} ${log.userLastName || ''}`.trim() : log.userRole || 'System',
            };
        });
    } catch (e) {
        console.error("Failed fetching recent activity:", e);
        return [];
    }
}
