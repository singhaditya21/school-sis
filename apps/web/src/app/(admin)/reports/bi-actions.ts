'use server';

import { pool } from '@/lib/db';
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
