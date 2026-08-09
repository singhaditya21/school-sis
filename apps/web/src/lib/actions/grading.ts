'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import {
    createGradingSchemeSchema,
    deleteGradingSchemeSchema,
    GRADING_SCHEME_TYPES,
    type GradeThreshold,
    type GradeThresholdInput,
    type GradingScheme,
    type GradingSchemeType,
    updateGradingSchemeSchema,
} from '@/lib/grading/validation';

type GradingMutationErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'CONFLICT' | 'DEFAULT_REQUIRED' | 'FAILED';

export type GradingMutationResult =
    | { success: true; schemes: GradingScheme[]; selectedId: string | null }
    | { success: false; code: GradingMutationErrorCode; error: string };

interface ScaleRow {
    id: string;
    name: string;
    type: string;
    description: string | null;
    isDefault: boolean;
    isActive: boolean;
    createdAt: Date | string;
    updatedAt: Date | string;
}

interface RubricRow {
    id: string;
    scaleId: string;
    label: string;
    minScore: string | number | null;
    maxScore: string | number | null;
    gpaValue: string | number | null;
    remark: string | null;
    displayOrder: number;
}

interface PersistedThreshold extends GradeThresholdInput {
    id: string;
    displayOrder: number;
}

type QueryExecutor = (text: string, params: unknown[]) => Promise<{ rows: unknown[] }>;

function asIso(value: Date | string): string {
    return new Date(value).toISOString();
}

function asSchemeType(value: string): GradingSchemeType {
    if ((GRADING_SCHEME_TYPES as readonly string[]).includes(value)) {
        return value as GradingSchemeType;
    }
    throw new Error(`Unsupported grading scheme type stored in database: ${value}`);
}

function thresholdsForPersistence(thresholds: readonly {
    grade?: string;
    minPercentage?: number;
    maxPercentage?: number;
    gradePoint?: number | null;
    remark?: string;
}[]): PersistedThreshold[] {
    return thresholds.map((threshold, displayOrder) => {
        if (
            threshold.grade === undefined
            || threshold.minPercentage === undefined
            || threshold.maxPercentage === undefined
            || threshold.gradePoint === undefined
        ) {
            throw new Error('Validated grading threshold is incomplete.');
        }

        return {
            id: randomUUID(),
            grade: threshold.grade,
            minPercentage: threshold.minPercentage,
            maxPercentage: threshold.maxPercentage,
            gradePoint: threshold.gradePoint,
            remark: threshold.remark || '',
            displayOrder,
        };
    });
}

function rubricFromRow(row: RubricRow): GradeThreshold {
    if (row.minScore === null || row.maxScore === null) {
        throw new Error(`Grading rubric ${row.id} is missing percentage boundaries.`);
    }

    return {
        id: row.id,
        grade: row.label,
        minPercentage: Number(row.minScore),
        maxPercentage: Number(row.maxScore),
        gradePoint: row.gpaValue === null ? null : Number(row.gpaValue),
        remark: row.remark || '',
        displayOrder: Number(row.displayOrder),
    };
}

