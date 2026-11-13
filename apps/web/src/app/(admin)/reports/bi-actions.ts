'use server';

import { pool, runWithTenantContext, sql } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { hasPermission, type UserRole } from '@/lib/rbac/permissions';
import { encryptEmailCandidates, decryptFieldTolerant } from '@/lib/encryption';
import { sanitizeCsvValue } from '@/lib/utils/csv-sanitize';
import { logger } from '@/lib/observability/logger';
import {
    getAllMetadataObjects,
    getObjectMetadata,
    queryRecords,
} from '@/lib/actions/metadata-engine';
import type { RollupAggregateFunction } from '@/lib/metadata/platform';
import {
    applyViewFilterRules,
    joinRecordsOnLookup,
    type JoinedReportConfig,
    type SavedViewFilterRule,
} from '@/lib/metadata/lcnc-helpers';
import {
    assertBiExportAllowed,
    getBiDataset,
    getBiExportPolicy,
    getBiMetric,
    requireApprovedWorkflowApprovalOrRequest,
    validateBiQueryRequest,
    WorkflowApprovalError,
} from '@school-sis/api';
import type { AuthorizationRole, BiQueryFilter } from '@school-sis/api';
import { BiCompileError, compileBiQuery } from './bi-query-plan';
import type { BiReportColumn, BiReportRow } from './bi-types';

export interface RunBiReportInput {
    datasetId: string;
    metricIds: string[];
    dimensionIds: string[];
    filters: BiQueryFilter[];
    dateFrom?: string;
    dateTo?: string;
    limit: number;
}

export interface RunBiReportResult {
    success: boolean;
    error?: string;
    columns?: BiReportColumn[];
    rows?: BiReportRow[];
    rowCount?: number;
    truncated?: boolean;
    appliedLimit?: number;
}

export interface ExportBiReportInput extends RunBiReportInput {
    exportPolicyId: string;
    reason: string;
    approvalRequestId?: string;
}

export interface ExportBiReportResult {
    success: boolean;
    error?: string;
    csv?: string;
    filename?: string;
    rowCount?: number;
    /** True when the export is gated behind a workflow approval that is not yet granted. */
    approvalRequired?: boolean;
    approvalRequestId?: string;
    approvalStatus?: string;
}

export async function runBiReport(input: RunBiReportInput): Promise<RunBiReportResult> {
    try {
        const { tenantId, userId, session } = await requireAuth('reports:read');

        const prepared = prepareQuery(
            { role: session.role, tenantId, userId },
            input,
        );
        if ('error' in prepared) return { success: false, error: prepared.error };

        const { rows } = await runWithTenantContext(tenantId, async () =>
            pool.query<Record<string, unknown>>(prepared.compiled.sql, prepared.compiled.params),
        );
        const metricLabels = new Set(prepared.compiled.metricColumns);

        return {
            success: true,
            columns: prepared.columns,
            rows: rows.map((row: Record<string, unknown>) => normalizeRow(row, prepared.compiled.columns, metricLabels)),
            rowCount: rows.length,
            appliedLimit: prepared.limit,
            truncated: rows.length >= prepared.limit,
        };
    } catch (error) {
        return { success: false, error: describeError(error, 'Report execution failed.') };
    }
}

