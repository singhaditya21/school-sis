'use server';

/**
 * Invoice Generation — Bulk and Individual
 * 
 * Generates invoices for students based on fee plans.
 * Supports both individual student invoices and bulk class-wide generation.
 */

import { db } from '@/lib/db';
import { invoices, feePlans, feeComponents, students, grades, sections, concessions } from '@/lib/db/schema';
import { eq, and, count, inArray } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { randomUUID } from 'crypto';

// ─── Types ───────────────────────────────────────────────────

export interface GenerateInvoiceOptions {
    feePlanId: string;
    studentIds: string[];       // specific students
    dueDate: string;            // YYYY-MM-DD
    description?: string;
}

export interface BulkGenerateOptions {
    feePlanId: string;
    gradeId?: string;           // optional: filter by grade
    sectionId?: string;         // optional: filter by section
    dueDate: string;
    description?: string;
}

export interface GenerationResult {
    success: boolean;
    generated: number;
    skipped: number;
    errors: string[];
}

// ─── Individual Invoice Generation ───────────────────────────

export async function generateInvoices(options: GenerateInvoiceOptions): Promise<GenerationResult> {
    const { tenantId, userId } = await requireAuth('fees:write');

    // Validate fee plan
    const [plan] = await db
        .select({ id: feePlans.id, name: feePlans.name })
        .from(feePlans)
        .where(and(eq(feePlans.id, options.feePlanId), eq(feePlans.tenantId, tenantId)));

    if (!plan) {
        return { success: false, generated: 0, skipped: 0, errors: ['Fee plan not found'] };
    }

    // Get fee components for this plan
    const components = await db
        .select({
            id: feeComponents.id,
            name: feeComponents.name,
            amount: feeComponents.amount,
            frequency: feeComponents.frequency,
            isOptional: feeComponents.isOptional,
        })
        .from(feeComponents)
        .where(eq(feeComponents.feePlanId, plan.id));

    if (components.length === 0) {
        return { success: false, generated: 0, skipped: 0, errors: ['Fee plan has no components'] };
    }

    // Calculate total (mandatory components only)
    const mandatoryComponents = components.filter(c => !c.isOptional);
    const totalAmount = mandatoryComponents.reduce((sum, c) => sum + Number(c.amount), 0);

    let generated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const studentId of options.studentIds) {
        try {
            // Verify student belongs to tenant
            const [student] = await db
                .select({ id: students.id, firstName: students.firstName, lastName: students.lastName })
                .from(students)
                .where(and(eq(students.id, studentId), eq(students.tenantId, tenantId)));

            if (!student) {
                skipped++;
                errors.push(`Student ${studentId} not found`);
                continue;
            }

            // Check for concessions
            const studentConcessions = await db
                .select({ type: concessions.type, value: concessions.value })
                .from(concessions)
                .where(and(
                    eq(concessions.studentId, studentId),
                    eq(concessions.feePlanId, plan.id),
                    eq(concessions.isActive, true),
                ));

            // Apply concession
            let finalAmount = totalAmount;
            for (const conc of studentConcessions) {
                if (conc.type === 'PERCENTAGE') {
                    finalAmount -= totalAmount * (Number(conc.value) / 100);
                } else {
                    finalAmount -= Number(conc.value);
                }
            }
            finalAmount = Math.max(0, Math.round(finalAmount * 100) / 100);

            // Generate invoice number
            const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}-${generated + 1}`;

            // Build line items JSON
            const lineItems = JSON.stringify(
                mandatoryComponents.map(c => ({
                    componentId: c.id,
                    name: c.name,
                    amount: Number(c.amount),
                    frequency: c.frequency,
                }))
            );

            await db.insert(invoices).values({
                id: randomUUID(),
                tenantId,
                studentId,
                feePlanId: plan.id,
                invoiceNumber,
                totalAmount: String(finalAmount),
                paidAmount: '0',
                dueDate: options.dueDate,
                status: 'PENDING',
                description: options.description || `${plan.name} - Invoice`,
                lineItems,
            });

            generated++;
        } catch (err: any) {
            skipped++;
            errors.push(`Error for student ${studentId}: ${err.message}`);
        }
    }

    return { success: generated > 0, generated, skipped, errors };
}

// ─── Bulk Invoice Generation (by grade/section) ──────────────

export async function generateBulkInvoices(options: BulkGenerateOptions): Promise<GenerationResult> {
    const { tenantId } = await requireAuth('fees:write');

    // Find all active students matching the criteria
    const conditions = [
        eq(students.tenantId, tenantId),
        eq(students.status, 'ACTIVE' as any),
    ];

    if (options.gradeId) {
        conditions.push(eq(students.gradeId, options.gradeId));
    }
    if (options.sectionId) {
        conditions.push(eq(students.sectionId, options.sectionId));
    }

    const studentRows = await db
        .select({ id: students.id })
        .from(students)
        .where(and(...conditions));

    if (studentRows.length === 0) {
        return { success: false, generated: 0, skipped: 0, errors: ['No matching students found'] };
    }

    // Delegate to the individual generator
    return generateInvoices({
        feePlanId: options.feePlanId,
        studentIds: studentRows.map(s => s.id),
        dueDate: options.dueDate,
        description: options.description,
    });
}

// ─── Get Invoice Generation Preview ──────────────────────────

export interface InvoicePreview {
    feePlanName: string;
    studentCount: number;
    totalPerStudent: number;
    components: { name: string; amount: number; frequency: string }[];
    estimatedTotal: number;
}

export async function getInvoiceGenerationPreview(
    feePlanId: string,
    gradeId?: string,
    sectionId?: string,
): Promise<InvoicePreview | null> {
    const { tenantId } = await requireAuth('fees:read');

    const [plan] = await db
        .select({ id: feePlans.id, name: feePlans.name })
        .from(feePlans)
        .where(and(eq(feePlans.id, feePlanId), eq(feePlans.tenantId, tenantId)));

    if (!plan) return null;

    const components = await db
        .select({
            name: feeComponents.name,
            amount: feeComponents.amount,
            frequency: feeComponents.frequency,
            isOptional: feeComponents.isOptional,
        })
        .from(feeComponents)
        .where(eq(feeComponents.feePlanId, feePlanId));

    const mandatory = components.filter(c => !c.isOptional);
    const totalPerStudent = mandatory.reduce((sum, c) => sum + Number(c.amount), 0);

    // Count matching students
    const studentConditions = [
        eq(students.tenantId, tenantId),
        eq(students.status, 'ACTIVE' as any),
    ];
    if (gradeId) studentConditions.push(eq(students.gradeId, gradeId));
    if (sectionId) studentConditions.push(eq(students.sectionId, sectionId));

    const [studentCount] = await db
        .select({ count: count() })
        .from(students)
        .where(and(...studentConditions));

    return {
        feePlanName: plan.name,
        studentCount: studentCount.count,
        totalPerStudent,
        components: mandatory.map(c => ({
            name: c.name,
            amount: Number(c.amount),
            frequency: c.frequency,
        })),
        estimatedTotal: totalPerStudent * studentCount.count,
    };
}
