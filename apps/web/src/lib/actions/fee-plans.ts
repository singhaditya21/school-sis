'use server';

/**
 * Fee plan lifecycle — reads and writes for /fees/plans.
 *
 * A fee plan is only usable if it carries at least one MANDATORY fee component:
 * `generateInvoices` sums non-optional components to price every invoice, so a
 * plan with no components (or only optional ones) silently bills every student
 * nothing. Every write path here enforces that invariant.
 *
 * `fee_components` has no tenant_id of its own — it inherits the tenant through
 * `fee_plan_id`. Every component query therefore joins/EXISTS back to
 * `fee_plans` on the caller's tenant instead of trusting the plan id.
 */

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';

// ─── Types ───────────────────────────────────────────────────

export interface FeePlanSummary {
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
    academicYearName: string;
    componentCount: number;
    mandatoryTotal: number;
    optionalTotal: number;
    invoiceCount: number;
}

export interface FeePlanComponent {
    id: string;
    name: string;
    amount: string;
    frequency: string;
    isOptional: boolean;
}

export interface FeePlanDetail {
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
    academicYearId: string;
    academicYearName: string;
    invoiceCount: number;
    components: FeePlanComponent[];
}

export interface FeePlanComponentInput {
    /** Existing fee_components.id; omitted (or empty) for a newly added row. */
    id?: string;
    name: string;
    /** Rupees, as typed. e.g. "15000" or "15000.50". */
    amount: string;
    frequency: string;
    isOptional: boolean;
}

export interface SaveFeePlanInput {
    planId: string;
    name: string;
    description: string;
    isActive: boolean;
    components: FeePlanComponentInput[];
}

/** Flat by design — Next.js erases union narrowing across the 'use server' boundary. */
export interface FeePlanSaveResult {
    success: boolean;
    error?: string;
    componentCount?: number;
    mandatoryTotal?: number;
}

// ─── Validation ──────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Mirrors the fee_frequency enum in the database. */
const FEE_FREQUENCY_VALUES = ['MONTHLY', 'QUARTERLY', 'TERM_WISE', 'ANNUAL', 'ONE_TIME'];

/** numeric(12,2) with a positive rupee value: up to 10 integer digits, 2 decimals. */
const AMOUNT_RE = /^\d{1,10}(\.\d{1,2})?$/;

type NormalisedComponent = {
    id: string | null;
    name: string;
    amount: string;
    frequency: string;
    isOptional: boolean;
};

/**
 * Validates the component rows and normalises amounts to a fixed 2-decimal
 * string so what is stored is exactly what the school typed in rupees.
 * Returns an error string instead of throwing so callers can hand it straight
 * back to the form.
 */
function normaliseComponents(
    rows: FeePlanComponentInput[],
): { error: string } | { components: NormalisedComponent[] } {
    if (!Array.isArray(rows) || rows.length === 0) {
        return { error: 'Add at least one fee component — a plan with none cannot be invoiced.' };
    }
    if (rows.length > 50) {
        return { error: 'A fee plan can hold at most 50 components.' };
    }

    const components: NormalisedComponent[] = [];

    for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const position = index + 1;

        const name = String(row?.name ?? '').trim();
        if (!name) return { error: `Component ${position}: name is required.` };
        if (name.length > 255) return { error: `Component ${position}: name must be 255 characters or fewer.` };

        const amount = String(row?.amount ?? '').trim();
        if (!AMOUNT_RE.test(amount)) {
            return { error: `Component "${name}": enter an amount in rupees, e.g. 15000 or 15000.50.` };
        }
        const amountValue = Number(amount);
        if (!Number.isFinite(amountValue) || amountValue <= 0) {
            return { error: `Component "${name}": amount must be greater than zero.` };
        }

        const frequency = String(row?.frequency ?? '').trim().toUpperCase();
        if (!FEE_FREQUENCY_VALUES.includes(frequency)) {
            return { error: `Component "${name}": choose a valid frequency.` };
        }

        const id = String(row?.id ?? '').trim();
        if (id && !UUID_RE.test(id)) {
            return { error: `Component "${name}": unrecognised component reference.` };
        }
        // Two rows claiming the same component id would collapse into one
        // UPDATE, so the plan would bill less than the editor showed.
        if (id && components.some((existing) => existing.id === id)) {
            return { error: `Component "${name}": the same component was submitted twice.` };
        }

        components.push({
            id: id || null,
            name,
            amount: amountValue.toFixed(2),
            frequency,
            isOptional: row?.isOptional === true,
        });
    }

    if (!components.some((component) => !component.isOptional)) {
        return {
            error: 'At least one component must be mandatory — invoices are priced from mandatory components only.',
        };
    }

    return { components };
}