export async function exportBiReport(input: ExportBiReportInput): Promise<ExportBiReportResult> {
    try {
        const { tenantId, userId, session } = await requireAuth('reports:export');
        const context = { role: session.role, tenantId, userId };

        const policy = getBiExportPolicy(input.exportPolicyId);
        if (!policy) {
            return { success: false, error: `Unknown export policy: ${input.exportPolicyId}` };
        }
        if (!input.reason.trim()) {
            return { success: false, error: 'Governed exports require an audit reason.' };
        }

        const dateRange = toDateRange(input);
        const requestedLimit = Math.min(input.limit, policy.maxRows);

        // assertBiExportAllowed throws on any policy/permission/shape violation.
        const validation = assertBiExportAllowed(context, {
            exportPolicyId: input.exportPolicyId,
            format: 'csv',
            scope: 'TENANT',
            tenantId,
            datasetId: input.datasetId,
            metricIds: input.metricIds,
            dimensionIds: input.dimensionIds,
            filters: input.filters,
            dateRange,
            limit: requestedLimit,
            reason: input.reason,
        });

        if (validation.approvalPolicyId) {
            const approval = await requireApprovedWorkflowApprovalOrRequest({
                approvalRequestId: input.approvalRequestId,
                policyId: validation.approvalPolicyId,
                tenantId,
                title: `Approve ${input.exportPolicyId} export`,
                description: 'Sensitive BI export requires workflow approval before release.',
                resource: { type: 'bi_export', id: input.exportPolicyId, tenantId },
                payload: buildApprovalPayload(input, tenantId, dateRange, requestedLimit),
                reason: input.reason,
                requestedBy: { userId, role: session.role as AuthorizationRole, tenantId },
            });

            if (!approval.approved) {
                return {
                    success: false,
                    approvalRequired: true,
                    approvalRequestId: approval.request.id,
                    approvalStatus: approval.request.status,
                    error: `This export is governed by policy "${validation.approvalPolicyId}". Approval request ${approval.request.id} is ${approval.request.status.toLowerCase()}.`,
                };
            }
        }

        const prepared = prepareQuery(context, { ...input, limit: requestedLimit });
        if ('error' in prepared) return { success: false, error: prepared.error };

        const { rows } = await runWithTenantContext(tenantId, async () =>
            pool.query<Record<string, unknown>>(prepared.compiled.sql, prepared.compiled.params),
        );
        const metricLabels = new Set(prepared.compiled.metricColumns);
        const csv = toCsv(
            prepared.compiled.columns,
            rows.map((row: Record<string, unknown>) => normalizeRow(row, prepared.compiled.columns, metricLabels)),
        );

        return {
            success: true,
            csv,
            filename: `${input.exportPolicyId.replace(/[^a-z0-9]+/gi, '_')}_${new Date().toISOString().slice(0, 10)}.csv`,
            rowCount: rows.length,
        };
    } catch (error) {
        if (error instanceof WorkflowApprovalError) {
            return { success: false, error: error.message };
        }
        return { success: false, error: describeError(error, 'Export failed.') };
    }
}

type PreparedQuery = {
    compiled: ReturnType<typeof compileBiQuery>;
    columns: BiReportColumn[];
    limit: number;
};

function prepareQuery(
    context: { role: string; tenantId: string; userId: string },
    input: RunBiReportInput,
): PreparedQuery | { error: string } {
    const dataset = getBiDataset(input.datasetId);
    if (!dataset) return { error: `Unknown dataset: ${input.datasetId}` };

    const dateRange = toDateRange(input);

    const validation = validateBiQueryRequest(context, {
        datasetId: input.datasetId,
        scope: 'TENANT',
        tenantId: context.tenantId,
        metricIds: input.metricIds,
        dimensionIds: input.dimensionIds,
        filters: input.filters,
        dateRange,
        limit: input.limit,
    });

    if (!validation.valid || !validation.dataset) {
        return { error: validation.deniedReason ?? 'This BI request was denied by the catalog.' };
    }

    const compiled = compileBiQuery({
        dataset: validation.dataset,
        tenantId: context.tenantId,
        metricIds: input.metricIds,
        dimensionIds: input.dimensionIds,
        filters: input.filters,
        dateRange,
        limit: validation.normalizedLimit,
    });

    const columns: BiReportColumn[] = [
        ...input.dimensionIds.map((dimensionId) => {
            const definition = validation.dataset!.dimensions.find((entry) => entry.id === dimensionId)!;
            return {
                label: definition.label,
                kind: 'dimension' as const,
                format: definition.type === 'date' ? ('date' as const) : ('text' as const),
            };
        }),
        ...input.metricIds.map((metricId) => ({
            label: getBiMetric(metricId)?.label ?? metricId,
            kind: 'metric' as const,
            format: getBiMetric(metricId)?.format ?? 'number',
        })),
    ];

    return { compiled, columns, limit: validation.normalizedLimit };
}

