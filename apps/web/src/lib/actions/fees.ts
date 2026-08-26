'use server';

/**
 * Fee reads for /fees, /invoices and the defaulter screens.
 *
 * Runs on the tenant-scoped data layer in packages/api/src/data: the tenant
 * predicate is attached by the query builder, and every column below is a
 * reference into the Drizzle schema, so a column that does not exist stops the
 * build instead of the page.
 *
 * One behavioural note. `due_date` now arrives as the stored calendar date
 * ("2025-05-15") instead of a `Date` pinned to the Node process's local
 * midnight. Under TZ=UTC — how this runs on Vercel — the two are identical, and
 * the full read surface was diffed against the previous raw-SQL implementations
 * on the seeded database to confirm it. Off UTC the old path shifted every due
 * date back a day; that shift is gone.
 */

import { tenantScope } from '@school-sis/api/src/data';
import {
    academicYears,
    feeComponents,
    feePlans,
    grades,
    invoices,
    payments,
    sections,
    students,
} from '@school-sis/api/src/db/schema';
import { and, asc, desc, eq, ilike, ne, notInArray, or, sql } from 'drizzle-orm';
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

/** Invoices that are still owed: everything except settled, voided or written off. */
const UNSETTLED_STATUSES = ['PAID', 'CANCELLED', 'WAIVED'] as const;

/** `due_date` is a calendar date; keep it a calendar date rather than a timestamp. */
function toDateString(value: string): string {
    return String(value);
}

export async function getFeePlans(): Promise<FeePlanListItem[]> {
    const { tenantId } = await requireAuth('fees:read');
    const scope = tenantScope(tenantId);

    const plans = await scope
        .from(feePlans)
        .innerJoin(academicYears, eq(feePlans.academicYearId, academicYears.id))
        .select({
            id: feePlans.id,
            name: feePlans.name,
            description: feePlans.description,
            isActive: feePlans.isActive,
            academicYearName: academicYears.name,
        })
        .orderBy(desc(feePlans.createdAt))
        .rows();

    const result: FeePlanListItem[] = [];

    for (const plan of plans) {
        // fee_components has no tenant_id, so this read has to travel through
        // fee_plans. `fromChild` is the only way to build it.
        const compRows = await scope
            .fromChild(feeComponents, { parent: feePlans, on: eq(feeComponents.feePlanId, feePlans.id) })
            .select({ count: sql<string>`count(*)` })
            .where(eq(feeComponents.feePlanId, plan.id))
            .rows();

        const invRows = await scope
            .from(invoices)
            .select({
                count: sql<string>`count(*)`,
                totalPaid: sql<string | null>`sum(${invoices.paidAmount})`,
            })
            .where(eq(invoices.feePlanId, plan.id))
            .rows();

        result.push({
            id: plan.id,
            name: plan.name,
            description: plan.description,
            isActive: plan.isActive,
            academicYearName: plan.academicYearName,
            componentCount: parseInt(compRows[0].count, 10),
            invoiceCount: parseInt(invRows[0].count, 10),
            totalCollected: Number(invRows[0].totalPaid || 0),
        });
    }

    return result;
}

export async function getFeePlanComponents(planId: string): Promise<FeeComponentItem[]> {
    const { tenantId } = await requireAuth('fees:read');
    const scope = tenantScope(tenantId);

    // fee_components carries no tenant_id, so row-level security cannot scope it.
    // `fromChild` makes the hop back to fee_plans — and the parent's tenant
    // predicate — part of the query's construction rather than something the
    // next author has to remember.
    return scope
        .fromChild(feeComponents, { parent: feePlans, on: eq(feeComponents.feePlanId, feePlans.id) })
        .select({
            id: feeComponents.id,
            name: feeComponents.name,
            amount: feeComponents.amount,
            frequency: feeComponents.frequency,
            isOptional: feeComponents.isOptional,
        })
        .where(eq(feeComponents.feePlanId, planId))
        .orderBy(asc(feeComponents.createdAt))
        .rows();
}

/** The invoice_status enum, read off the schema instead of retyped by hand. */
const INVOICE_STATUSES: readonly string[] = invoices.status.enumValues;
type InvoiceStatus = (typeof invoices.$inferSelect)['status'];

export interface InvoiceListPage {
    items: InvoiceListItem[];
    total: number;
}

/**
 * Tenant-scoped invoice list for the counter workspace.
 *
 * `status` is validated against the invoice_status enum rather than interpolated,
 * and `limit` is clamped so a caller cannot ask for the whole table.
 */
