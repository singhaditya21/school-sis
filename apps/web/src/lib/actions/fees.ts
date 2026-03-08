'use server';

import { db } from '@/lib/db';
import { feePlans, feeComponents, invoices, payments, receipts, academicYears, students, grades, sections } from '@/lib/db/schema';
import { eq, and, count, sum, asc, desc, lt, sql, ne } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';

export interface FeePlanListItem {
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
    academicYearName: string;
    componentCount: number;
    invoiceCount: number;
    totalCollected: number;
}

export interface FeeComponentItem {
    id: string;
    name: string;
    amount: string;
    frequency: string;
    isOptional: boolean;
}

export interface InvoiceListItem {
    id: string;
    invoiceNumber: string;
    studentName: string;
    totalAmount: string;
    paidAmount: string;
    dueDate: string;
    status: string;
}

export async function getFeePlans(): Promise<FeePlanListItem[]> {
    const { tenantId } = await requireAuth('fees:read');

    const plans = await db
        .select({
            id: feePlans.id,
            name: feePlans.name,
            description: feePlans.description,
            isActive: feePlans.isActive,
            academicYearName: academicYears.name,
        })
        .from(feePlans)
        .innerJoin(academicYears, eq(feePlans.academicYearId, academicYears.id))
        .where(eq(feePlans.tenantId, tenantId))
        .orderBy(desc(feePlans.createdAt));

    // Get component counts and invoice stats for each plan
    const result: FeePlanListItem[] = [];

    for (const plan of plans) {
        const [compCount] = await db
            .select({ count: count() })
            .from(feeComponents)
            .where(eq(feeComponents.feePlanId, plan.id));

        const [invStats] = await db
            .select({
                count: count(),
                totalPaid: sum(invoices.paidAmount),
            })
            .from(invoices)
            .where(and(eq(invoices.feePlanId, plan.id), eq(invoices.tenantId, tenantId)));

        result.push({
            ...plan,
            componentCount: compCount.count,
            invoiceCount: invStats.count,
            totalCollected: Number(invStats.totalPaid || 0),
        });
    }

    return result;
}

export async function getFeePlanComponents(planId: string): Promise<FeeComponentItem[]> {
    await requireAuth('fees:read');

    const components = await db
        .select({
            id: feeComponents.id,
            name: feeComponents.name,
            amount: feeComponents.amount,
            frequency: feeComponents.frequency,
            isOptional: feeComponents.isOptional,
        })
        .from(feeComponents)
        .where(eq(feeComponents.feePlanId, planId))
        .orderBy(asc(feeComponents.createdAt));

    return components;
}

export async function getInvoices(options?: {
    status?: string;
    limit?: number;
}): Promise<InvoiceListItem[]> {
    const { tenantId } = await requireAuth('fees:read');
    const limit = options?.limit || 50;

    const conditions = [eq(invoices.tenantId, tenantId)];
    if (options?.status) {
        conditions.push(eq(invoices.status, options.status as any));
    }

    // Join with students to get names

    const rows = await db
        .select({
            id: invoices.id,
            invoiceNumber: invoices.invoiceNumber,
            studentFirstName: students.firstName,
            studentLastName: students.lastName,
            totalAmount: invoices.totalAmount,
            paidAmount: invoices.paidAmount,
            dueDate: invoices.dueDate,
            status: invoices.status,
        })
        .from(invoices)
        .innerJoin(students, eq(invoices.studentId, students.id))
        .where(and(...conditions))
        .orderBy(desc(invoices.createdAt))
        .limit(limit);

    return rows.map(r => ({
        id: r.id,
        invoiceNumber: r.invoiceNumber,
        studentName: `${r.studentFirstName} ${r.studentLastName}`,
        totalAmount: r.totalAmount,
        paidAmount: r.paidAmount,
        dueDate: r.dueDate,
        status: r.status,
    }));
}

// ─── Fee Analytics Queries ────────────────────────────────────

export interface DefaulterStats {
    totalOverdueAmount: number;
    defaulterCount: number;
    overdueInvoiceCount: number;
    averageDaysOverdue: number;
    highestOverdue: number;
}

export interface AgeingBucket {
    label: string;
    count: number;
    amount: number;
}

export interface DefaulterItem {
    studentId: string;
    studentName: string;
    className: string;
    totalDue: number;
    totalPaid: number;
    balance: number;
    oldestDueDate: string;
    daysOverdue: number;
    invoiceCount: number;
}

export interface CollectionTrendItem {
    month: string;
    collected: number;
    billed: number;
}

export interface FeeOverview {
    totalBilled: number;
    totalCollected: number;
    totalPending: number;
    collectionRate: number;
    overdueAmount: number;
    defaulterCount: number;
    invoiceCount: number;
    paidInvoiceCount: number;
}

