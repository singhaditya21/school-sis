'use server';

import { db, setTenantContext } from '@/lib/db';
import { users, students, invoices, payments, attendanceRecords, admissionLeads, grades, sections } from '@/lib/db/schema';
import { eq, sql, count, sum, and, lt, gte } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { tenants } from '@/lib/db/schema';

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
}

export async function getDashboardStats(): Promise<DashboardStats> {
    const { tenantId } = await requireAuth();

    // Set RLS context for this tenant
    await setTenantContext(tenantId);

    // Run all aggregate queries in parallel
    const [
        studentCount,
        teacherCount,
        gradeCount,
        sectionCount,
        todayAttendance,
        feeAggregates,
        leadCount,
        overdueData,
    ] = await Promise.all([
        // Total active students
        db.select({ value: count() })
            .from(students)
            .where(and(
                eq(students.tenantId, tenantId),
                eq(students.status, 'ACTIVE')
            )),

        // Total teachers
        db.select({ value: count() })
            .from(users)
            .where(and(
                eq(users.tenantId, tenantId),
                eq(users.role, 'TEACHER'),
                eq(users.isActive, true)
            )),

        // Total grades
        db.select({ value: count() })
            .from(grades)
            .where(eq(grades.tenantId, tenantId)),

        // Total sections (classes)
        db.select({ value: count() })
            .from(sections)
            .where(eq(sections.tenantId, tenantId)),

        // Today's attendance
        db.select({ value: count() })
            .from(attendanceRecords)
            .where(and(
                eq(attendanceRecords.tenantId, tenantId),
                eq(attendanceRecords.status, 'PRESENT'),
                gte(attendanceRecords.date, sql`CURRENT_DATE`)
            )),

        // Fee aggregates (collected + pending)
        db.select({
            collected: sum(payments.amount),
        })
            .from(payments)
            .where(and(
                eq(payments.tenantId, tenantId),
                eq(payments.status, 'COMPLETED')
            )),

        // Admission leads
        db.select({ value: count() })
            .from(admissionLeads)
            .where(and(
                eq(admissionLeads.tenantId, tenantId),
                eq(admissionLeads.status, 'NEW')
            )),

        // Overdue invoices
        db.select({
            overdueAmount: sum(sql`${invoices.totalAmount} - ${invoices.paidAmount}`),
            overdueCount: count(),
            defaulterCount: sql<number>`COUNT(DISTINCT ${invoices.studentId})`,
        })
            .from(invoices)
            .where(and(
                eq(invoices.tenantId, tenantId),
                eq(invoices.status, 'OVERDUE'),
                lt(invoices.dueDate, sql`CURRENT_DATE`)
            )),
    ]);

    const collected = Number(feeAggregates[0]?.collected || 0);
    const overdue = Number(overdueData[0]?.overdueAmount || 0);
    const totalBilled = collected + overdue;
    const collectionRate = totalBilled > 0 ? Math.round((collected / totalBilled) * 100) : 0;

    return {
        totalStudents: studentCount[0]?.value || 0,
        totalTeachers: teacherCount[0]?.value || 0,
        totalGrades: gradeCount[0]?.value || 0,
        totalClasses: sectionCount[0]?.value || 0,
        attendanceToday: todayAttendance[0]?.value || 0,
        feeCollected: collected,
        feesPending: overdue,
        admissionLeads: leadCount[0]?.value || 0,
        collectionRate,
        overdueAmount: overdue,
        defaulterCount: Number(overdueData[0]?.defaulterCount || 0),
        overdueInvoiceCount: Number(overdueData[0]?.overdueCount || 0),
    };
}

export async function getTenantInfo(): Promise<TenantInfo> {
    const { tenantId } = await requireAuth();

    const [tenant] = await db
        .select({ name: tenants.name, code: tenants.code })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

    return tenant || { name: 'Unknown School', code: '???' };
}
