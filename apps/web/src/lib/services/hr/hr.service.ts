// HR Management Service — Production (Real DB)
import { db, setTenantContext } from '@/lib/db';
import { sql } from 'drizzle-orm';

export interface StaffMember { id: string; employeeId: string; name: string; designation: string; department: string; email: string; phone: string; joiningDate: string; status: 'active'|'on_leave'|'resigned'; qualification: string; experience: number; }
export interface LeaveRequest { id: string; staffId: string; staffName: string; leaveType: string; fromDate: string; toDate: string; days: number; reason: string; status: 'pending'|'approved'|'rejected'; appliedAt: string; }

export const HRService = {
    async getStaff(tenantId: string, filters?: { department?: string; status?: string }): Promise<StaffMember[]> {
        await setTenantContext(tenantId);
        const rows = await db.execute(sql`SELECT u.id,u.employee_id AS "employeeId",u.first_name||' '||u.last_name AS name,u.designation,u.department,u.email,u.phone,u.joining_date AS "joiningDate",CASE WHEN u.is_active THEN 'active' ELSE 'resigned' END AS status,u.qualification,EXTRACT(YEAR FROM AGE(NOW(),u.joining_date))::int AS experience FROM users u WHERE u.tenant_id=${tenantId} AND u.role IN('TEACHER','ACCOUNTANT','TRANSPORT_MANAGER','SUPER_ADMIN') ${filters?.department?sql`AND u.department=${filters.department}`:sql``} ${filters?.status==='active'?sql`AND u.is_active=true`:sql``} ${filters?.status==='resigned'?sql`AND u.is_active=false`:sql``} ORDER BY u.first_name LIMIT 200`);
        return rows as StaffMember[];
    },
    async getLeaveRequests(tenantId: string, filters?: { status?: string }): Promise<LeaveRequest[]> {
        await setTenantContext(tenantId);
        const rows = await db.execute(sql`SELECT lr.id,lr.user_id AS "staffId",u.first_name||' '||u.last_name AS "staffName",lr.leave_type AS "leaveType",lr.from_date AS "fromDate",lr.to_date AS "toDate",lr.days,lr.reason,lr.status,lr.created_at AS "appliedAt" FROM leave_requests lr JOIN users u ON u.id=lr.user_id WHERE lr.tenant_id=${tenantId} ${filters?.status?sql`AND lr.status=${filters.status}`:sql``} ORDER BY lr.created_at DESC LIMIT 100`);
        return rows as LeaveRequest[];
    },
    async getStaffStats(tenantId: string) {
        await setTenantContext(tenantId);
        const [s] = await db.execute(sql`SELECT COUNT(*) AS total,COUNT(*) FILTER(WHERE is_active=true) AS active,COUNT(*) FILTER(WHERE is_active=false) AS resigned,COUNT(*) FILTER(WHERE role='TEACHER') AS teachers,(SELECT COUNT(*) FROM leave_requests WHERE tenant_id=${tenantId} AND status='pending') AS "pendingLeaves" FROM users WHERE tenant_id=${tenantId} AND role IN('TEACHER','ACCOUNTANT','TRANSPORT_MANAGER','SUPER_ADMIN')`) as any[];
        return { total: Number(s?.total||0), active: Number(s?.active||0), resigned: Number(s?.resigned||0), teachers: Number(s?.teachers||0), pendingLeaves: Number(s?.pendingLeaves||0) };
    },
    async getDepartments(tenantId: string): Promise<string[]> {
        await setTenantContext(tenantId);
        const rows = await db.execute(sql`SELECT DISTINCT department FROM users WHERE tenant_id=${tenantId} AND department IS NOT NULL ORDER BY department`);
        return (rows as any[]).map(r => r.department);
    },
    getLeaveTypes(): string[] { return ['Casual Leave','Sick Leave','Earned Leave','Maternity Leave','Paternity Leave','Duty Leave','Study Leave']; },
};
