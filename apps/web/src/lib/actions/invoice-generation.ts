'use server';

/**
 * Invoice Generation — Bulk and Individual
 *
 * Generates invoices for students based on fee plans.
 * Supports both individual student invoices and bulk class-wide generation.
 *
 * Runs on the tenant-scoped data layer (packages/api/src/data). The fee plan is
 * *claimed* — read back under this tenant's predicate — before anything is
 * priced from it, and its components are reached through that claim, so a plan
 * id belonging to another school cannot bill this school's students.
 */

import { tenantScope, and, eq, ne } from '@school-sis/api/src/data';
import { concessions, feeComponents, feePlans, invoices, students } from '@school-sis/api/src/db/generated/tables';
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

/** Postgres unique_violation, however the driver hands it back. */
function isUniqueViolation(err: unknown): boolean {
    const candidate = err as { code?: string; cause?: { code?: string } };
    return candidate?.code === '23505' || candidate?.cause?.code === '23505';
}

// ─── Individual Invoice Generation ───────────────────────────

export async function generateInvoices(options: GenerateInvoiceOptions): Promise<GenerationResult> {
    const { tenantId } = await requireAuth('fees:write');
    const scope = tenantScope(tenantId);

    // Validate fee plan. `claim` reads it back under this tenant and returns the
    // handle that the fee_components read below requires.
    const plan = await scope.claim<{ name: string }>(feePlans, options.feePlanId);

    if (!plan) {
        return { success: false, generated: 0, skipped: 0, errors: ['Fee plan not found'] };
    }

    // Get fee components for this plan
    const components = await scope
        .childSelect(feeComponents, plan, 'feePlanId')
        .select<{ id: string; name: string; amount: string; frequency: string; isOptional: boolean }>({
            id: feeComponents.id,
            name: feeComponents.name,
            amount: feeComponents.amount,
            frequency: feeComponents.frequency,
            isOptional: feeComponents.isOptional,
        })
        .rows();

    if (components.length === 0) {
        return { success: false, generated: 0, skipped: 0, errors: ['Fee plan has no components'] };
    }

    // Calculate total (mandatory components only)
    const mandatoryComponents = components.filter((c) => !c.isOptional);
    const totalAmount = mandatoryComponents.reduce((sum, c) => sum + Number(c.amount), 0);

    let generated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const studentId of options.studentIds) {
        try {
            // Verify student belongs to tenant
            const student = await scope
                .from(students)
                .select<{ firstName: string; lastName: string }>({ firstName: students.firstName, lastName: students.lastName })
                .where(eq(students.id, studentId))
                .first();

            if (!student) {
                skipped++;
                errors.push(`Student ${studentId} not found`);
                continue;
            }

            // Re-running the same plan for the same due date must not bill anyone
            // twice. A cancelled invoice does not count — a corrected re-issue is
            // legitimate. uq_invoices_tenant_student_plan_due_live enforces the
            // same rule in the database for the concurrent case.
            const existing = await scope
                .from(invoices)
                .select<{ invoiceNumber: string }>({ invoiceNumber: invoices.invoiceNumber })
                .where(and(
                    eq(invoices.studentId, studentId),
                    eq(invoices.feePlanId, plan.id),
                    eq(invoices.dueDate, options.dueDate),
                    ne(invoices.status, 'CANCELLED'),
                ))
                .limit(1)
                .first();

            if (existing) {
                skipped++;
                errors.push(
                    `${student.firstName} ${student.lastName} already has invoice ${existing.invoiceNumber} for this plan and due date`,
                );
                continue;
            }

            // Check for concessions
            const studentConcessions = await scope
                .from(concessions)
                .select<{ type: string; value: string }>({ type: concessions.type, value: concessions.value })
                .where(and(
                    eq(concessions.studentId, studentId),
                    eq(concessions.feePlanId, plan.id),
                    eq(concessions.isActive, true),
                ))
                .rows();

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
                mandatoryComponents.map((c) => ({
                    componentId: c.id,
                    name: c.name,
                    amount: Number(c.amount),
                    frequency: c.frequency,
                })),
            );

            await scope.insert(invoices, {
                id: randomUUID(),
                studentId,
                feePlanId: plan.id,
                invoiceNumber,
                totalAmount: String(finalAmount),
                paidAmount: '0',
                dueDate: options.dueDate,
                status: 'PENDING',
                description: options.description || `${plan.row.name} - Invoice`,
                lineItems,
            });

            generated++;
        } catch (err: unknown) {
            skipped++;
            // 23505 = unique_violation: another run billed this student first.
            if (isUniqueViolation(err)) {
                errors.push(`Student ${studentId} was already billed for this plan and due date`);
            } else {
                errors.push(`Error for student ${studentId}: ${(err as Error).message}`);
            }
        }
    }

    return { success: generated > 0, generated, skipped, errors };
}

// ─── Bulk Invoice Generation (by grade/section) ──────────────

export async function generateBulkInvoices(options: BulkGenerateOptions): Promise<GenerationResult> {
    const { tenantId } = await requireAuth('fees:write');
    const scope = tenantScope(tenantId);

    const studentRows = await scope
        .from(students)
        .select<{ id: string }>({ id: students.id })
        .where(and(
            eq(students.status, 'ACTIVE'),
            options.gradeId ? eq(students.gradeId, options.gradeId) : undefined,
            options.sectionId ? eq(students.sectionId, options.sectionId) : undefined,
        ))
        .rows();

    if (studentRows.length === 0) {
        return { success: false, generated: 0, skipped: 0, errors: ['No matching students found'] };
    }

    return generateInvoices({
        feePlanId: options.feePlanId,
        studentIds: studentRows.map((s) => s.id),
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
    const scope = tenantScope(tenantId);

    const plan = await scope.claim<{ name: string }>(feePlans, feePlanId);

    if (!plan) return null;

    const components = await scope
        .childSelect(feeComponents, plan, 'feePlanId')
        .select<{ name: string; amount: string; frequency: string; isOptional: boolean }>({
            name: feeComponents.name,
            amount: feeComponents.amount,
            frequency: feeComponents.frequency,
            isOptional: feeComponents.isOptional,
        })
        .rows();

    const mandatory = components.filter((c) => !c.isOptional);
    const totalPerStudent = mandatory.reduce((sum, c) => sum + Number(c.amount), 0);

    const studentCount = await scope.count(
        students,
        and(
            eq(students.status, 'ACTIVE'),
            gradeId ? eq(students.gradeId, gradeId) : undefined,
            sectionId ? eq(students.sectionId, sectionId) : undefined,
        ),
    );

    return {
        feePlanName: plan.row.name,
        studentCount: studentCount,
        totalPerStudent,
        components: mandatory.map((c) => ({
            name: c.name,
            amount: Number(c.amount),
            frequency: c.frequency,
        })),
        estimatedTotal: totalPerStudent * studentCount,
    };
}
