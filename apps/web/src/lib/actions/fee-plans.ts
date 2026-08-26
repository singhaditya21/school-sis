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
 * `fee_plan_id`. That used to be a comment asking the next author to remember a
 * join. It is now structural: reads go through `scope.fromChild(...)`, which
 * cannot be built without naming the owning parent, and writes go through
 * `scope.childInsert/childUpdate/childDelete`, which cannot be called without
 * an `OwnedRow` handle minted by a tenant-scoped read of `fee_plans`.
 *
 * See packages/api/src/data/index.ts for how to move the next domain across.
 */

import { tenantScope } from '@school-sis/api/src/data';
import { academicYears, feeComponents, feePlans, invoices } from '@school-sis/api/src/db/schema';
import { asc, desc, eq, notInArray, sql } from 'drizzle-orm';
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

/**
 * The fee_frequency enum, read off the schema rather than retyped. A value the
 * database would reject can no longer pass validation here.
 */
type FeeFrequency = (typeof feeComponents.$inferInsert)['frequency'];
const FEE_FREQUENCY_VALUES: readonly string[] = feeComponents.frequency.enumValues;

/** numeric(12,2) with a positive rupee value: up to 10 integer digits, 2 decimals. */
const AMOUNT_RE = /^\d{1,10}(\.\d{1,2})?$/;

type NormalisedComponent = {
    id: string | null;
    name: string;
    amount: string;
    frequency: FeeFrequency;
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
            frequency: frequency as FeeFrequency,
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
 *
 * The per-plan aggregates stay as correlated subqueries, but every column in
 * them is interpolated from the schema, so a renamed or imagined column is a
 * compile error instead of a 500 on the plans page.
 */
export async function getFeePlanSummaries(): Promise<FeePlanSummary[]> {
    const { tenantId } = await requireAuth('fees:read');
    const scope = tenantScope(tenantId);

    const rows = await scope
        .from(feePlans)
        .innerJoin(academicYears, eq(academicYears.id, feePlans.academicYearId))
        .select({
            id: feePlans.id,
            name: feePlans.name,
            description: feePlans.description,
            isActive: feePlans.isActive,
            academicYearName: academicYears.name,
            componentCount: sql<string>`(
                SELECT COUNT(*) FROM ${feeComponents}
                 WHERE ${feeComponents.feePlanId} = ${feePlans.id}
            )`,
            mandatoryTotal: sql<string>`(
                SELECT COALESCE(SUM(CASE WHEN ${feeComponents.isOptional} THEN 0 ELSE ${feeComponents.amount} END), 0)
                  FROM ${feeComponents}
                 WHERE ${feeComponents.feePlanId} = ${feePlans.id}
            )`,
            optionalTotal: sql<string>`(
                SELECT COALESCE(SUM(CASE WHEN ${feeComponents.isOptional} THEN ${feeComponents.amount} ELSE 0 END), 0)
                  FROM ${feeComponents}
                 WHERE ${feeComponents.feePlanId} = ${feePlans.id}
            )`,
            invoiceCount: sql<string>`(
                SELECT COUNT(*) FROM ${invoices}
                 WHERE ${invoices.feePlanId} = ${feePlans.id}
                   AND ${invoices.tenantId} = ${feePlans.tenantId}
            )`,
        })
        .orderBy(desc(feePlans.createdAt))
        .rows();

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
    const scope = tenantScope(tenantId);

    if (!UUID_RE.test(String(planId ?? ''))) return null;

    const plan = await scope
        .from(feePlans)
        .innerJoin(academicYears, eq(academicYears.id, feePlans.academicYearId))
        .select({
            id: feePlans.id,
            name: feePlans.name,
            description: feePlans.description,
            isActive: feePlans.isActive,
            academicYearId: feePlans.academicYearId,
            academicYearName: academicYears.name,
            invoiceCount: sql<string>`(
                SELECT COUNT(*) FROM ${invoices}
                 WHERE ${invoices.feePlanId} = ${feePlans.id}
                   AND ${invoices.tenantId} = ${feePlans.tenantId}
            )`,
        })
        .where(eq(feePlans.id, planId))
        .first();

    if (!plan) return null;

    const componentRows = await scope
        .fromChild(feeComponents, { parent: feePlans, on: eq(feeComponents.feePlanId, feePlans.id) })
        .select({
            id: feeComponents.id,
            name: feeComponents.name,
            amount: feeComponents.amount,
            frequency: feeComponents.frequency,
            isOptional: feeComponents.isOptional,
        })
        .where(eq(feeComponents.feePlanId, planId))
        .orderBy(asc(feeComponents.createdAt), asc(feeComponents.name))
        .rows();

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

/** Aborts the save transaction with a message the form can show verbatim. */
class FeePlanSaveAbort extends Error {}

/**
 * Saves the plan header and reconciles its components in ONE transaction:
 * rows the editor kept are updated in place (so invoice line-item snapshots
 * keep pointing at a live component id), removed rows are deleted, and new
 * rows are inserted. A partially-saved plan would misprice every future
 * invoice, so nothing is committed unless all of it succeeds.
 */
export async function saveFeePlan(input: SaveFeePlanInput): Promise<FeePlanSaveResult> {
    const { tenantId } = await requireAuth('fees:write');
    const scope = tenantScope(tenantId);

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

    try {
        await scope.transaction(async (tx) => {
            // Locks the plan AND proves it belongs to this tenant. The handle it
            // returns is what unlocks the fee_components writes below; without it
            // they do not compile.
            const owned = await tx.claim(feePlans, planId, { forUpdate: true });
            if (!owned) throw new FeePlanSaveAbort('Fee plan not found.');

            await tx.update(
                feePlans,
                { name, description: description || null, isActive, updatedAt: new Date() },
                eq(feePlans.id, planId),
            );

            const existingRows = await tx
                .childSelect(feeComponents, owned, 'feePlanId')
                .select({ id: feeComponents.id })
                .rows();
            const existingIds = new Set<string>(existingRows.map((row) => row.id));

            // An id the editor sent that this plan does not own is a tampered or
            // stale payload — refuse rather than quietly re-creating it.
            const keptIds: string[] = [];
            for (const component of components) {
                if (!component.id) continue;
                if (!existingIds.has(component.id)) {
                    throw new FeePlanSaveAbort(
                        'This plan changed since you opened it. Reload the page and try again.',
                    );
                }
                keptIds.push(component.id);
            }

            if (existingIds.size > 0) {
                await tx.childDelete(
                    feeComponents,
                    owned,
                    'feePlanId',
                    keptIds.length > 0 ? notInArray(feeComponents.id, keptIds) : undefined,
                );
            }

            for (const component of components) {
                if (component.id) {
                    await tx.childUpdate(
                        feeComponents,
                        owned,
                        'feePlanId',
                        {
                            name: component.name,
                            amount: component.amount,
                            frequency: component.frequency,
                            isOptional: component.isOptional,
                        },
                        eq(feeComponents.id, component.id),
                    );
                } else {
                    await tx.childInsert(feeComponents, owned, 'feePlanId', {
                        id: randomUUID(),
                        name: component.name,
                        amount: component.amount,
                        frequency: component.frequency,
                        isOptional: component.isOptional,
                    });
                }
            }
        });
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Could not save the fee plan.',
        };
    }

    revalidatePath('/fees');
    revalidatePath('/fees/plans');
    revalidatePath(`/fees/plans/${planId}/edit`);

    return {
        success: true,
        componentCount: components.length,
        mandatoryTotal: mandatorySum(components),
    };
}
