'use server';

import { db } from '@/lib/db';
import { tenants, users, students, invoices, payments, attendanceRecords, admissionLeads, grades, sections } from '@/lib/db/schema';
import { eq, sql, count, sum, and } from 'drizzle-orm';
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
}

export interface TenantInfo {
    name: string;
    code: string;
}

export async function getDashboardStats(): Promise<DashboardStats> {
    const { tenantId } = await requireAuth();

    // Total students
    const [studentCount] = await db
        .select({ count: count() })
        .from(students)
        .where(and(eq(students.tenantId, tenantId), eq(students.status, 'ACTIVE')));

    // Total teachers
    const [teacherCount] = await db
        .select({ count: count() })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.role, 'TEACHER')));

    // Total grades
    const [gradeCount] = await db
        .select({ count: count() })
        .from(grades)
        .where(eq(grades.tenantId, tenantId));

    // Total sections
    const [sectionCount] = await db
        .select({ count: count() })
        .from(sections)
        .where(eq(sections.tenantId, tenantId));

    // Fee stats
    const [feeStats] = await db
        .select({
            totalAmount: sum(invoices.totalAmount),
            paidAmount: sum(invoices.paidAmount),
        })
        .from(invoices)
        .where(eq(invoices.tenantId, tenantId));

    const totalFees = Number(feeStats?.totalAmount || 0);
    const paidFees = Number(feeStats?.paidAmount || 0);
    const pendingFees = totalFees - paidFees;
    const collectionRate = totalFees > 0 ? Math.round((paidFees / totalFees) * 100) : 0;

    // Today's attendance
    const today = new Date().toISOString().split('T')[0];
    const [presentToday] = await db
        .select({ count: count() })
        .from(attendanceRecords)
        .where(and(
            eq(attendanceRecords.tenantId, tenantId),
            eq(attendanceRecords.date, today),
            eq(attendanceRecords.status, 'PRESENT')
        ));

    // Admission leads
    const [leadCount] = await db
        .select({ count: count() })
        .from(admissionLeads)
        .where(eq(admissionLeads.tenantId, tenantId));

    return {
        totalStudents: studentCount.count,
        totalTeachers: teacherCount.count,
        totalGrades: gradeCount.count,
        totalClasses: sectionCount.count,
        attendanceToday: presentToday.count,
        feeCollected: paidFees,
        feesPending: pendingFees,
        admissionLeads: leadCount.count,
        collectionRate,
        overdueAmount: pendingFees,
    };
}

export async function getTenantInfo(): Promise<TenantInfo> {
    const { tenantId } = await requireAuth();

    const [tenant] = await db
        .select({ name: tenants.name, code: tenants.code })
        .from(tenants)
        .where(eq(tenants.id, tenantId));

    return tenant || { name: 'School', code: 'SCH' };
}
