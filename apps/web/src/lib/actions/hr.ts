'use server';

import { db } from '@/lib/db';
import { staffProfiles, staffDepartments, designations, leaveRequests, leavePolicies, users } from '@/lib/db/schema';
import { eq, and, count, asc, desc, sql, gte, lte } from 'drizzle-orm';
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

    const conditions = [eq(staffProfiles.tenantId, tenantId)];
    if (departmentFilter && departmentFilter !== 'ALL') {
        // Find department by name
        const [dept] = await db
            .select({ id: staffDepartments.id })
            .from(staffDepartments)
            .where(and(eq(staffDepartments.tenantId, tenantId), eq(staffDepartments.name, departmentFilter)));
        if (dept) conditions.push(eq(staffProfiles.departmentId, dept.id));
    }

    const rows = await db
        .select({
            id: staffProfiles.id,
            employeeId: staffProfiles.employeeId,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            phone: users.phone,
            departmentName: staffDepartments.name,
            designationName: designations.name,
            status: staffProfiles.status,
            employmentType: staffProfiles.employmentType,
            joiningDate: staffProfiles.joiningDate,
            salaryGross: staffProfiles.salaryGross,
            salaryNet: staffProfiles.salaryNet,
        })
        .from(staffProfiles)
        .innerJoin(users, eq(staffProfiles.userId, users.id))
        .leftJoin(staffDepartments, eq(staffProfiles.departmentId, staffDepartments.id))
        .leftJoin(designations, eq(staffProfiles.designationId, designations.id))
        .where(and(...conditions))
        .orderBy(asc(users.firstName));

    return rows;
}

// ─── Staff Detail ────────────────────────────────────────────

export async function getStaffById(staffId: string) {
    const { tenantId } = await requireAuth('hr:read');

    const [staff] = await db
        .select({
            id: staffProfiles.id,
            employeeId: staffProfiles.employeeId,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            phone: users.phone,
            avatarUrl: users.avatarUrl,
            departmentName: staffDepartments.name,
            designationName: designations.name,
            status: staffProfiles.status,
            employmentType: staffProfiles.employmentType,
            joiningDate: staffProfiles.joiningDate,
            confirmationDate: staffProfiles.confirmationDate,
            dateOfBirth: staffProfiles.dateOfBirth,
            qualification: staffProfiles.qualification,
            experience: staffProfiles.experience,
            specialization: staffProfiles.specialization,
            salaryBasic: staffProfiles.salaryBasic,
            salaryHra: staffProfiles.salaryHra,
            salaryDa: staffProfiles.salaryDa,
            salaryPf: staffProfiles.salaryPf,
            salaryTax: staffProfiles.salaryTax,
            salaryGross: staffProfiles.salaryGross,
            salaryNet: staffProfiles.salaryNet,
            panNumber: staffProfiles.panNumber,
            bankAccount: staffProfiles.bankAccount,
            bankName: staffProfiles.bankName,
            address: staffProfiles.address,
            emergencyContact: staffProfiles.emergencyContact,
            emergencyContactName: staffProfiles.emergencyContactName,
        })
        .from(staffProfiles)
        .innerJoin(users, eq(staffProfiles.userId, users.id))
        .leftJoin(staffDepartments, eq(staffProfiles.departmentId, staffDepartments.id))
        .leftJoin(designations, eq(staffProfiles.designationId, designations.id))
        .where(and(eq(staffProfiles.id, staffId), eq(staffProfiles.tenantId, tenantId)));

    return staff || null;
}

// ─── HR Stats ────────────────────────────────────────────────

export async function getHRStats() {
    const { tenantId } = await requireAuth('hr:read');

    const [totalCount] = await db
        .select({ count: count() })
        .from(staffProfiles)
        .where(eq(staffProfiles.tenantId, tenantId));

    const [activeCount] = await db
        .select({ count: count() })
        .from(staffProfiles)
        .where(and(eq(staffProfiles.tenantId, tenantId), eq(staffProfiles.status, 'ACTIVE')));

    const [pendingLeaves] = await db
        .select({ count: count() })
        .from(leaveRequests)
        .where(and(eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.status, 'PENDING')));

    // Total monthly payroll
    const payrollResult = await db
        .select({ total: sql<string>`COALESCE(SUM(${staffProfiles.salaryNet}::numeric), 0)` })
        .from(staffProfiles)
        .where(and(eq(staffProfiles.tenantId, tenantId), eq(staffProfiles.status, 'ACTIVE')));

    // Department breakdown
    const deptBreakdown = await db
        .select({
            departmentName: staffDepartments.name,
            count: count(),
        })
        .from(staffProfiles)
        .leftJoin(staffDepartments, eq(staffProfiles.departmentId, staffDepartments.id))
        .where(eq(staffProfiles.tenantId, tenantId))
        .groupBy(staffDepartments.name);

    return {
        totalStaff: totalCount.count,
        activeStaff: activeCount.count,
        pendingLeaves: pendingLeaves.count,
        monthlyPayroll: Number(payrollResult[0]?.total || 0),
        departments: deptBreakdown,
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

    // Create user account first
    const userId = randomUUID();
    await db.insert(users).values({
        id: userId,
        tenantId,
        email,
        passwordHash: '$temp$', // will be set on first login
        firstName,
        lastName,
        role: 'TEACHER', // default, can be changed
        phone,
    });

    // Create staff profile
    const staffId = randomUUID();
    await db.insert(staffProfiles).values({
        id: staffId,
        tenantId,
        userId,
        employeeId,
        departmentId,
        designationId,
        employmentType: employmentType as any,
        joiningDate,
        salaryBasic,
    });

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

    await db.insert(leaveRequests).values({
        id: randomUUID(),
        tenantId,
        staffId: data.staffId,
        leaveType: data.leaveType as any,
        fromDate: data.fromDate,
        toDate: data.toDate,
        totalDays: String(data.totalDays),
        reason: data.reason,
    });

    return { success: true };
}