function mandatorySum(components: NormalisedComponent[]): number {
    const paise = components.reduce(
        (total, component) => (component.isOptional ? total : total + Math.round(Number(component.amount) * 100)),
        0,
    );
    return paise / 100;
}

// ─── Reads ───────────────────────────────────────────────────

/**
 * Every plan for the tenant with the numbers a school needs to see before
 * invoicing: how many components it carries and what each student would be
 * billed (mandatory components only, matching generateInvoices).
 */
export async function getFeePlanSummaries(): Promise<FeePlanSummary[]> {
    const { tenantId } = await requireAuth('fees:read');

    const { rows } = await pool.query(
        `SELECT
            p.id,
            p.name,
            p.description,
            p.is_active AS "isActive",
            a.name AS "academicYearName",
            comp.component_count AS "componentCount",
            comp.mandatory_total AS "mandatoryTotal",
            comp.optional_total AS "optionalTotal",
            inv.invoice_count AS "invoiceCount"
         FROM fee_plans p
         INNER JOIN academic_years a
                 ON a.id = p.academic_year_id AND a.tenant_id = p.tenant_id
         LEFT JOIN LATERAL (
            SELECT
                COUNT(*) AS component_count,
                COALESCE(SUM(CASE WHEN fc.is_optional THEN 0 ELSE fc.amount END), 0) AS mandatory_total,
                COALESCE(SUM(CASE WHEN fc.is_optional THEN fc.amount ELSE 0 END), 0) AS optional_total
            FROM fee_components fc
            WHERE fc.fee_plan_id = p.id
         ) comp ON TRUE
         LEFT JOIN LATERAL (
            SELECT COUNT(*) AS invoice_count
            FROM invoices i
            WHERE i.fee_plan_id = p.id AND i.tenant_id = p.tenant_id
         ) inv ON TRUE
         WHERE p.tenant_id = $1
         ORDER BY p.created_at DESC`,
        [tenantId],
    );

    return rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        isActive: row.isActive,
        academicYearName: row.academicYearName,
        componentCount: Number(row.componentCount ?? 0),
        mandatoryTotal: Number(row.mandatoryTotal ?? 0),
        optionalTotal: Number(row.optionalTotal ?? 0),
        invoiceCount: Number(row.invoiceCount ?? 0),
    }));
}

/** One plan with its components, or null when it is not this tenant's plan. */
export async function getFeePlanDetail(planId: string): Promise<FeePlanDetail | null> {
    const { tenantId } = await requireAuth('fees:read');

    if (!UUID_RE.test(String(planId ?? ''))) return null;

    const { rows: planRows } = await pool.query(
        `SELECT
            p.id,
            p.name,
            p.description,
            p.is_active AS "isActive",
            p.academic_year_id AS "academicYearId",
            a.name AS "academicYearName",
            (SELECT COUNT(*) FROM invoices i
              WHERE i.fee_plan_id = p.id AND i.tenant_id = p.tenant_id) AS "invoiceCount"
         FROM fee_plans p
         INNER JOIN academic_years a
                 ON a.id = p.academic_year_id AND a.tenant_id = p.tenant_id
         WHERE p.id = $1 AND p.tenant_id = $2`,
        [planId, tenantId],
    );

    const plan = planRows[0];
    if (!plan) return null;

    const { rows: componentRows } = await pool.query(
        `SELECT
            fc.id,
            fc.name,
            fc.amount,
            fc.frequency,
            fc.is_optional AS "isOptional"
         FROM fee_components fc
         INNER JOIN fee_plans p ON p.id = fc.fee_plan_id
         WHERE fc.fee_plan_id = $1 AND p.tenant_id = $2
         ORDER BY fc.created_at ASC, fc.name ASC`,
        [planId, tenantId],
    );

    return {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        isActive: plan.isActive,
        academicYearId: plan.academicYearId,
        academicYearName: plan.academicYearName,
        invoiceCount: Number(plan.invoiceCount ?? 0),
        components: componentRows.map((row) => ({
            id: row.id,
            name: row.name,
            amount: row.amount,
            frequency: row.frequency,
            isOptional: row.isOptional,
        })),
    };
}