export async function getDefaulterStats(): Promise<DefaulterStats> {
    const { tenantId } = await requireAuth('fees:read');
    const today = new Date().toISOString().split('T')[0];

    // Get overdue invoices (status not PAID/CANCELLED/WAIVED and past due date)
    const overdueRows = await db
        .select({
            totalAmount: invoices.totalAmount,
            paidAmount: invoices.paidAmount,
            dueDate: invoices.dueDate,
            studentId: invoices.studentId,
        })
        .from(invoices)
        .where(and(
            eq(invoices.tenantId, tenantId),
            lt(invoices.dueDate, today),
            ne(invoices.status, 'PAID'),
            ne(invoices.status, 'CANCELLED'),
            ne(invoices.status, 'WAIVED'),
        ));

    if (overdueRows.length === 0) {
        return {
            totalOverdueAmount: 0,
            defaulterCount: 0,
            overdueInvoiceCount: 0,
            averageDaysOverdue: 0,
            highestOverdue: 0,
        };
    }

    const todayDate = new Date(today);
    const uniqueStudents = new Set<string>();
    let totalOverdue = 0;
    let highestOverdue = 0;
    let totalDaysOverdue = 0;

    for (const row of overdueRows) {
        const balance = Number(row.totalAmount) - Number(row.paidAmount);
        totalOverdue += balance;
        if (balance > highestOverdue) highestOverdue = balance;
        uniqueStudents.add(row.studentId);
        const dueDate = new Date(row.dueDate);
        const daysOverdue = Math.floor((todayDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        totalDaysOverdue += daysOverdue;
    }

    return {
        totalOverdueAmount: totalOverdue,
        defaulterCount: uniqueStudents.size,
        overdueInvoiceCount: overdueRows.length,
        averageDaysOverdue: Math.round(totalDaysOverdue / overdueRows.length),
        highestOverdue,
    };
}

export async function getFeeAgeingBreakdown(): Promise<AgeingBucket[]> {
    const { tenantId } = await requireAuth('fees:read');
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const overdueRows = await db
        .select({
            totalAmount: invoices.totalAmount,
            paidAmount: invoices.paidAmount,
            dueDate: invoices.dueDate,
        })
        .from(invoices)
        .where(and(
            eq(invoices.tenantId, tenantId),
            lt(invoices.dueDate, todayStr),
            ne(invoices.status, 'PAID'),
            ne(invoices.status, 'CANCELLED'),
            ne(invoices.status, 'WAIVED'),
        ));

    const buckets: AgeingBucket[] = [
        { label: '0-30 days', count: 0, amount: 0 },
        { label: '31-60 days', count: 0, amount: 0 },
        { label: '61-90 days', count: 0, amount: 0 },
        { label: '90+ days', count: 0, amount: 0 },
    ];

    for (const row of overdueRows) {
        const balance = Number(row.totalAmount) - Number(row.paidAmount);
        const dueDate = new Date(row.dueDate);
        const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

        let bucketIdx = 0;
        if (daysOverdue > 90) bucketIdx = 3;
        else if (daysOverdue > 60) bucketIdx = 2;
        else if (daysOverdue > 30) bucketIdx = 1;

        buckets[bucketIdx].count++;
        buckets[bucketIdx].amount += balance;
    }

    return buckets;
}

export async function getDefaulterList(options?: {
    sortBy?: 'amount' | 'days';
    limit?: number;
}): Promise<DefaulterItem[]> {
    const { tenantId } = await requireAuth('fees:read');
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Get overdue invoices with student info
    const overdueRows = await db
        .select({
            studentId: invoices.studentId,
            studentFirstName: students.firstName,
            studentLastName: students.lastName,
            gradeName: grades.name,
            sectionName: sections.name,
            totalAmount: invoices.totalAmount,
            paidAmount: invoices.paidAmount,
            dueDate: invoices.dueDate,
        })
        .from(invoices)
        .innerJoin(students, eq(invoices.studentId, students.id))
        .innerJoin(grades, eq(students.gradeId, grades.id))
        .innerJoin(sections, eq(students.sectionId, sections.id))
        .where(and(
            eq(invoices.tenantId, tenantId),
            lt(invoices.dueDate, todayStr),
            ne(invoices.status, 'PAID'),
            ne(invoices.status, 'CANCELLED'),
            ne(invoices.status, 'WAIVED'),
        ));

    // Group by student
    const studentMap = new Map<string, DefaulterItem>();
    for (const row of overdueRows) {
        const existing = studentMap.get(row.studentId);
        const balance = Number(row.totalAmount) - Number(row.paidAmount);
        const daysOverdue = Math.floor((today.getTime() - new Date(row.dueDate).getTime()) / (1000 * 60 * 60 * 24));

        if (existing) {
            existing.totalDue += Number(row.totalAmount);
            existing.totalPaid += Number(row.paidAmount);
            existing.balance += balance;
            existing.invoiceCount++;
            if (daysOverdue > existing.daysOverdue) {
                existing.daysOverdue = daysOverdue;
                existing.oldestDueDate = row.dueDate;
            }
        } else {
            studentMap.set(row.studentId, {
                studentId: row.studentId,
                studentName: `${row.studentFirstName} ${row.studentLastName}`,
                className: `${row.gradeName} - ${row.sectionName}`,
                totalDue: Number(row.totalAmount),
                totalPaid: Number(row.paidAmount),
                balance,
                oldestDueDate: row.dueDate,
                daysOverdue,
                invoiceCount: 1,
            });
        }
    }

    let result = Array.from(studentMap.values());

    // Sort
    const sortBy = options?.sortBy || 'amount';
    if (sortBy === 'amount') {
        result.sort((a, b) => b.balance - a.balance);
    } else {
        result.sort((a, b) => b.daysOverdue - a.daysOverdue);
    }

    // Limit
    if (options?.limit) {
        result = result.slice(0, options.limit);
    }

    return result;
}

export async function getCollectionTrend(months: number = 6): Promise<CollectionTrendItem[]> {
    const { tenantId } = await requireAuth('fees:read');

    // Get monthly payment totals
    const paymentRows = await db
        .select({
            month: sql<string>`to_char(${payments.paidAt}, 'YYYY-MM')`,
            total: sum(payments.amount),
        })
        .from(payments)
        .where(and(
            eq(payments.tenantId, tenantId),
            eq(payments.status, 'COMPLETED'),
        ))
        .groupBy(sql`to_char(${payments.paidAt}, 'YYYY-MM')`)
        .orderBy(sql`to_char(${payments.paidAt}, 'YYYY-MM')`);

    // Get monthly invoice totals
    const invoiceRows = await db
        .select({
            month: sql<string>`to_char(${invoices.createdAt}, 'YYYY-MM')`,
            total: sum(invoices.totalAmount),
        })
        .from(invoices)
        .where(and(
            eq(invoices.tenantId, tenantId),
            ne(invoices.status, 'CANCELLED'),
        ))
        .groupBy(sql`to_char(${invoices.createdAt}, 'YYYY-MM')`)
        .orderBy(sql`to_char(${invoices.createdAt}, 'YYYY-MM')`);

    // Build last N months
    const result: CollectionTrendItem[] = [];
    const now = new Date();
    for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const monthLabel = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

        const collected = paymentRows.find(r => r.month === key);
        const billed = invoiceRows.find(r => r.month === key);

        result.push({
            month: monthLabel,
            collected: Number(collected?.total || 0),
            billed: Number(billed?.total || 0),
        });
    }

    return result;
}

export async function getFeeOverview(): Promise<FeeOverview> {
    const { tenantId } = await requireAuth('fees:read');
    const todayStr = new Date().toISOString().split('T')[0];

    // Aggregate invoice stats
    const [invoiceStats] = await db
        .select({
            totalBilled: sum(invoices.totalAmount),
            totalPaid: sum(invoices.paidAmount),
            totalCount: count(),
        })
        .from(invoices)
        .where(and(
            eq(invoices.tenantId, tenantId),
            ne(invoices.status, 'CANCELLED'),
        ));

    // Paid invoice count
    const [paidStats] = await db
        .select({ count: count() })
        .from(invoices)
        .where(and(
            eq(invoices.tenantId, tenantId),
            eq(invoices.status, 'PAID'),
        ));

    // Overdue count + defaulter count
    const overdueRows = await db
        .select({ studentId: invoices.studentId })
        .from(invoices)
        .where(and(
            eq(invoices.tenantId, tenantId),
            lt(invoices.dueDate, todayStr),
            ne(invoices.status, 'PAID'),
            ne(invoices.status, 'CANCELLED'),
            ne(invoices.status, 'WAIVED'),
        ));

    const uniqueDefaulters = new Set(overdueRows.map(r => r.studentId));

    const totalBilled = Number(invoiceStats?.totalBilled || 0);
    const totalCollected = Number(invoiceStats?.totalPaid || 0);
    const totalPending = totalBilled - totalCollected;
    const collectionRate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0;

    return {
        totalBilled,
        totalCollected,
        totalPending,
        collectionRate,
        overdueAmount: totalPending, // simplified — overdue ≈ pending for now
        defaulterCount: uniqueDefaulters.size,
        invoiceCount: invoiceStats?.totalCount || 0,
        paidInvoiceCount: paidStats?.count || 0,
    };
}