async function fetchSchemes(query: QueryExecutor, tenantId: string): Promise<GradingScheme[]> {
    const [scaleResult, rubricResult] = await Promise.all([
        query(`
            SELECT
                id,
                name,
                type,
                description,
                is_default AS "isDefault",
                is_active AS "isActive",
                created_at AS "createdAt",
                updated_at AS "updatedAt"
            FROM grading_scales
            WHERE tenant_id = $1
            ORDER BY is_default DESC, is_active DESC, name ASC, id ASC
        `, [tenantId]),
        query(`
            SELECT
                rubric.id,
                rubric.scale_id AS "scaleId",
                rubric.label,
                rubric.min_score AS "minScore",
                rubric.max_score AS "maxScore",
                rubric.gpa_value AS "gpaValue",
                rubric.remark,
                rubric.display_order AS "displayOrder"
            FROM grading_rubrics rubric
            INNER JOIN grading_scales scale ON scale.id = rubric.scale_id
            WHERE scale.tenant_id = $1
            ORDER BY rubric.scale_id, rubric.display_order ASC, rubric.id ASC
        `, [tenantId]),
    ]);

    const scales = scaleResult.rows as ScaleRow[];
    const rubrics = rubricResult.rows as RubricRow[];
    const rubricsByScale = new Map<string, GradeThreshold[]>();

    for (const rubric of rubrics) {
        const current = rubricsByScale.get(rubric.scaleId) || [];
        current.push(rubricFromRow(rubric));
        rubricsByScale.set(rubric.scaleId, current);
    }

    return scales.map(scale => ({
        id: scale.id,
        name: scale.name,
        type: asSchemeType(scale.type),
        description: scale.description || '',
        isDefault: scale.isDefault,
        isActive: scale.isActive,
        updatedAt: asIso(scale.updatedAt),
        thresholds: rubricsByScale.get(scale.id) || [],
    }));
}

async function fetchRubricsForScale(
    query: QueryExecutor,
    tenantId: string,
    scaleId: string,
): Promise<GradeThreshold[]> {
    const result = await query(`
        SELECT
            rubric.id,
            rubric.scale_id AS "scaleId",
            rubric.label,
            rubric.min_score AS "minScore",
            rubric.max_score AS "maxScore",
            rubric.gpa_value AS "gpaValue",
            rubric.remark,
            rubric.display_order AS "displayOrder"
        FROM grading_rubrics rubric
        INNER JOIN grading_scales scale ON scale.id = rubric.scale_id
        WHERE rubric.scale_id = $1 AND scale.tenant_id = $2
        ORDER BY rubric.display_order ASC, rubric.id ASC
    `, [scaleId, tenantId]);

    return (result.rows as RubricRow[]).map(rubricFromRow);
}