function toDateRange(input: RunBiReportInput): { from: string; to: string } | undefined {
    return input.dateFrom && input.dateTo ? { from: input.dateFrom, to: input.dateTo } : undefined;
}

function buildApprovalPayload(
    input: ExportBiReportInput,
    tenantId: string,
    dateRange: { from: string; to: string } | undefined,
    limit: number,
): Record<string, unknown> {
    return {
        exportPolicyId: input.exportPolicyId,
        format: 'csv',
        scope: 'TENANT',
        tenantId,
        datasetId: input.datasetId,
        metricIds: input.metricIds,
        dimensionIds: input.dimensionIds,
        filters: input.filters,
        dateRange,
        limit,
        reason: input.reason,
    };
}

function normalizeRow(
    row: Record<string, unknown>,
    columns: readonly string[],
    metricLabels: ReadonlySet<string>,
): BiReportRow {
    const normalized: BiReportRow = {};
    for (const column of columns) {
        normalized[column] = normalizeCell(row[column], metricLabels.has(column));
    }
    return normalized;
}

function normalizeCell(value: unknown, numeric: boolean): string | number | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return formatDateOnly(value);
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'string') {
        if (!numeric) return value;
        const parsed = Number(value);
        return value.trim() !== '' && Number.isFinite(parsed) ? parsed : value;
    }
    return String(value);
}

/** pg parses `date` columns into local-midnight Date objects, so read local components. */
function formatDateOnly(value: Date): string {
    const month = `${value.getMonth() + 1}`.padStart(2, '0');
    const day = `${value.getDate()}`.padStart(2, '0');
    return `${value.getFullYear()}-${month}-${day}`;
}

function toCsv(columns: readonly string[], rows: readonly BiReportRow[]): string {
    return [
        columns.map((column) => sanitizeCsvValue(column)).join(','),
        ...rows.map((row) => columns.map((column) => sanitizeCsvValue(row[column] ?? null)).join(',')),
    ].join('\n');
}

function describeError(error: unknown, fallback: string): string {
    if (error instanceof BiCompileError) return error.message;
    if (error instanceof Error) {
        // Permission failures from requireAuth are safe and useful to surface verbatim.
        if (error.message.startsWith('Forbidden:')) return error.message;
        logger.error('bi_report.execution_failed', 'BI report error', {
            metadata: { error: error.message },
        });
    }
    return fallback;
}

export interface SavedBiReportDefinition {
    id: string;
    name: string;
    datasetId: string;
    metricIds: string[];
    dimensionIds: string[];
    categoryId?: string | null;
    categoryName?: string | null;
    scheduleFrequency: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
    recipientEmail?: string;
    createdAt: string;
}

/**
 * Saves a custom BI report definition (dataset, metrics, dimensions, report category, and optional
 * recurring delivery schedule) into `bi_report_definitions` plus an `audit_logs` trace.
 */
