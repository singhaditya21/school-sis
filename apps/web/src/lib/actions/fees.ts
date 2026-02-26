'use server';

import { db } from '@/lib/db';
import { feePlans, feeComponents, invoices, payments, receipts, academicYears } from '@/lib/db/schema';
import { eq, and, count, sum, asc, desc } from 'drizzle-orm';
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

    // We need to join with students to get names
    const { students } = await import('@/lib/db/schema');

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