async function insertRubrics(
    query: QueryExecutor,
    scaleId: string,
    thresholds: readonly PersistedThreshold[],
): Promise<void> {
    const params: unknown[] = [];
    const valueGroups = thresholds.map((threshold, index) => {
        const offset = index * 8;
        params.push(
            threshold.id,
            scaleId,
            threshold.grade,
            String(threshold.minPercentage),
            String(threshold.maxPercentage),
            threshold.gradePoint === null ? null : String(threshold.gradePoint),
            threshold.remark || null,
            threshold.displayOrder,
        );
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`;
    });

    await query(`
        INSERT INTO grading_rubrics (
            id, scale_id, label, min_score, max_score, gpa_value, remark, display_order
        ) VALUES ${valueGroups.join(', ')}
    `, params);
}

async function insertAudit(
    query: QueryExecutor,
    input: {
        tenantId: string;
        userId: string;
        action: 'CREATE' | 'UPDATE' | 'DELETE';
        entityId: string;
        description: string;
        beforeState: Record<string, unknown> | null;
        afterState: Record<string, unknown> | null;
    },
): Promise<void> {
    await query(`
        INSERT INTO audit_logs (
            id, tenant_id, user_id, action, entity_type, entity_id,
            description, before_state, after_state
        ) VALUES ($1, $2, $3, $4, 'GRADING_SCALE', $5, $6, $7::jsonb, $8::jsonb)
    `, [
        randomUUID(),
        input.tenantId,
        input.userId,
        input.action,
        input.entityId,
        input.description,
        JSON.stringify(input.beforeState),
        JSON.stringify(input.afterState),
    ]);
}

async function auditDefaultDemotions(
    query: QueryExecutor,
    tenantId: string,
    userId: string,
    demotedScales: readonly ScaleRow[],
    replacementId: string,
): Promise<void> {
    for (const scale of demotedScales) {
        await insertAudit(query, {
            tenantId,
            userId,
            action: 'UPDATE',
            entityId: scale.id,
            description: 'Default grading scheme changed.',
            beforeState: { isDefault: true, updatedAt: asIso(scale.updatedAt) },
            afterState: { isDefault: false, replacedBy: replacementId },
        });
    }
}

function firstValidationMessage(error: { issues: readonly { message: string }[] }): string {
    return error.issues[0]?.message || 'Enter valid grading scheme details.';
}

function mutationError(error: unknown, operation: string): GradingMutationResult {
    console.error(`[GRADING_${operation.toUpperCase()}_ERROR]`, error);
    return { success: false, code: 'FAILED', error: `The grading scheme was not ${operation}. Please try again.` };
}

function revalidateGradingSettings(): void {
    try {
        revalidatePath('/settings/grading');
    } catch (error) {
        console.error('[GRADING_REVALIDATE_ERROR]', error);
    }
}

export async function getGradingSchemes(): Promise<GradingScheme[]> {
    const { tenantId } = await requireAuth('settings:read');
    return fetchSchemes((text, params) => pool.query(text, params), tenantId);
}

export async function createGradingScheme(input: unknown): Promise<GradingMutationResult> {
    const { tenantId, userId } = await requireAuth('settings:write');
    const parsed = createGradingSchemeSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, code: 'INVALID_INPUT', error: firstValidationMessage(parsed.error) };
    }

    const client = await pool.connect();
    const query: QueryExecutor = (text, params) => client.query(text, params);
    let transactionOpen = false;
    let result: GradingMutationResult;

    try {
        await client.query('BEGIN');
        transactionOpen = true;

        const scaleResult = await query(`
            SELECT
                id, name, type, description,
                is_default AS "isDefault",
                is_active AS "isActive",
                created_at AS "createdAt",
                updated_at AS "updatedAt"
            FROM grading_scales
            WHERE tenant_id = $1
            ORDER BY created_at ASC, id ASC
            FOR UPDATE
        `, [tenantId]);
        const existingScales = scaleResult.rows as ScaleRow[];
        const effectiveDefault = parsed.data.isDefault || !existingScales.some(scale => scale.isDefault);

        if (effectiveDefault && !parsed.data.isActive) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return {
                success: false,
                code: 'DEFAULT_REQUIRED',
                error: 'The first or default grading scheme must be active.',
            };
        }

        const demotedScales = effectiveDefault
            ? existingScales.filter(scale => scale.isDefault)
            : [];
        if (demotedScales.length > 0) {
            await query(`
                UPDATE grading_scales
                SET is_default = false, updated_at = NOW()
                WHERE tenant_id = $1 AND is_default = true
            `, [tenantId]);
        }

        const scaleId = randomUUID();
        const thresholds = thresholdsForPersistence(parsed.data.thresholds);
        await query(`
            INSERT INTO grading_scales (
                id, tenant_id, name, type, description, is_default, is_active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            scaleId,
            tenantId,
            parsed.data.name,
            parsed.data.type,
            parsed.data.description || null,
            effectiveDefault,
            parsed.data.isActive,
        ]);
        await insertRubrics(query, scaleId, thresholds);
        await auditDefaultDemotions(query, tenantId, userId, demotedScales, scaleId);
        await insertAudit(query, {
            tenantId,
            userId,
            action: 'CREATE',
            entityId: scaleId,
            description: 'Grading scheme created.',
            beforeState: null,
            afterState: {
                name: parsed.data.name,
                type: parsed.data.type,
                description: parsed.data.description || null,
                isDefault: effectiveDefault,
                isActive: parsed.data.isActive,
                thresholds,
            },
        });

        const schemes = await fetchSchemes(query, tenantId);
        await client.query('COMMIT');
        transactionOpen = false;
        result = { success: true, schemes, selectedId: scaleId };
    } catch (error) {
        if (transactionOpen) await client.query('ROLLBACK');
        return mutationError(error, 'created');
    } finally {
        client.release();
    }

    revalidateGradingSettings();
    return result;
}

