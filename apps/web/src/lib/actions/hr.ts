'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { randomUUID } from 'crypto';

// ─── Staff List ──────────────────────────────────────────────

export interface StaffListItem {
    id: string;
    employeeId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    departmentName: string | null;
    designationName: string | null;
    status: string;
    employmentType: string;
    joiningDate: string;
    salaryGross: string | null;
    salaryNet: string | null;
}

export async function getStaffList(departmentFilter?: string): Promise<StaffListItem[]> {
    const { tenantId } = await requireAuth('hr:read');

    let query = `
        SELECT 
            sp.id,
            sp.employee_id AS "employeeId",
            u.first_name AS "firstName",
            u.last_name AS "lastName",
            u.email,
            u.phone,
            sd.name AS "departmentName",
            d.name AS "designationName",
            sp.status,
            sp.employment_type AS "employmentType",
            sp.joining_date AS "joiningDate",
            sp.salary_gross AS "salaryGross",
            sp.salary_net AS "salaryNet"
        FROM staff_profiles sp
        INNER JOIN users u ON sp.user_id = u.id
        LEFT JOIN staff_departments sd ON sp.department_id = sd.id
        LEFT JOIN designations d ON sp.designation_id = d.id
        WHERE sp.tenant_id = $1
    `;
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (departmentFilter && departmentFilter !== 'ALL') {
        const deptQuery = `SELECT id FROM staff_departments WHERE tenant_id = $1 AND name = $2`;
        const { rows: deptRows } = await pool.query(deptQuery, [tenantId, departmentFilter]);
        const dept = deptRows[0];
        if (dept) {
            query += ` AND sp.department_id = $${paramIndex++}`;
            params.push(dept.id);
        }
    }

    query += ` ORDER BY u.first_name ASC`;
    const { rows } = await pool.query(query, params);
    return rows;
}

// ─── Staff Detail ────────────────────────────────────────────

export async function getStaffById(staffId: string) {
    const { tenantId } = await requireAuth('hr:read');

    const query = `
        SELECT 
            sp.id,
            sp.employee_id AS "employeeId",
            u.first_name AS "firstName",
            u.last_name AS "lastName",
            u.email,
            u.phone,
            u.avatar_url AS "avatarUrl",
            sd.name AS "departmentName",
            d.name AS "designationName",
            sp.status,
            sp.employment_type AS "employmentType",
            sp.joining_date AS "joiningDate",
            sp.confirmation_date AS "confirmationDate",
            sp.date_of_birth AS "dateOfBirth",
            sp.qualification,
            sp.experience,
            sp.specialization,
            sp.salary_basic AS "salaryBasic",
            sp.salary_hra AS "salaryHra",
            sp.salary_da AS "salaryDa",
            sp.salary_pf AS "salaryPf",
            sp.salary_tax AS "salaryTax",
            sp.salary_gross AS "salaryGross",
            sp.salary_net AS "salaryNet",
            sp.pan_number AS "panNumber",
            sp.bank_account AS "bankAccount",
            sp.bank_name AS "bankName",
            sp.address,
            sp.emergency_contact AS "emergencyContact",
            sp.emergency_contact_name AS "emergencyContactName"
        FROM staff_profiles sp
        INNER JOIN users u ON sp.user_id = u.id
        LEFT JOIN staff_departments sd ON sp.department_id = sd.id
        LEFT JOIN designations d ON sp.designation_id = d.id
        WHERE sp.id = $1 AND sp.tenant_id = $2
    `;
    const { rows } = await pool.query(query, [staffId, tenantId]);
    return rows[0] || null;
}

// ─── HR Stats ────────────────────────────────────────────────

export async function getHRStats() {
    const { tenantId } = await requireAuth('hr:read');

    const { rows: totalCount } = await pool.query(`SELECT COUNT(*) AS count FROM staff_profiles WHERE tenant_id = $1`, [tenantId]);
    const { rows: activeCount } = await pool.query(`SELECT COUNT(*) AS count FROM staff_profiles WHERE tenant_id = $1 AND status = 'ACTIVE'`, [tenantId]);
    const { rows: pendingLeaves } = await pool.query(`SELECT COUNT(*) AS count FROM leave_requests WHERE tenant_id = $1 AND status = 'PENDING'`, [tenantId]);

    const { rows: payrollResult } = await pool.query(`
        SELECT COALESCE(SUM(salary_net::numeric), 0) AS total
        FROM staff_profiles
        WHERE tenant_id = $1 AND status = 'ACTIVE'
    `, [tenantId]);

    const { rows: deptBreakdown } = await pool.query(`
        SELECT sd.name AS "departmentName", COUNT(*) AS count
        FROM staff_profiles sp
        LEFT JOIN staff_departments sd ON sp.department_id = sd.id
        WHERE sp.tenant_id = $1
        GROUP BY sd.name
    `, [tenantId]);

    return {
        totalStaff: Number(totalCount[0].count),
        activeStaff: Number(activeCount[0].count),
        pendingLeaves: Number(pendingLeaves[0].count),
        monthlyPayroll: Number(payrollResult[0]?.total || 0),
        departments: deptBreakdown.map(d => ({ departmentName: d.departmentName, count: Number(d.count) })),
    };
}