export async function saveCustomReportDefinition(input: {
    name: string;
    datasetId: string;
    metricIds: string[];
    dimensionIds: string[];
    categoryId?: string | null;
    scheduleFrequency?: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
    recipientEmail?: string;
}): Promise<{ success: boolean; error?: string; report?: SavedBiReportDefinition }> {
    try {
        const { tenantId, userId, session } = await requireAuth('reports:read');
        const trimmedName = String(input.name || '').trim();
        if (!trimmedName) {
            return { success: false, error: 'Report name is required.' };
        }
        if (!input.datasetId || !Array.isArray(input.metricIds) || input.metricIds.length === 0) {
            return { success: false, error: 'Select a dataset and at least one metric before saving.' };
        }

        const prepared = prepareQuery(
            { role: session.role, tenantId, userId },
            {
                datasetId: input.datasetId,
                metricIds: input.metricIds,
                dimensionIds: input.dimensionIds || [],
                filters: [],
                limit: 100,
            },
        );
        if ('error' in prepared) {
            return { success: false, error: prepared.error };
        }

        const scheduleFrequency = input.scheduleFrequency || 'NONE';
        let fallbackSessionEmail = String(session.email || '')
            .trim()
            .toLowerCase();
        if (fallbackSessionEmail) {
            fallbackSessionEmail = decryptFieldTolerant(fallbackSessionEmail)
                .trim()
                .toLowerCase();
        }
        if (!fallbackSessionEmail && !input.recipientEmail) {
            const actorRows = await runWithTenantContext(tenantId, async () =>
                sql<{ actor_email: string | null }>`
                    SELECT COALESCE(u.email_enc, u.email) AS actor_email
                    FROM users u
                    WHERE u.id = ${userId}
                      AND u.tenant_id = ${tenantId}
                    LIMIT 1
                `.rows(),
            );
            if (actorRows[0]?.actor_email) {
                fallbackSessionEmail = decryptFieldTolerant(actorRows[0].actor_email)
                    .trim()
                    .toLowerCase();
            }
        }

        const rawRecipient = String(input.recipientEmail || fallbackSessionEmail || '')
            .trim()
            .toLowerCase();
        let resolvedRecipient = rawRecipient;

        if (scheduleFrequency !== 'NONE') {
            if (!hasPermission(session.role as UserRole, 'reports:export')) {
                return {
                    success: false,
                    error: 'Forbidden: scheduling recurring report delivery requires reports:export permission.',
                };
            }
            if (!rawRecipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawRecipient)) {
                return {
                    success: false,
                    error: 'A valid tenant staff recipient email is required for scheduled delivery.',
                };
            }

            if (rawRecipient !== fallbackSessionEmail) {
                const candidateHashes = encryptEmailCandidates(rawRecipient);
                const recipientLookup = [rawRecipient, ...candidateHashes];
                const memberRows = await runWithTenantContext(tenantId, async () =>
                    sql<{ id: string; actor_email: string | null }>`
                        SELECT u.id, COALESCE(u.email_enc, u.email) AS actor_email
                        FROM users u
                        WHERE u.tenant_id = ${tenantId}
                          AND u.is_active = true
                          AND (
                            LOWER(COALESCE(u.email_enc, u.email)) = ${rawRecipient}
                            OR COALESCE(u.email_enc, u.email) = ANY(${recipientLookup}::text[])
                          )
                        LIMIT 1
                    `.rows(),
                );
                if (memberRows.length === 0) {
                    return {
                        success: false,
                        error: 'Scheduled BI reports can only be delivered to active members of this tenant.',
                    };
                }
                if (memberRows[0]?.actor_email) {
                    resolvedRecipient =
                        decryptFieldTolerant(memberRows[0].actor_email)
                            .trim()
                            .toLowerCase() || rawRecipient;
                }
            }
        }

        const recipientEmail = resolvedRecipient || fallbackSessionEmail;

        const reportPayload = {
            auditEvent: 'BI_REPORT_SAVED',
            name: trimmedName,
            datasetId: input.datasetId,
            metricIds: input.metricIds,
            dimensionIds: input.dimensionIds || [],
            scheduleFrequency,
            recipientEmail,
            savedBy: userId,
            savedAt: new Date().toISOString(),
        };

        const categoryId =
            input.categoryId && /^[0-9a-f-]{36}$/i.test(input.categoryId)
                ? input.categoryId
                : null;

        return await runWithTenantContext(tenantId, async () => {
            const scheduleJson = {
                scheduleFrequency,
                recipientEmail,
            };
            const inserted = await sql<{ id: string; created_at: Date | string }>`
                INSERT INTO bi_report_definitions (
                    tenant_id, scope, name, category_id, report_kind, dataset_key,
                    selected_metrics, selected_dimensions, filters, date_range, schedule,
                    status, created_by, updated_by, created_at, updated_at
                )
                VALUES (
                    ${tenantId},
                    'TENANT',
                    ${trimmedName},
                    ${categoryId},
                    'STANDARD_BI',
                    ${input.datasetId},
                    ${input.metricIds}::text[],
                    ${input.dimensionIds || []}::text[],
                    '[]'::jsonb,
                    '{}'::jsonb,
                    ${JSON.stringify(scheduleJson)}::jsonb,
                    'ACTIVE',
                    ${userId},
                    ${userId},
                    NOW(),
                    NOW()
                )
                RETURNING id, created_at
            `;

            await sql`
                INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, after_state)
                VALUES (
                    ${tenantId},
                    ${userId},
                    'CREATE',
                    'bi_report',
                    ${inserted[0]?.id || null},
                    ${JSON.stringify(reportPayload)}::jsonb
                )
            `.execute();

            if (scheduleFrequency !== 'NONE') {
                await sql`
                    INSERT INTO background_jobs (
                        tenant_id, scope, queue, task_name, status, priority, payload,
                        scheduled_for, available_at, max_attempts
                    )
                    VALUES (
                        ${tenantId},
                        'TENANT',
                        'default',
                        'BI_SCHEDULED_REPORT',
                        'QUEUED',
                        0,
                        ${JSON.stringify({
                            reportId: inserted[0]?.id,
                            ...reportPayload,
                        })}::jsonb,
                        NOW(),
                        NOW(),
                        3
                    )
                `.execute();

                await sql`
                    INSERT INTO notification_outbox (
                        tenant_id, channel, status, provider, recipient, subject, body,
                        template_id, payload, scheduled_for, next_attempt_at, max_attempts
                    )
                    VALUES (
                        ${tenantId},
                        'EMAIL',
                        'PENDING',
                        'resend',
                        ${recipientEmail},
                        ${`[ScholarMind BI] Scheduled Report: ${trimmedName} (${scheduleFrequency})`},
                        ${`Scheduled BI report "${trimmedName}" (${input.datasetId}) configured for ${scheduleFrequency} delivery.`},
                        'bi_scheduled_report',
                        ${JSON.stringify({
                            reportName: trimmedName,
                            datasetId: input.datasetId,
                            scheduleFrequency,
                        })}::jsonb,
                        NOW(),
                        NOW(),
                        3
                    )
                `.execute();
            }

            return {
                success: true,
                report: {
                    id: String(inserted[0]?.id || ''),
                    name: trimmedName,
                    datasetId: input.datasetId,
                    metricIds: input.metricIds,
                    dimensionIds: input.dimensionIds || [],
                    scheduleFrequency,
                    recipientEmail,
                    createdAt:
                        inserted[0]?.created_at instanceof Date
                            ? inserted[0].created_at.toISOString()
                            : String(inserted[0]?.created_at || new Date().toISOString()),
                },
            };
        });
    } catch (error) {
        return {
            success: false,
            error: describeError(error, 'Failed to save custom report definition.'),
        };
    }
}