export async function updateGradingScheme(input: unknown): Promise<GradingMutationResult> {
    const { tenantId, userId } = await requireAuth('settings:write');
    const parsed = updateGradingSchemeSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, code: 'INVALID_INPUT', error: firstValidationMessage(parsed.error) };
    }

    const client = await pool.connect();
    const query: QueryExecutor = (text, params) => client.query(text, params);
    let transactionOpen = false;
    let result: GradingMutationResult;

    try {
        await client.query('BEGIN');
        transactionOpen = true;

        const scaleResult = await query(`
            SELECT
                id, name, type, description,
                is_default AS "isDefault",
                is_active AS "isActive",
                created_at AS "createdAt",
                updated_at AS "updatedAt"
            FROM grading_scales
            WHERE tenant_id = $1
            ORDER BY created_at ASC, id ASC
            FOR UPDATE
        `, [tenantId]);
        const scales = scaleResult.rows as ScaleRow[];
        const existing = scales.find(scale => scale.id === parsed.data.id);

        if (!existing) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return { success: false, code: 'NOT_FOUND', error: 'Grading scheme not found.' };
        }

        if (asIso(existing.updatedAt) !== asIso(parsed.data.updatedAt)) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return {
                success: false,
                code: 'CONFLICT',
                error: 'This grading scheme changed after you opened it. Reload before saving.',
            };
        }

        if (existing.isDefault && !parsed.data.isDefault) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return {
                success: false,
                code: 'DEFAULT_REQUIRED',
                error: 'Make another active scheme the default before unsetting this one.',
            };
        }

        const effectiveDefault = parsed.data.isDefault
            || !scales.some(scale => scale.id !== existing.id && scale.isDefault);
        if (effectiveDefault && !parsed.data.isActive) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return {
                success: false,
                code: 'DEFAULT_REQUIRED',
                error: 'The default grading scheme must remain active.',
            };
        }

        const existingThresholds = await fetchRubricsForScale(query, tenantId, existing.id);
        const demotedScales = effectiveDefault
            ? scales.filter(scale => scale.id !== existing.id && scale.isDefault)
            : [];
        if (demotedScales.length > 0) {
            await query(`
                UPDATE grading_scales
                SET is_default = false, updated_at = NOW()
                WHERE tenant_id = $1 AND id <> $2 AND is_default = true
            `, [tenantId, existing.id]);
        }

        const updateResult = await query(`
            UPDATE grading_scales
            SET
                name = $1,
                type = $2,
                description = $3,
                is_default = $4,
                is_active = $5,
                updated_at = NOW()
            WHERE id = $6 AND tenant_id = $7
            RETURNING updated_at AS "updatedAt"
        `, [
            parsed.data.name,
            parsed.data.type,
            parsed.data.description || null,
            effectiveDefault,
            parsed.data.isActive,
            existing.id,
            tenantId,
        ]);
        const updatedAt = (updateResult.rows[0] as { updatedAt: Date | string } | undefined)?.updatedAt;
        if (!updatedAt) throw new Error('Grading scheme update did not return a version.');

        await query('DELETE FROM grading_rubrics WHERE scale_id = $1', [existing.id]);
        const thresholds = thresholdsForPersistence(parsed.data.thresholds);
        await insertRubrics(query, existing.id, thresholds);
        await auditDefaultDemotions(query, tenantId, userId, demotedScales, existing.id);
        await insertAudit(query, {
            tenantId,
            userId,
            action: 'UPDATE',
            entityId: existing.id,
            description: 'Grading scheme updated.',
            beforeState: {
                name: existing.name,
                type: existing.type,
                description: existing.description,
                isDefault: existing.isDefault,
                isActive: existing.isActive,
                updatedAt: asIso(existing.updatedAt),
                thresholds: existingThresholds,
            },
            afterState: {
                name: parsed.data.name,
                type: parsed.data.type,
                description: parsed.data.description || null,
                isDefault: effectiveDefault,
                isActive: parsed.data.isActive,
                updatedAt: asIso(updatedAt),
                thresholds,
            },
        });

        const schemes = await fetchSchemes(query, tenantId);
        await client.query('COMMIT');
        transactionOpen = false;
        result = { success: true, schemes, selectedId: existing.id };
    } catch (error) {
        if (transactionOpen) await client.query('ROLLBACK');
        return mutationError(error, 'updated');
    } finally {
        client.release();
    }

    revalidateGradingSettings();
    return result;
}

