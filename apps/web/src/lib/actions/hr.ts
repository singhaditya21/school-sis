'use server';

import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { randomUUID } from 'crypto';

/** Flat result shape — Next.js erases union narrowing across the 'use server' boundary. */
export interface HRActionResult {
    success: boolean;
    error?: string;
}

// Enum label whitelists, mirrored from the Postgres enums (leave_type,
// leave_status, employment_type). Values are only ever used after a match.
const LEAVE_TYPES = ['CL', 'SL', 'EL', 'ML', 'PL', 'COMP_OFF', 'LWP'];
const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];
const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'VISITING'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): boolean {
    return typeof value === 'string' && UUID_RE.test(value);
}

/** Turn a driver error into something safe and useful to show in the UI. */
function describeDbError(err: unknown, fallback: string): string {
    const code = (err as { code?: string })?.code;
    if (code === '23505') return 'That record already exists — the employee ID or email is already in use.';
    if (code === '23503') return 'A referenced department or designation no longer exists.';
    return fallback;
}

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

export interface StaffDetail {
    id: string;
    employeeId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    avatarUrl: string | null;
    departmentName: string | null;
    designationName: string | null;
    status: string;
    employmentType: string;
    joiningDate: string;
    confirmationDate: string | null;
    dateOfBirth: string | null;
    qualification: string | null;
    experienceYears: number | null;
    specialization: string | null;
    salaryBasic: string | null;
    salaryHra: string | null;
    salaryDa: string | null;
    salaryPf: string | null;
    salaryTax: string | null;
    salaryGross: string | null;
    salaryNet: string | null;
    panNumber: string | null;
    bankAccount: string | null;
    bankName: string | null;
    address: string | null;
    emergencyContact: string | null;
    emergencyContactName: string | null;
}

export async function getStaffById(staffId: string): Promise<StaffDetail | null> {
    const { tenantId } = await requireAuth('hr:read');

    if (!isUuid(staffId)) return null;

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
            sp.experience_years AS "experienceYears",
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

export interface DepartmentHeadcount {
    departmentName: string | null;
    count: number;
}

export interface HRStats {
    totalStaff: number;
    activeStaff: number;
    pendingLeaves: number;
    monthlyPayroll: number;
    departments: DepartmentHeadcount[];
}

export async function getHRStats(): Promise<HRStats> {
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
        departments: deptBreakdown.map(d => ({ departmentName: (d.departmentName ?? null) as string | null, count: Number(d.count) })),
    };
}

// ─── Create Staff ────────────────────────────────────────────

export interface CreateStaffResult {
    success: boolean;
    error?: string;
    staffId?: string;
}

export async function createStaff(formData: FormData): Promise<CreateStaffResult> {
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
        return { success: false, error: 'First name, last name, email, employee ID and joining date are all required.' };
    }

    if (departmentId && !isUuid(departmentId)) {
        return { success: false, error: 'Invalid department.' };
    }
    if (designationId && !isUuid(designationId)) {
        return { success: false, error: 'Invalid designation.' };
    }

    if (!EMPLOYMENT_TYPES.includes(employmentType)) {
        return { success: false, error: 'Invalid employment type.' };
    }

    const userId = randomUUID();
    const staffId = randomUUID();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
            INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name, role, phone)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [userId, tenantId, email, '$temp$', firstName, lastName, 'TEACHER', phone]);

        await client.query(`
            INSERT INTO staff_profiles (
                id, tenant_id, user_id, employee_id, department_id, designation_id,
                employment_type, joining_date, salary_basic
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [staffId, tenantId, userId, employeeId, departmentId, designationId, employmentType, joiningDate, salaryBasic]);
        await client.query('COMMIT');
    } catch (err: unknown) {
        await client.query('ROLLBACK');
        return { success: false, error: describeDbError(err, 'Could not create the staff record.') };
    } finally {
        client.release();
    }

    revalidatePath('/hr');
    return { success: true, staffId };
}

// ─── Leave Management ────────────────────────────────────────

export interface LeaveRequestItem {
    id: string;
    staffId: string;
    staffEmployeeId: string;
    staffFirstName: string;
    staffLastName: string;
    departmentName: string | null;
    leaveType: string;
    fromDate: string;
    toDate: string;
    totalDays: string;
    reason: string;
    status: string;
    rejectionReason: string | null;
    approverFirstName: string | null;
    approverLastName: string | null;
    approvedAt: string | null;
    createdAt: string;
}

export async function applyLeave(data: {
    staffId: string;
    leaveType: string;
    fromDate: string;
    toDate: string;
    totalDays: number;
    reason: string;
}): Promise<HRActionResult> {
    const { tenantId } = await requireAuth('hr:write');

    if (!data.staffId || !data.fromDate || !data.toDate || !data.reason?.trim()) {
        return { success: false, error: 'Staff member, dates and reason are all required.' };
    }
    if (!LEAVE_TYPES.includes(data.leaveType)) {
        return { success: false, error: 'Invalid leave type.' };
    }
    if (data.toDate < data.fromDate) {
        return { success: false, error: 'The end date cannot be before the start date.' };
    }
    if (!Number.isFinite(data.totalDays) || data.totalDays <= 0) {
        return { success: false, error: 'Total days must be greater than zero.' };
    }

    try {
        await pool.query(`
            INSERT INTO leave_requests (
                id, tenant_id, staff_id, leave_type, from_date, to_date, total_days, reason
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [randomUUID(), tenantId, data.staffId, data.leaveType, data.fromDate, data.toDate, String(data.totalDays), data.reason.trim()]);
    } catch (err: unknown) {
        return { success: false, error: describeDbError(err, 'Could not record the leave request.') };
    }

    revalidatePath('/hr/leave');
    revalidatePath('/hr');
    return { success: true };
}