/**
 * Returns the 20 most recently saved custom BI report definitions (`BI_REPORT_SAVED`)
 * for the authenticated tenant (`reports:read`).
 */
export async function getSavedBiReports(): Promise<SavedBiReportDefinition[]> {
    try {
        const { tenantId } = await requireAuth('reports:read');
        return await runWithTenantContext(tenantId, async () => {
            const rows = await sql<{
                id: string;
                name: string;
                dataset_key: string;
                selected_metrics: string[];
                selected_dimensions: string[];
                category_id: string | null;
                category_name: string | null;
                schedule: Record<string, unknown> | null;
                created_at: Date | string;
            }>`
                SELECT r.id,
                       r.name,
                       r.dataset_key,
                       r.selected_metrics,
                       r.selected_dimensions,
                       r.category_id,
                       rc.name AS category_name,
                       r.schedule,
                       r.created_at
                FROM bi_report_definitions r
                LEFT JOIN report_categories rc
                       ON rc.id = r.category_id
                      AND rc.tenant_id = ${tenantId}
                WHERE r.tenant_id = ${tenantId}
                  AND r.status = 'ACTIVE'
                  AND r.report_kind = 'STANDARD_BI'
                ORDER BY r.created_at DESC
                LIMIT 30
            `;

            return rows.map(row => {
                const sched = (row.schedule && typeof row.schedule === 'object'
                    ? row.schedule
                    : {}) as Record<string, unknown>;
                const freq = String(sched.scheduleFrequency || 'NONE').toUpperCase();
                return {
                    id: row.id,
                    name: row.name || 'Saved Report',
                    datasetId: row.dataset_key || '',
                    metricIds: Array.isArray(row.selected_metrics)
                        ? row.selected_metrics.map(String)
                        : [],
                    dimensionIds: Array.isArray(row.selected_dimensions)
                        ? row.selected_dimensions.map(String)
                        : [],
                    categoryId: row.category_id,
                    categoryName: row.category_name,
                    scheduleFrequency: (['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'].includes(freq)
                        ? freq
                        : 'NONE') as 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY',
                    recipientEmail: sched.recipientEmail ? String(sched.recipientEmail) : undefined,
                    createdAt:
                        row.created_at instanceof Date
                            ? row.created_at.toISOString()
                            : String(row.created_at),
                };
            });
        });
    } catch {
        return [];
    }
}