export async function approveLeave(leaveId: string) {
    const { tenantId, userId } = await requireAuth('hr:write');

    await db.update(leaveRequests)
        .set({
            status: 'APPROVED',
            approvedBy: userId,
            approvedAt: new Date(),
            updatedAt: new Date(),
        })
        .where(and(eq(leaveRequests.id, leaveId), eq(leaveRequests.tenantId, tenantId)));

    return { success: true };
}

export async function rejectLeave(leaveId: string, reason: string) {
    const { tenantId, userId } = await requireAuth('hr:write');

    await db.update(leaveRequests)
        .set({
            status: 'REJECTED',
            approvedBy: userId,
            approvedAt: new Date(),
            rejectionReason: reason,
            updatedAt: new Date(),
        })
        .where(and(eq(leaveRequests.id, leaveId), eq(leaveRequests.tenantId, tenantId)));

    return { success: true };
}

export async function getPendingLeaves() {
    const { tenantId } = await requireAuth('hr:read');

    return db
        .select({
            id: leaveRequests.id,
            staffEmployeeId: staffProfiles.employeeId,
            staffFirstName: users.firstName,
            staffLastName: users.lastName,
            leaveType: leaveRequests.leaveType,
            fromDate: leaveRequests.fromDate,
            toDate: leaveRequests.toDate,
            totalDays: leaveRequests.totalDays,
            reason: leaveRequests.reason,
            status: leaveRequests.status,
            createdAt: leaveRequests.createdAt,
        })
        .from(leaveRequests)
        .innerJoin(staffProfiles, eq(leaveRequests.staffId, staffProfiles.id))
        .innerJoin(users, eq(staffProfiles.userId, users.id))
        .where(and(eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.status, 'PENDING')))
        .orderBy(asc(leaveRequests.createdAt));
}

export async function getLeaveBalance(staffId: string) {
    const { tenantId } = await requireAuth('hr:read');

    // Get all policies for this tenant
    const policies = await db
        .select()
        .from(leavePolicies)
        .where(and(eq(leavePolicies.tenantId, tenantId), eq(leavePolicies.isActive, true)));

    // Get approved leaves this year
    const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
    const approved = await db
        .select({
            leaveType: leaveRequests.leaveType,
            totalDays: sql<string>`SUM(${leaveRequests.totalDays}::numeric)`,
        })
        .from(leaveRequests)
        .where(and(
            eq(leaveRequests.staffId, staffId),
            eq(leaveRequests.tenantId, tenantId),
            eq(leaveRequests.status, 'APPROVED'),
            gte(leaveRequests.fromDate, yearStart),
        ))
        .groupBy(leaveRequests.leaveType);

    const used = new Map(approved.map(a => [a.leaveType, Number(a.totalDays)]));

    return policies.map(p => ({
        leaveType: p.leaveType,
        name: p.name,
        total: p.maxDaysPerYear,
        used: used.get(p.leaveType) || 0,
        remaining: p.maxDaysPerYear - (used.get(p.leaveType) || 0),
    }));
}

// ─── Departments ─────────────────────────────────────────────

export async function getDepartments() {
    const { tenantId } = await requireAuth('hr:read');

    return db
        .select({
            id: staffDepartments.id,
            name: staffDepartments.name,
            code: staffDepartments.code,
        })
        .from(staffDepartments)
        .where(and(eq(staffDepartments.tenantId, tenantId), eq(staffDepartments.isActive, true)))
        .orderBy(asc(staffDepartments.name));
}

export async function getDesignations() {
    const { tenantId } = await requireAuth('hr:read');

    return db
        .select({
            id: designations.id,
            name: designations.name,
            grade: designations.grade,
        })
        .from(designations)
        .where(eq(designations.tenantId, tenantId))
        .orderBy(asc(designations.displayOrder));
}