// ─── Create Staff ────────────────────────────────────────────

export async function createStaff(formData: FormData) {
    const { tenantId } = await requireAuth('hr:write');

    const firstName = formData.get('firstName') as string;
    const lastName = formData.get('lastName') as string;
    const email = formData.get('email') as string;
    const phone = formData.get('phone') as string;
    const employeeId = formData.get('employeeId') as string;
    const departmentId = formData.get('departmentId') as string || null;
    const designationId = formData.get('designationId') as string || null;
    const joiningDate = formData.get('joiningDate') as string;
    const employmentType = formData.get('employmentType') as string || 'FULL_TIME';
    const salaryBasic = formData.get('salaryBasic') as string || '0';

    if (!firstName || !lastName || !email || !employeeId || !joiningDate) {
        return { success: false, error: 'Missing required fields' };
    }

    const userId = randomUUID();
    await pool.query(`
        INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name, role, phone)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [userId, tenantId, email, '$temp$', firstName, lastName, 'TEACHER', phone]);

    const staffId = randomUUID();
    await pool.query(`
        INSERT INTO staff_profiles (
            id, tenant_id, user_id, employee_id, department_id, designation_id,
            employment_type, joining_date, salary_basic
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [staffId, tenantId, userId, employeeId, departmentId, designationId, employmentType, joiningDate, salaryBasic]);

    return { success: true, staffId };
}

// ─── Leave Management ────────────────────────────────────────

export async function applyLeave(data: {
    staffId: string;
    leaveType: string;
    fromDate: string;
    toDate: string;
    totalDays: number;
    reason: string;
}) {
    const { tenantId } = await requireAuth('hr:write');

    await pool.query(`
        INSERT INTO leave_requests (
            id, tenant_id, staff_id, leave_type, from_date, to_date, total_days, reason
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [randomUUID(), tenantId, data.staffId, data.leaveType, data.fromDate, data.toDate, String(data.totalDays), data.reason]);

    return { success: true };
}

export async function approveLeave(leaveId: string) {
    const { tenantId, userId } = await requireAuth('hr:write');

    await pool.query(`
        UPDATE leave_requests
        SET status = 'APPROVED', approved_by = $3, approved_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2
    `, [leaveId, tenantId, userId]);

    return { success: true };
}

export async function rejectLeave(leaveId: string, reason: string) {
    const { tenantId, userId } = await requireAuth('hr:write');

    await pool.query(`
        UPDATE leave_requests
        SET status = 'REJECTED', approved_by = $3, approved_at = NOW(), rejection_reason = $4, updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2
    `, [leaveId, tenantId, userId, reason]);

    return { success: true };
}

export async function getPendingLeaves() {
    const { tenantId } = await requireAuth('hr:read');

    const { rows } = await pool.query(`
        SELECT 
            lr.id,
            sp.employee_id AS "staffEmployeeId",
            u.first_name AS "staffFirstName",
            u.last_name AS "staffLastName",
            lr.leave_type AS "leaveType",
            lr.from_date AS "fromDate",
            lr.to_date AS "toDate",
            lr.total_days AS "totalDays",
            lr.reason,
            lr.status,
            lr.created_at AS "createdAt"
        FROM leave_requests lr
        INNER JOIN staff_profiles sp ON lr.staff_id = sp.id
        INNER JOIN users u ON sp.user_id = u.id
        WHERE lr.tenant_id = $1 AND lr.status = 'PENDING'
        ORDER BY lr.created_at ASC
    `, [tenantId]);

    return rows;
}

export async function getLeaveBalance(staffId: string) {
    const { tenantId } = await requireAuth('hr:read');

    const { rows: policies } = await pool.query(`
        SELECT leave_type AS "leaveType", name, max_days_per_year AS "maxDaysPerYear"
        FROM leave_policies
        WHERE tenant_id = $1 AND is_active = true
    `, [tenantId]);

    const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
    const { rows: approved } = await pool.query(`
        SELECT leave_type AS "leaveType", SUM(total_days::numeric) AS "totalDays"
        FROM leave_requests
        WHERE staff_id = $1 AND tenant_id = $2 AND status = 'APPROVED' AND from_date >= $3
        GROUP BY leave_type
    `, [staffId, tenantId, yearStart]);

    const used = new Map<string, number>(approved.map(a => [a.leaveType, Number(a.totalDays)]));

    return policies.map(p => ({
        leaveType: p.leaveType,
        name: p.name,
        total: Number(p.maxDaysPerYear),
        used: used.get(p.leaveType) || 0,
        remaining: Number(p.maxDaysPerYear) - (used.get(p.leaveType) || 0),
    }));
}

// ─── Departments ─────────────────────────────────────────────

export async function getDepartments() {
    const { tenantId } = await requireAuth('hr:read');

    const { rows } = await pool.query(`
        SELECT id, name, code
        FROM staff_departments
        WHERE tenant_id = $1 AND is_active = true
        ORDER BY name ASC
    `, [tenantId]);

    return rows;
}

export async function getDesignations() {
    const { tenantId } = await requireAuth('hr:read');

    const { rows } = await pool.query(`
        SELECT id, name, grade
        FROM designations
        WHERE tenant_id = $1
        ORDER BY display_order ASC
    `, [tenantId]);

    return rows;
}