export async function deleteGradingScheme(input: unknown): Promise<GradingMutationResult> {
    const { tenantId, userId } = await requireAuth('settings:write');
    const parsed = deleteGradingSchemeSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, code: 'INVALID_INPUT', error: firstValidationMessage(parsed.error) };
    }

    const client = await pool.connect();
    const query: QueryExecutor = (text, params) => client.query(text, params);
    let transactionOpen = false;
    let result: GradingMutationResult;

    try {
        await client.query('BEGIN');
        transactionOpen = true;

        const scaleResult = await query(`
            SELECT
                id, name, type, description,
                is_default AS "isDefault",
                is_active AS "isActive",
                created_at AS "createdAt",
                updated_at AS "updatedAt"
            FROM grading_scales
            WHERE tenant_id = $1
            ORDER BY is_active DESC, created_at ASC, id ASC
            FOR UPDATE
        `, [tenantId]);
        const scales = scaleResult.rows as ScaleRow[];
        const existing = scales.find(scale => scale.id === parsed.data.id);

        if (!existing) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return { success: false, code: 'NOT_FOUND', error: 'Grading scheme not found.' };
        }

        if (asIso(existing.updatedAt) !== asIso(parsed.data.updatedAt)) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return {
                success: false,
                code: 'CONFLICT',
                error: 'This grading scheme changed after you opened it. Reload before deleting.',
            };
        }

        const replacement = existing.isDefault
            ? scales.find(scale => scale.id !== existing.id && scale.isActive)
            : undefined;
        if (existing.isDefault && scales.length > 1 && !replacement) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return {
                success: false,
                code: 'DEFAULT_REQUIRED',
                error: 'Activate another scheme before deleting the current default.',
            };
        }

        const existingThresholds = await fetchRubricsForScale(query, tenantId, existing.id);
        await query('DELETE FROM grading_scales WHERE id = $1 AND tenant_id = $2', [existing.id, tenantId]);

        if (replacement) {
            const promotionResult = await query(`
                UPDATE grading_scales
                SET is_default = true, updated_at = NOW()
                WHERE id = $1 AND tenant_id = $2
                RETURNING updated_at AS "updatedAt"
            `, [replacement.id, tenantId]);
            const promotedAt = (promotionResult.rows[0] as { updatedAt: Date | string } | undefined)?.updatedAt;
            if (!promotedAt) throw new Error('Replacement default was not updated.');
            await insertAudit(query, {
                tenantId,
                userId,
                action: 'UPDATE',
                entityId: replacement.id,
                description: 'Default grading scheme changed after deletion.',
                beforeState: { isDefault: false, updatedAt: asIso(replacement.updatedAt) },
                afterState: { isDefault: true, updatedAt: asIso(promotedAt) },
            });
        }

        await insertAudit(query, {
            tenantId,
            userId,
            action: 'DELETE',
            entityId: existing.id,
            description: 'Grading scheme deleted.',
            beforeState: {
                name: existing.name,
                type: existing.type,
                description: existing.description,
                isDefault: existing.isDefault,
                isActive: existing.isActive,
                updatedAt: asIso(existing.updatedAt),
                thresholds: existingThresholds,
            },
            afterState: null,
        });

        const schemes = await fetchSchemes(query, tenantId);
        await client.query('COMMIT');
        transactionOpen = false;
        result = { success: true, schemes, selectedId: replacement?.id || schemes[0]?.id || null };
    } catch (error) {
        if (transactionOpen) await client.query('ROLLBACK');
        return mutationError(error, 'deleted');
    } finally {
        client.release();
    }

    revalidateGradingSettings();
    return result;
}