export interface CustomObjectLookupRelationship {
    lookupFieldApiName: string;
    lookupFieldLabel: string;
    relatedObjectApiName: string;
    relatedObjectLabel: string;
    joinDirection: 'CHILD_TO_PARENT' | 'PARENT_TO_CHILD';
}

export interface CustomObjectReportCatalogEntry {
    apiName: string;
    label: string;
    isCustom: boolean;
    dimensionFields: { apiName: string; label: string; dataType: string }[];
    numericFields: { apiName: string; label: string; dataType: string }[];
    lookupRelationships: CustomObjectLookupRelationship[];
}

const STANDARD_FOREIGN_KEY_OBJECT_MAP: Record<string, string> = {
    student_id: 'student',
    guardian_id: 'guardian',
    staff_id: 'staff',
    class_id: 'class',
    grade_id: 'class',
    section_id: 'section',
    subject_id: 'subject',
    route_id: 'route',
    vehicle_id: 'vehicle',
    hostel_id: 'hostel',
    book_id: 'book',
    exam_id: 'exam',
    invoice_id: 'invoice',
};

/**
 * Discovers all published metadata objects (including Education Cloud Blueprint objects
 * and custom EAV objects) and classifies their readable fields into groupable dimensions,
 * numeric/formula/roll-up metrics, and bidirectional `LOOKUP` relationships for the
 * Metadata-Driven & Joined Report Builder.
 */
export async function getCustomObjectReportCatalog(): Promise<
    CustomObjectReportCatalogEntry[]