// ─── Write ───────────────────────────────────────────────────

/**
 * Saves the plan header and reconciles its components in ONE transaction:
 * rows the editor kept are updated in place (so invoice line-item snapshots
 * keep pointing at a live component id), removed rows are deleted, and new
 * rows are inserted. A partially-saved plan would misprice every future
 * invoice, so nothing is committed unless all of it succeeds.
 */
export async function saveFeePlan(input: SaveFeePlanInput): Promise<FeePlanSaveResult> {
    const { tenantId } = await requireAuth('fees:write');

    const planId = String(input?.planId ?? '').trim();
    if (!UUID_RE.test(planId)) {
        return { success: false, error: 'Unrecognised fee plan.' };
    }

    const name = String(input?.name ?? '').trim();
    if (!name) return { success: false, error: 'Plan name is required.' };
    if (name.length > 255) return { success: false, error: 'Plan name must be 255 characters or fewer.' };

    const description = String(input?.description ?? '').trim();
    const isActive = input?.isActive !== false;

    const normalised = normaliseComponents(input?.components ?? []);
    if ('error' in normalised) {
        return { success: false, error: normalised.error };
    }
    const components = normalised.components;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: lockRows } = await client.query(
            `SELECT id FROM fee_plans WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
            [planId, tenantId],
        );
        if (!lockRows[0]) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Fee plan not found.' };
        }

        await client.query(
            `UPDATE fee_plans
                SET name = $1, description = $2, is_active = $3, updated_at = now()
              WHERE id = $4 AND tenant_id = $5`,
            [name, description || null, isActive, planId, tenantId],
        );

        const { rows: existingRows } = await client.query(
            `SELECT id FROM fee_components WHERE fee_plan_id = $1`,
            [planId],
        );
        const existingIds = new Set<string>(existingRows.map((row) => row.id));

        // An id the editor sent that this plan does not own is a tampered or
        // stale payload — refuse rather than quietly re-creating it.
        const keptIds: string[] = [];
        for (const component of components) {
            if (!component.id) continue;
            if (!existingIds.has(component.id)) {
                await client.query('ROLLBACK');
                return {
                    success: false,
                    error: 'This plan changed since you opened it. Reload the page and try again.',
                };
            }
            keptIds.push(component.id);
        }

        if (existingIds.size > 0) {
            await client.query(
                `DELETE FROM fee_components
                  WHERE fee_plan_id = $1 AND NOT (id = ANY($2::uuid[]))`,
                [planId, keptIds],
            );
        }

        for (const component of components) {
            if (component.id) {
                await client.query(
                    `UPDATE fee_components
                        SET name = $1, amount = $2, frequency = $3::fee_frequency, is_optional = $4
                      WHERE id = $5 AND fee_plan_id = $6`,
                    [component.name, component.amount, component.frequency, component.isOptional, component.id, planId],
                );
            } else {
                await client.query(
                    `INSERT INTO fee_components (id, fee_plan_id, name, amount, frequency, is_optional)
                     VALUES ($1, $2, $3, $4, $5::fee_frequency, $6)`,
                    [randomUUID(), planId, component.name, component.amount, component.frequency, component.isOptional],
                );
            }
        }

        await client.query('COMMIT');

        revalidatePath('/fees');
        revalidatePath('/fees/plans');
        revalidatePath(`/fees/plans/${planId}/edit`);

        return {
            success: true,
            componentCount: components.length,
            mandatoryTotal: mandatorySum(components),
        };
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Could not save the fee plan.',
        };
    } finally {
        client.release();
    }
}