export async function approveLeave(leaveId: string): Promise<HRActionResult> {
    const { tenantId, userId } = await requireAuth('hr:write');

    if (!isUuid(leaveId)) {
        return { success: false, error: 'Invalid leave request.' };
    }

    let rowCount = 0;
    try {
        const result = await pool.query(`
            UPDATE leave_requests
            SET status = 'APPROVED', approved_by = $3, approved_at = NOW(), rejection_reason = NULL, updated_at = NOW()
            WHERE id = $1 AND tenant_id = $2 AND status = 'PENDING'
        `, [leaveId, tenantId, userId]);
        rowCount = result.rowCount ?? 0;
    } catch (err: unknown) {
        return { success: false, error: describeDbError(err, 'Could not approve the leave request.') };
    }

    if (rowCount === 0) {
        return { success: false, error: 'That request is no longer pending — reload to see its current status.' };
    }

    revalidatePath('/hr/leave');
    revalidatePath('/hr');
    return { success: true };
}

export async function rejectLeave(leaveId: string, reason: string): Promise<HRActionResult> {
    const { tenantId, userId } = await requireAuth('hr:write');

    if (!isUuid(leaveId)) {
        return { success: false, error: 'Invalid leave request.' };
    }
    if (!reason?.trim()) {
        return { success: false, error: 'A reason is required to reject a leave request.' };
    }

    let rowCount = 0;
    try {
        const result = await pool.query(`
            UPDATE leave_requests
            SET status = 'REJECTED', approved_by = $3, approved_at = NOW(), rejection_reason = $4, updated_at = NOW()
            WHERE id = $1 AND tenant_id = $2 AND status = 'PENDING'
        `, [leaveId, tenantId, userId, reason.trim()]);
        rowCount = result.rowCount ?? 0;
    } catch (err: unknown) {
        return { success: false, error: describeDbError(err, 'Could not reject the leave request.') };
    }

    if (rowCount === 0) {
        return { success: false, error: 'That request is no longer pending — reload to see its current status.' };
    }

    revalidatePath('/hr/leave');
    revalidatePath('/hr');
    return { success: true };
}

export async function getPendingLeaves(): Promise<LeaveRequestItem[]> {
    return getLeaveRequests({ status: 'PENDING' });
}

/**
 * Leave requests for the tenant, optionally narrowed to a status and/or a single
 * staff member. Status is checked against the leave_status enum before use.
 */
export async function getLeaveRequests(options?: {
    status?: string;
    staffId?: string;
    limit?: number;
}): Promise<LeaveRequestItem[]> {
    const { tenantId } = await requireAuth('hr:read');

    const params: unknown[] = [tenantId];
    let where = `lr.tenant_id = $1`;

    const status = options?.status;
    if (status && status !== 'ALL') {
        if (!LEAVE_STATUSES.includes(status)) return [];
        params.push(status);
        where += ` AND lr.status = $${params.length}`;
    }

    if (options?.staffId) {
        if (!isUuid(options.staffId)) return [];
        params.push(options.staffId);
        where += ` AND lr.staff_id = $${params.length}`;
    }

    const limit = Math.min(Math.max(options?.limit ?? 200, 1), 500);
    params.push(limit);

    const { rows } = await pool.query(`
        SELECT
            lr.id,
            lr.staff_id AS "staffId",
            sp.employee_id AS "staffEmployeeId",
            u.first_name AS "staffFirstName",
            u.last_name AS "staffLastName",
            sd.name AS "departmentName",
            lr.leave_type AS "leaveType",
            lr.from_date AS "fromDate",
            lr.to_date AS "toDate",
            lr.total_days AS "totalDays",
            lr.reason,
            lr.status,
            lr.rejection_reason AS "rejectionReason",
            approver.first_name AS "approverFirstName",
            approver.last_name AS "approverLastName",
            lr.approved_at AS "approvedAt",
            lr.created_at AS "createdAt"
        FROM leave_requests lr
        INNER JOIN staff_profiles sp ON lr.staff_id = sp.id
        INNER JOIN users u ON sp.user_id = u.id
        LEFT JOIN staff_departments sd ON sp.department_id = sd.id
        LEFT JOIN users approver ON lr.approved_by = approver.id
        WHERE ${where}
        ORDER BY CASE WHEN lr.status = 'PENDING' THEN 0 ELSE 1 END, lr.created_at DESC
        LIMIT $${params.length}
    `, params);

    return rows;
}