export async function getInvoices(options?: {
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
}): Promise<InvoiceListPage> {
    const { tenantId } = await requireAuth('fees:read');
    const scope = tenantScope(tenantId);

    const limit = Math.min(Math.max(Number(options?.limit) || 25, 1), 100);
    const offset = Math.max(Number(options?.offset) || 0, 0);

    const status = options?.status?.toUpperCase();
    const search = options?.search?.trim();
    const pattern = search ? `%${search}%` : undefined;

    const rows = await scope
        .from(invoices)
        .innerJoin(students, eq(invoices.studentId, students.id))
        .select({
            id: invoices.id,
            invoiceNumber: invoices.invoiceNumber,
            studentFirstName: students.firstName,
            studentLastName: students.lastName,
            totalAmount: invoices.totalAmount,
            paidAmount: invoices.paidAmount,
            dueDate: invoices.dueDate,
            status: invoices.status,
            totalCount: sql<string>`count(*) over()`,
        })
        .where(status && INVOICE_STATUSES.includes(status)
            ? eq(invoices.status, status as InvoiceStatus)
            : undefined)
        .where(pattern
            ? or(
                ilike(invoices.invoiceNumber, pattern),
                ilike(students.firstName, pattern),
                ilike(students.lastName, pattern),
                sql`(${students.firstName} || ' ' || ${students.lastName}) ILIKE ${pattern}`,
            )
            : undefined)
        .orderBy(asc(invoices.dueDate), desc(invoices.createdAt))
        .limit(limit)
        .offset(offset)
        .rows();

    return {
        total: rows.length > 0 ? Number(rows[0].totalCount) : 0,
        items: rows.map((r) => ({
            id: r.id,
            invoiceNumber: r.invoiceNumber,
            studentName: `${r.studentFirstName} ${r.studentLastName}`,
            totalAmount: r.totalAmount,
            paidAmount: r.paidAmount,
            dueDate: toDateString(r.dueDate),
            status: r.status,
        })),
    };
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
    const scope = tenantScope(tenantId);
    const today = new Date().toISOString().split('T')[0];

    const overdueRows = await scope
        .from(invoices)
        .select({
            totalAmount: invoices.totalAmount,
            paidAmount: invoices.paidAmount,
            dueDate: invoices.dueDate,
            studentId: invoices.studentId,
        })
        .where(and(
            sql`${invoices.dueDate} < ${today}`,
            notInArray(invoices.status, [...UNSETTLED_STATUSES]),
        ))
        .rows();

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
    const scope = tenantScope(tenantId);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const overdueRows = await scope
        .from(invoices)
        .select({
            totalAmount: invoices.totalAmount,
            paidAmount: invoices.paidAmount,
            dueDate: invoices.dueDate,
        })
        .where(and(
            sql`${invoices.dueDate} < ${todayStr}`,
            notInArray(invoices.status, [...UNSETTLED_STATUSES]),
        ))
        .rows();

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
    const scope = tenantScope(tenantId);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const overdueRows = await scope
        .from(invoices)
        .innerJoin(students, eq(invoices.studentId, students.id))
        .innerJoin(grades, eq(students.gradeId, grades.id))
        .innerJoin(sections, eq(students.sectionId, sections.id))
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
        .where(and(
            sql`${invoices.dueDate} < ${todayStr}`,
            notInArray(invoices.status, [...UNSETTLED_STATUSES]),
        ))
        .rows();

    const studentMap = new Map<string, DefaulterItem>();
    for (const row of overdueRows) {
        const existing = studentMap.get(row.studentId);
        const balance = Number(row.totalAmount) - Number(row.paidAmount);
        const dueDate = new Date(row.dueDate);
        const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        const dueDateStr = toDateString(row.dueDate);

        if (existing) {
            existing.totalDue += Number(row.totalAmount);
            existing.totalPaid += Number(row.paidAmount);
            existing.balance += balance;
            existing.invoiceCount++;
            if (daysOverdue > existing.daysOverdue) {
                existing.daysOverdue = daysOverdue;
                existing.oldestDueDate = dueDateStr;
            }
        } else {
            studentMap.set(row.studentId, {
                studentId: row.studentId,
                studentName: `${row.studentFirstName} ${row.studentLastName}`,
                className: `${row.gradeName} - ${row.sectionName}`,
                totalDue: Number(row.totalAmount),
                totalPaid: Number(row.paidAmount),
                balance,
                oldestDueDate: dueDateStr,
                daysOverdue,
                invoiceCount: 1,
            });
        }
    }

    let result = Array.from(studentMap.values());

    const sortBy = options?.sortBy || 'amount';
    if (sortBy === 'amount') {
        result.sort((a, b) => b.balance - a.balance);
    } else {
        result.sort((a, b) => b.daysOverdue - a.daysOverdue);
    }

    if (options?.limit) {
        result = result.slice(0, options.limit);
    }

    return result;
}

/**
 * Month-bucketed collection vs billing.
 *
 * This one uses the layer's deliberate raw-SQL exception: two GROUP BY
 * aggregates that read more clearly as SQL than as builder calls. `raw` still
 * hands the callback a `tenant()` predicate and refuses to run a query that was
 * built without it, and the columns are interpolated from the schema, so the
 * escape hatch does not cost either guarantee.
 */
