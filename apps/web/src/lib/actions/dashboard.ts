'use server';

import { sql } from '@/lib/db';
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
    consentBlocked: number;
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
        studentCountRow,
        teacherCountRow,
        gradeCountRow,
        sectionCountRow,
        todayAttendanceRow,
        feeAggregatesRow,
        leadCountRow,
        overdueDataRow,
        consentBlockedRow,
    ] = await Promise.all([
        sql<{ count: string }>`SELECT count(*) FROM students WHERE tenant_id = ${tenantId} AND status = 'ACTIVE'`.one(),
        sql<{ count: string }>`SELECT count(*) FROM users WHERE tenant_id = ${tenantId} AND role = 'TEACHER' AND is_active = true`.one(),
        sql<{ count: string }>`SELECT count(*) FROM grades WHERE tenant_id = ${tenantId}`.one(),
        sql<{ count: string }>`SELECT count(*) FROM sections WHERE tenant_id = ${tenantId}`.one(),
        sql<{ count: string }>`SELECT count(*) FROM attendance_records WHERE tenant_id = ${tenantId} AND status = 'PRESENT' AND date >= CURRENT_DATE`.one(),
        // Collected and expected come from invoices — SUM(paid_amount) and
        // SUM(total_amount) — matching getExecutiveFinancialMetrics, so the
        // dashboard cannot contradict /executive or /fees.
        sql<{ expected: string; collected: string }>`
            SELECT COALESCE(SUM(total_amount), 0) AS expected,
                   COALESCE(SUM(paid_amount), 0)  AS collected
            FROM invoices
            WHERE tenant_id = ${tenantId} AND status NOT IN ('CANCELLED', 'WAIVED', 'DRAFT')
        `.one(),
        sql<{ count: string }>`SELECT count(*) FROM admission_leads WHERE tenant_id = ${tenantId} AND stage = 'NEW'`.one(),
        // Nothing ever stamps the OVERDUE invoice status; filtering on it
        // matched zero rows, so the dashboard showed ₹0 overdue and a 100%
        // collection rate while /fees showed the real defaulters one click
        // away. Derive overdue the way every other fee readout does: past
        // due, and still owing.
        sql<{ overdue_amount: string; overdue_count: string; defaulter_count: string }>`
            SELECT
                COALESCE(SUM(total_amount - paid_amount), 0) as overdue_amount,
                count(*) as overdue_count,
                count(DISTINCT student_id) as defaulter_count
            FROM invoices
            WHERE tenant_id = ${tenantId}
              AND status NOT IN ('CANCELLED', 'WAIVED', 'DRAFT')
              AND due_date < CURRENT_DATE
              AND total_amount > paid_amount
        `.one(),
        sql<{ blocked_count: string }>`
            SELECT (
                (SELECT count(*) FROM consents WHERE tenant_id = ${tenantId} AND is_opted_in = false) +
                (SELECT count(*) FROM consent_responses WHERE tenant_id = ${tenantId} AND response = 'DECLINED')
            ) AS blocked_count
        `.one(),
    ]);

    const expected = Number(feeAggregatesRow?.expected || 0);
    const collected = Number(feeAggregatesRow?.collected || 0);
    const overdue = Number(overdueDataRow?.overdue_amount || 0);
    // Rate against everything billed, not just collected + overdue — the old
    // denominator omitted not-yet-due invoices and pinned the rate to 100%
    // the moment overdue read zero.
    const collectionRate = expected > 0 ? Math.round((collected / expected) * 100) : 0;

    return {
        totalStudents: parseInt(studentCountRow?.count || '0', 10),
        totalTeachers: parseInt(teacherCountRow?.count || '0', 10),
        totalGrades: parseInt(gradeCountRow?.count || '0', 10),
        totalClasses: parseInt(sectionCountRow?.count || '0', 10),
        attendanceToday: parseInt(todayAttendanceRow?.count || '0', 10),
        feeCollected: collected,
        feesPending: overdue,
        admissionLeads: parseInt(leadCountRow?.count || '0', 10),
        collectionRate,
        overdueAmount: overdue,
        defaulterCount: Number(overdueDataRow?.defaulter_count || 0),
        overdueInvoiceCount: Number(overdueDataRow?.overdue_count || 0),
        consentBlocked: parseInt(consentBlockedRow?.blocked_count || '0', 10),
    };
}

export async function getTenantInfo(): Promise<TenantInfo> {
    const { tenantId } = await requireAuth();

    const [tenant, yearRow] = await Promise.all([
        sql<{ name: string; code: string }>`SELECT name, code FROM tenants WHERE id = ${tenantId} LIMIT 1`.maybeOne(),
        sql<{ id: string }>`SELECT id FROM academic_years WHERE tenant_id = ${tenantId} LIMIT 1`.maybeOne(),
    ]);

    const resolvedTenant = tenant || { name: 'Unknown School', code: '???' };
    const hasAcademicYear = Boolean(yearRow);

    return { ...resolvedTenant, hasAcademicYear };
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
        const rows = await sql<{
            id: string;
            action: string;
            entityType: string | null;
            description: string | null;
            timestamp: Date | string | null;
            userName: string | null;
            userLastName: string | null;
            userRole: string | null;
        }>`
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
            WHERE a.tenant_id = ${tenantId}
            ORDER BY a.created_at DESC
            LIMIT ${limit_num}
        `;

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
