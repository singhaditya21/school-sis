'use server';

import { pool, sql } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
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

        const { rows } = await pool.query(prepared.compiled.sql, prepared.compiled.params);
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

        const { rows } = await pool.query(prepared.compiled.sql, prepared.compiled.params);
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
    const escape = (value: string | number | null): string => {
        if (value === null) return '';
        const text = String(value);
        return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    return [
        columns.map((column) => escape(column)).join(','),
        ...rows.map((row) => columns.map((column) => escape(row[column] ?? null)).join(',')),
    ].join('\n');
}

function describeError(error: unknown, fallback: string): string {
    if (error instanceof BiCompileError) return error.message;
    if (error instanceof Error) {
        // Permission failures from requireAuth are safe and useful to surface verbatim.
        if (error.message.startsWith('Forbidden:')) return error.message;
        console.error('[BI report]', error.message);
    }
    return fallback;
}

export interface SavedBiReportDefinition {
    id: string;
    name: string;
    datasetId: string;
    metricIds: string[];
    dimensionIds: string[];
    scheduleFrequency: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
    recipientEmail?: string;
    createdAt: string;
}

export async function saveCustomReportDefinition(input: {
    name: string;
    datasetId: string;
    metricIds: string[];
    dimensionIds: string[];
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

        const scheduleFrequency = input.scheduleFrequency || 'NONE';
        const recipientEmail = String(input.recipientEmail || session.email || 'admin@scholarmind.local').trim();

        const reportPayload = {
            name: trimmedName,
            datasetId: input.datasetId,
            metricIds: input.metricIds,
            dimensionIds: input.dimensionIds || [],
            scheduleFrequency,
            recipientEmail,
            savedBy: userId,
            savedAt: new Date().toISOString(),
        };

        const inserted = await sql<{ id: string; created_at: Date | string }>`
            INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, after_state)
            VALUES (
                ${tenantId},
                ${userId},
                'BI_REPORT_SAVED',
                'bi_report',
                ${JSON.stringify(reportPayload)}::jsonb
            )
            RETURNING id, created_at
        `;

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
                    'QUEUED',
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
    } catch (error) {
        return {
            success: false,
            error: describeError(error, 'Failed to save custom report definition.'),
        };
    }
}

export async function getSavedBiReports(): Promise<SavedBiReportDefinition[]> {
    try {
        const { tenantId } = await requireAuth('reports:read');
        const rows = await sql<{
            id: string;
            after_state: Record<string, unknown> | null;
            created_at: Date | string;
        }>`
            SELECT id, after_state, created_at
            FROM audit_logs
            WHERE tenant_id = ${tenantId}
              AND action = 'BI_REPORT_SAVED'
            ORDER BY created_at DESC
            LIMIT 20
        `;

        return rows.map(row => {
            const state = (row.after_state && typeof row.after_state === 'object'
                ? row.after_state
                : {}) as Record<string, unknown>;
            const freq = String(state.scheduleFrequency || 'NONE').toUpperCase();
            return {
                id: row.id,
                name: String(state.name || 'Saved Report'),
                datasetId: String(state.datasetId || ''),
                metricIds: Array.isArray(state.metricIds) ? state.metricIds.map(String) : [],
                dimensionIds: Array.isArray(state.dimensionIds) ? state.dimensionIds.map(String) : [],
                scheduleFrequency: (['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'].includes(freq)
                    ? freq
                    : 'NONE') as 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY',
                recipientEmail: state.recipientEmail ? String(state.recipientEmail) : undefined,
                createdAt:
                    row.created_at instanceof Date
                        ? row.created_at.toISOString()
                        : String(row.created_at),
            };
        });
    } catch {
        return [];
    }
}