> {
    try {
        await requireAuth('reports:read');
        const allObjects = await getAllMetadataObjects();
        const loadedObjects: {
            apiName: string;
            label: string;
            isCustom: boolean;
            fields: Awaited<ReturnType<typeof getObjectMetadata>>['fields'];
        }[] = [];

        for (const obj of allObjects) {
            const apiName = String(obj.api_name || '');
            if (!apiName) continue;
            try {
                const { fields } = await getObjectMetadata(apiName);
                if (fields.length === 0) continue;
                loadedObjects.push({
                    apiName,
                    label: String(obj.name || apiName),
                    isCustom: Boolean(obj.is_custom),
                    fields,
                });
            } catch {
                // Skip inaccessible objects
            }
        }

        const labelByApi = new Map(loadedObjects.map(o => [o.apiName, o.label]));
        const outgoingByObj = new Map<string, CustomObjectLookupRelationship[]>();
        const incomingByObj = new Map<string, CustomObjectLookupRelationship[]>();

        for (const obj of loadedObjects) {
            const outgoing: CustomObjectLookupRelationship[] = [];
            for (const f of obj.fields) {
                const explicitTarget =
                    f.validationRules?.fieldSubType === 'LOOKUP' &&
                    f.validationRules?.lookupTargetObject
                        ? String(f.validationRules.lookupTargetObject).toLowerCase()
                        : null;
                const standardTarget = STANDARD_FOREIGN_KEY_OBJECT_MAP[f.apiName] || null;
                const targetApi = explicitTarget || standardTarget;
                if (!targetApi || targetApi === obj.apiName || !labelByApi.has(targetApi)) {
                    continue;
                }
                const targetLabel = labelByApi.get(targetApi) || targetApi;
                outgoing.push({
                    lookupFieldApiName: f.apiName,
                    lookupFieldLabel: f.label,
                    relatedObjectApiName: targetApi,
                    relatedObjectLabel: targetLabel,
                    joinDirection: 'CHILD_TO_PARENT',
                });

                const inc = incomingByObj.get(targetApi) || [];
                inc.push({
                    lookupFieldApiName: f.apiName,
                    lookupFieldLabel: f.label,
                    relatedObjectApiName: obj.apiName,
                    relatedObjectLabel: obj.label,
                    joinDirection: 'PARENT_TO_CHILD',
                });
                incomingByObj.set(targetApi, inc);
            }
            outgoingByObj.set(obj.apiName, outgoing);
        }

        return loadedObjects.map(obj => {
            const dimensionFields = obj.fields
                .filter(
                    f =>
                        f.dataType === 'PICKLIST' ||
                        f.dataType === 'TEXT' ||
                        f.dataType === 'DATE' ||
                        f.dataType === 'BOOLEAN',
                )
                .map(f => ({
                    apiName: f.apiName,
                    label: f.label,
                    dataType: f.dataType,
                }));

            const numericFields = obj.fields
                .filter(
                    f =>
                        f.dataType === 'NUMBER' ||
                        f.dataType === 'CURRENCY' ||
                        f.validationRules?.fieldSubType === 'FORMULA' ||
                        f.validationRules?.fieldSubType === 'ROLLUP_SUMMARY',
                )
                .map(f => ({
                    apiName: f.apiName,
                    label: f.label,
                    dataType: f.dataType,
                }));

            const lookupRelationships = [
                ...(outgoingByObj.get(obj.apiName) || []),
                ...(incomingByObj.get(obj.apiName) || []),
            ];

            return {
                apiName: obj.apiName,
                label: obj.label,
                isCustom: obj.isCustom,
                dimensionFields,
                numericFields,
                lookupRelationships,
            };
        });
    } catch {
        return [];
    }
}

export interface RunCustomObjectBiReportResult {
    success: boolean;
    error?: string;
    columns?: BiReportColumn[];
    rows?: BiReportRow[];
    totalRecordsScanned?: number;
    previewJoinedRows?: Record<string, unknown>[];
}

/**
 * Executes a grouped aggregation (`COUNT`, `SUM`, `AVG`, `MIN`, `MAX`) over any
 * standard, custom EAV, or Education Cloud Blueprint object (`reports:read`),
 * including virtual `FORMULA`, `ROLLUP_SUMMARY`, and cross-object `LOOKUP` joined fields.
 */
