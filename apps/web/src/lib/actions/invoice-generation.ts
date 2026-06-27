'use server';

/**
 * Invoice Generation — Bulk and Individual
 * 
 * Generates invoices for students based on fee plans.
 * Supports both individual student invoices and bulk class-wide generation.
 */

import { pool } from '@/lib/db';
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
    const { rows: planRows } = await pool.query(`
        SELECT id, name
        FROM fee_plans
        WHERE id = $1 AND tenant_id = $2
    `, [options.feePlanId, tenantId]);
    const plan = planRows[0];

    if (!plan) {
        return { success: false, generated: 0, skipped: 0, errors: ['Fee plan not found'] };
    }

    // Get fee components for this plan
    const { rows: components } = await pool.query(`
        SELECT id, name, amount, frequency, is_optional AS "isOptional"
        FROM fee_components
        WHERE fee_plan_id = $1
    `, [plan.id]);

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
            const { rows: studentRows } = await pool.query(`
                SELECT id, first_name AS "firstName", last_name AS "lastName"
                FROM students
                WHERE id = $1 AND tenant_id = $2
            `, [studentId, tenantId]);
            const student = studentRows[0];

            if (!student) {
                skipped++;
                errors.push(`Student ${studentId} not found`);
                continue;
            }

            // Check for concessions
            const { rows: studentConcessions } = await pool.query(`
                SELECT type, value
                FROM concessions
                WHERE student_id = $1 AND fee_plan_id = $2 AND is_active = true
            `, [studentId, plan.id]);

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

            await pool.query(`
                INSERT INTO invoices (
                    id, tenant_id, student_id, fee_plan_id, invoice_number,
                    total_amount, paid_amount, due_date, status, description, line_items
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
                )
            `, [
                randomUUID(), tenantId, studentId, plan.id, invoiceNumber,
                String(finalAmount), '0', options.dueDate, 'PENDING',
                options.description || `${plan.name} - Invoice`, lineItems
            ]);

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

    let query = `
        SELECT id 
        FROM students
        WHERE tenant_id = $1 AND status = 'ACTIVE'
    `;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (options.gradeId) {
        query += ` AND grade_id = $${paramIndex++}`;
        params.push(options.gradeId);
    }
    if (options.sectionId) {
        query += ` AND section_id = $${paramIndex++}`;
        params.push(options.sectionId);
    }

    const { rows: studentRows } = await pool.query(query, params);

    if (studentRows.length === 0) {
        return { success: false, generated: 0, skipped: 0, errors: ['No matching students found'] };
    }

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

    const { rows: planRows } = await pool.query(`
        SELECT id, name
        FROM fee_plans
        WHERE id = $1 AND tenant_id = $2
    `, [feePlanId, tenantId]);
    const plan = planRows[0];

    if (!plan) return null;

    const { rows: components } = await pool.query(`
        SELECT name, amount, frequency, is_optional AS "isOptional"
        FROM fee_components
        WHERE fee_plan_id = $1
    `, [feePlanId]);

    const mandatory = components.filter(c => !c.isOptional);
    const totalPerStudent = mandatory.reduce((sum, c) => sum + Number(c.amount), 0);

    let countQuery = `
        SELECT COUNT(*) AS count
        FROM students
        WHERE tenant_id = $1 AND status = 'ACTIVE'
    `;
    const countParams: any[] = [tenantId];
    let paramIndex = 2;

    if (gradeId) {
        countQuery += ` AND grade_id = $${paramIndex++}`;
        countParams.push(gradeId);
    }
    if (sectionId) {
        countQuery += ` AND section_id = $${paramIndex++}`;
        countParams.push(sectionId);
    }

    const { rows: studentCountRows } = await pool.query(countQuery, countParams);
    const studentCount = Number(studentCountRows[0].count);

    return {
        feePlanName: plan.name,
        studentCount: studentCount,
        totalPerStudent,
        components: mandatory.map(c => ({
            name: c.name,
            amount: Number(c.amount),
            frequency: c.frequency,
        })),
        estimatedTotal: totalPerStudent * studentCount,
    };
}