export async function getCollectionTrend(months: number = 6): Promise<CollectionTrendItem[]> {
    const { tenantId } = await requireAuth('fees:read');
    const scope = tenantScope(tenantId);

    const paymentRows = await scope.raw<{ month: string; total: string }>((tenant) => sql`
        SELECT
            to_char(${payments.paidAt}, 'YYYY-MM') AS month,
            SUM(${payments.amount}) AS total
        FROM ${payments}
        WHERE ${tenant('payments')} AND ${payments.status} = 'COMPLETED'
        GROUP BY to_char(${payments.paidAt}, 'YYYY-MM')
        ORDER BY to_char(${payments.paidAt}, 'YYYY-MM')
    `);

    const invoiceRows = await scope.raw<{ month: string; total: string }>((tenant) => sql`
        SELECT
            to_char(${invoices.createdAt}, 'YYYY-MM') AS month,
            SUM(${invoices.totalAmount}) AS total
        FROM ${invoices}
        WHERE ${tenant('invoices')} AND ${invoices.status} != 'CANCELLED'
        GROUP BY to_char(${invoices.createdAt}, 'YYYY-MM')
        ORDER BY to_char(${invoices.createdAt}, 'YYYY-MM')
    `);

    const result: CollectionTrendItem[] = [];
    const now = new Date();
    for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const monthLabel = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

        const collected = paymentRows.find((r) => r.month === key);
        const billed = invoiceRows.find((r) => r.month === key);

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
    const scope = tenantScope(tenantId);
    const todayStr = new Date().toISOString().split('T')[0];

    const invoiceStatsRows = await scope
        .from(invoices)
        .select({
            totalBilled: sql<string | null>`sum(${invoices.totalAmount})`,
            totalPaid: sql<string | null>`sum(${invoices.paidAmount})`,
            totalCount: sql<string>`count(*)`,
        })
        .where(ne(invoices.status, 'CANCELLED'))
        .rows();

    const invoiceStats = invoiceStatsRows[0];

    const paidInvoiceCount = await scope.count(invoices, eq(invoices.status, 'PAID'));

    const overdueRows = await scope
        .from(invoices)
        .select({ studentId: invoices.studentId })
        .where(and(
            sql`${invoices.dueDate} < ${todayStr}`,
            notInArray(invoices.status, [...UNSETTLED_STATUSES]),
        ))
        .rows();

    const uniqueDefaulters = new Set(overdueRows.map((r) => r.studentId));

    const totalBilled = Number(invoiceStats?.totalBilled || 0);
    const totalCollected = Number(invoiceStats?.totalPaid || 0);
    const totalPending = totalBilled - totalCollected;
    const collectionRate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0;

    return {
        totalBilled,
        totalCollected,
        totalPending,
        collectionRate,
        overdueAmount: totalPending,
        defaulterCount: uniqueDefaulters.size,
        invoiceCount: parseInt(invoiceStats?.totalCount || '0', 10),
        paidInvoiceCount,
    };
}

// ─── Defaulter Alert Stats ────────────────────────────────────

export interface DefaulterAlertStats {
    total: number;
    critical: number;   // 60+ days overdue
    serious: number;    // 30-59 days overdue
    warning: number;    // 15-29 days overdue
    totalAmount: number;
}

export async function getDefaulterAlertStats(): Promise<DefaulterAlertStats> {
    const { tenantId } = await requireAuth('fees:read');
    const scope = tenantScope(tenantId);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const overdueRows = await scope
        .from(invoices)
        .select({
            studentId: invoices.studentId,
            totalAmount: invoices.totalAmount,
            paidAmount: invoices.paidAmount,
            dueDate: invoices.dueDate,
        })
        .where(and(
            sql`${invoices.dueDate} < ${todayStr}`,
            notInArray(invoices.status, [...UNSETTLED_STATUSES]),
        ))
        .rows();

    // Group by student and find the max days overdue per student
    const studentMaxDays = new Map<string, number>();
    let totalAmount = 0;

    for (const row of overdueRows) {
        const balance = Number(row.totalAmount) - Number(row.paidAmount);
        totalAmount += balance;
        const dueDate = new Date(row.dueDate);
        const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        const existing = studentMaxDays.get(row.studentId) || 0;
        if (daysOverdue > existing) {
            studentMaxDays.set(row.studentId, daysOverdue);
        }
    }

    let critical = 0;
    let serious = 0;
    let warning = 0;

    for (const days of studentMaxDays.values()) {
        if (days >= 60) critical++;
        else if (days >= 30) serious++;
        else if (days >= 15) warning++;
    }

    return {
        total: studentMaxDays.size,
        critical,
        serious,
        warning,
        totalAmount,
    };
}