export async function runCustomObjectBiReport(input: {
    objectApiName: string;
    groupByField: string;
    aggregateFunction: RollupAggregateFunction;
    metricField?: string;
    filterRules?: SavedViewFilterRule[];
    joinConfig?: JoinedReportConfig | null;
}): Promise<RunCustomObjectBiReportResult> {
    try {
        await requireAuth('reports:read');
        const { objectDef, fields } = await getObjectMetadata(input.objectApiName);

        let relatedObjectLabel = '';
        let relatedFields: Awaited<ReturnType<typeof getObjectMetadata>>['fields'] = [];
        if (input.joinConfig?.relatedObjectApiName) {
            const relMeta = await getObjectMetadata(input.joinConfig.relatedObjectApiName);
            relatedObjectLabel = relMeta.objectDef.name;
            relatedFields = relMeta.fields;
        }

        const resolveFieldInfo = (fieldRef: string | undefined) => {
            if (!fieldRef) return undefined;
            if (
                input.joinConfig &&
                fieldRef.startsWith(`${input.joinConfig.relatedObjectApiName}.`)
            ) {
                const subApi = fieldRef.slice(input.joinConfig.relatedObjectApiName.length + 1);
                const rf = relatedFields.find(f => f.apiName === subApi);
                if (!rf) return undefined;
                return {
                    apiName: fieldRef,
                    label: `${relatedObjectLabel}: ${rf.label}`,
                    dataType: rf.dataType,
                };
            }
            const pf = fields.find(f => f.apiName === fieldRef);
            if (!pf) return undefined;
            return {
                apiName: pf.apiName,
                label: pf.label,
                dataType: pf.dataType,
            };
        };

        const dimField = resolveFieldInfo(input.groupByField);
        if (!dimField) {
            return { success: false, error: `Unknown group-by field: ${input.groupByField}` };
        }

        const agg = input.aggregateFunction || 'COUNT';
        const targetMetricField =
            agg === 'COUNT' ? undefined : resolveFieldInfo(input.metricField);
        if (agg !== 'COUNT' && !targetMetricField) {
            return {
                success: false,
                error: `Select a numeric or formula field for ${agg} aggregation.`,
            };
        }

        const rawPrimaryRecords = await queryRecords(input.objectApiName, {}, 500, 0);
        const filteredPrimary = applyViewFilterRules(rawPrimaryRecords, input.filterRules || []);

        let records: Record<string, unknown>[] = filteredPrimary;
        let previewJoinedRows: Record<string, unknown>[] | undefined;

        if (input.joinConfig?.relatedObjectApiName) {
            const relatedRecords = await queryRecords(
                input.joinConfig.relatedObjectApiName,
                {},
                500,
                0,
            );
            const effectiveRelatedCols = Array.from(
                new Set([
                    ...(input.joinConfig.relatedColumns || []),
                    ...relatedFields.slice(0, 5).map(f => f.apiName),
                ]),
            );
            records = joinRecordsOnLookup({
                primaryRows: filteredPrimary,
                relatedRows: relatedRecords,
                joinConfig: {
                    ...input.joinConfig,
                    relatedColumns: effectiveRelatedCols,
                },
            });
            previewJoinedRows = records.slice(0, 20);
        }
        const groups = new Map<string, number[]>();

        for (const rec of records) {
            const bucketRaw = rec[dimField.apiName];
            const bucketKey =
                bucketRaw === null || bucketRaw === undefined || String(bucketRaw).trim() === ''
                    ? '(Unassigned)'
                    : String(bucketRaw);

            if (!groups.has(bucketKey)) {
                groups.set(bucketKey, []);
            }
            if (agg === 'COUNT') {
                groups.get(bucketKey)!.push(1);
            } else if (targetMetricField) {
                const num = Number(rec[targetMetricField.apiName]);
                if (Number.isFinite(num)) {
                    groups.get(bucketKey)!.push(num);
                }
            }
        }

        const dimLabel = dimField.label;
        const metricLabel =
            agg === 'COUNT'
                ? `Record Count (${objectDef.name})`
                : `${agg} of ${targetMetricField!.label}`;

        const columns: BiReportColumn[] = [
            { label: dimLabel, kind: 'dimension', format: 'text' },
            {
                label: metricLabel,
                kind: 'metric',
                format: targetMetricField?.dataType === 'CURRENCY' ? 'currency' : 'number',
            },
        ];

        const rows: BiReportRow[] = Array.from(groups.entries()).map(([bucket, vals]) => {
            let computed = 0;
            if (agg === 'COUNT') {
                computed = vals.length;
            } else if (vals.length > 0) {
                switch (agg) {
                    case 'SUM':
                        computed = Math.round(vals.reduce((a, b) => a + b, 0) * 100) / 100;
                        break;
                    case 'AVG':
                        computed =
                            Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) /
                            100;
                        break;
                    case 'MIN':
                        computed = Math.min(...vals);
                        break;
                    case 'MAX':
                        computed = Math.max(...vals);
                        break;
                }
            }
            return {
                [dimLabel]: bucket,
                [metricLabel]: computed,
            };
        });

        return {
            success: true,
            columns,
            rows,
            totalRecordsScanned: records.length,
            previewJoinedRows,
        };
    } catch (error) {
        return {
            success: false,
            error: describeError(error, 'Failed to run custom object report.'),
        };
    }
}