export interface LeaveStats {
    pending: number;
    approved: number;
    rejected: number;
    cancelled: number;
    onLeaveToday: number;
    pendingDays: number;
}

export async function getLeaveStats(): Promise<LeaveStats> {
    const { tenantId } = await requireAuth('hr:read');

    const { rows } = await pool.query(`
        SELECT
            COUNT(*) FILTER (WHERE status = 'PENDING') AS pending,
            COUNT(*) FILTER (WHERE status = 'APPROVED') AS approved,
            COUNT(*) FILTER (WHERE status = 'REJECTED') AS rejected,
            COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled,
            COUNT(*) FILTER (
                WHERE status = 'APPROVED'
                  AND CURRENT_DATE BETWEEN from_date AND to_date
            ) AS "onLeaveToday",
            COALESCE(SUM(total_days::numeric) FILTER (WHERE status = 'PENDING'), 0) AS "pendingDays"
        FROM leave_requests
        WHERE tenant_id = $1
    `, [tenantId]);

    const r = rows[0];
    return {
        pending: Number(r?.pending ?? 0),
        approved: Number(r?.approved ?? 0),
        rejected: Number(r?.rejected ?? 0),
        cancelled: Number(r?.cancelled ?? 0),
        onLeaveToday: Number(r?.onLeaveToday ?? 0),
        pendingDays: Number(r?.pendingDays ?? 0),
    };
}

export interface LeaveBalanceRow {
    leaveType: string;
    name: string;
    total: number;
    used: number;
    remaining: number;
}

export async function getLeaveBalance(staffId: string): Promise<LeaveBalanceRow[]> {
    const { tenantId } = await requireAuth('hr:read');

    if (!isUuid(staffId)) return [];

    const { rows: policies } = await pool.query(`
        SELECT leave_type AS "leaveType", name, max_days_per_year AS "maxDaysPerYear"
        FROM leave_policies
        WHERE tenant_id = $1 AND is_active = true
        ORDER BY name ASC
    `, [tenantId]);

    const yearStart = `${new Date().getFullYear()}-01-01`;
    const { rows: approved } = await pool.query(`
        SELECT leave_type AS "leaveType", SUM(total_days::numeric) AS "totalDays"
        FROM leave_requests
        WHERE staff_id = $1 AND tenant_id = $2 AND status = 'APPROVED' AND from_date >= $3
        GROUP BY leave_type
    `, [staffId, tenantId, yearStart]);

    const used = new Map<string, number>(approved.map(a => [a.leaveType as string, Number(a.totalDays)]));

    return policies.map(p => ({
        leaveType: p.leaveType,
        name: p.name,
        total: Number(p.maxDaysPerYear),
        used: used.get(p.leaveType) || 0,
        remaining: Number(p.maxDaysPerYear) - (used.get(p.leaveType) || 0),
    }));
}

// ─── Departments ─────────────────────────────────────────────

export interface DepartmentOption {
    id: string;
    name: string;
    code: string;
}

export async function getDepartments(): Promise<DepartmentOption[]> {
    const { tenantId } = await requireAuth('hr:read');

    const { rows } = await pool.query(`
        SELECT id, name, code
        FROM staff_departments
        WHERE tenant_id = $1 AND is_active = true
        ORDER BY name ASC
    `, [tenantId]);

    return rows;
}

export interface DesignationOption {
    id: string;
    name: string;
    grade: string | null;
}

export async function getDesignations(): Promise<DesignationOption[]> {
    const { tenantId } = await requireAuth('hr:read');

    const { rows } = await pool.query(`
        SELECT id, name, grade
        FROM designations
        WHERE tenant_id = $1
        ORDER BY display_order ASC
    `, [tenantId]);

    return rows;
}
