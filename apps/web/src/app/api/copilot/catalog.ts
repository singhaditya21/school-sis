/**
 * Grounding + validation layer for the admin copilot.
 *
 * The copilot's ONLY job is to map a natural-language request onto ids that already
 * exist in the governed BI catalog (packages/api/src/analytics/bi) for the caller's
 * role. It never answers questions, never returns figures, and never invents an id:
 * whatever the model proposes is re-checked here against the same catalog the
 * Reporting Engine uses, and anything unrecognised is dropped with a stated reason.
 *
 * Datasets are additionally restricted to those with a real execution plan
 * (apps/web/src/app/(admin)/reports/bi-query-plan.ts), so a draft the copilot hands
 * back is always a report a human can actually run on /reports.
 */
import { buildBiCatalogSnapshot, getBiMetric } from '@school-sis/api';
import type { AuthorizationRole } from '@school-sis/api';
import { getBiDatasetDateLabel, isExecutableBiDataset } from '@/app/(admin)/reports/bi-query-plan';

/** Roles allowed to use the copilot at all. Mirrors the API route's role gate. */
export const COPILOT_ROLES = [
    'PLATFORM_ADMIN',
    'SUPER_ADMIN',
    'SCHOOL_ADMIN',
    'PRINCIPAL',
    'ACCOUNTANT',
    'ADMISSION_COUNSELOR',
    'TEACHER',
] as const;

export function isCopilotRole(role: string): boolean {
    return (COPILOT_ROLES as readonly string[]).includes(role);
}

export interface CopilotDimension {
    id: string;
    label: string;
    filterable: boolean;
}

export interface CopilotMetric {
    id: string;
    label: string;
    description: string;
}

export interface CopilotDataset {
    id: string;
    label: string;
    description: string;
    domain: string;
    /** What the optional date range filters on, when the dataset supports one. */
    dateFilterLabel: string | null;
    metrics: CopilotMetric[];
    dimensions: CopilotDimension[];
}

export interface CopilotAuthContext {
    role: string;
    tenantId: string;
    userId: string;
}

/**
 * The datasets this role may query AND that the reporting engine can actually run.
 * Empty is a legitimate answer — it means the role has no BI entitlement.
 */
export function listCopilotDatasets(context: CopilotAuthContext): CopilotDataset[] {
    const snapshot = buildBiCatalogSnapshot(
        {
            role: context.role as AuthorizationRole,
            tenantId: context.tenantId,
            userId: context.userId,
        },
        'TENANT',
        context.tenantId,
    );

    return snapshot.datasets
        .filter((dataset) => isExecutableBiDataset(dataset.id))
        .map((dataset) => ({
            id: dataset.id,
            label: dataset.label,
            description: dataset.description,
            domain: dataset.domain,
            dateFilterLabel: getBiDatasetDateLabel(dataset.id),
            metrics: dataset.metricIds.flatMap((metricId) => {
                const metric = getBiMetric(metricId);
                return metric
                    ? [{ id: metric.id, label: metric.label, description: metric.description }]
                    : [];
            }),
            dimensions: dataset.dimensions.map((dimension) => ({
                id: dimension.id,
                label: dimension.label,
                filterable: dimension.filterable,
            })),
        }));
}

/** The catalog rendered for the model. Only ids that exist are ever shown to it. */
export function describeCatalogForModel(datasets: readonly CopilotDataset[]): string {
    return datasets
        .map((dataset) => {
            const metrics = dataset.metrics.map((metric) => `${metric.id} (${metric.label})`).join(', ');
            const dimensions = dataset.dimensions
                .map((dimension) => `${dimension.id} (${dimension.label}${dimension.filterable ? ', filterable' : ''})`)
                .join(', ');
            return [
                `dataset: ${dataset.id}`,
                `  label: ${dataset.label}`,
                `  covers: ${dataset.description}`,
                `  metricIds: ${metrics || 'none'}`,
                `  dimensionIds: ${dimensions || 'none'}`,
            ].join('\n');
        })
        .join('\n\n');
}

export interface CopilotDraftFilter {
    dimensionId: string;
    dimensionLabel: string;
    value: string;
}

export interface CopilotReportDraft {
    datasetId: string;
    datasetLabel: string;
    datasetDescription: string;
    dateFilterLabel: string | null;
    metrics: CopilotMetric[];
    dimensions: CopilotDimension[];
    filters: CopilotDraftFilter[];
    /** Ids the model asked for that do not exist in this role's catalog. */
    discardedMetricIds: string[];
    discardedDimensionIds: string[];
    discardedFilterDimensionIds: string[];
}

export interface CopilotProposal {
    datasetId: string;
    metricIds?: string[];
    dimensionIds?: string[];
    filters?: { dimensionId: string; value: string }[];
}

export type CopilotValidation =
    | { ok: true; draft: CopilotReportDraft }
    | { ok: false; reason: string };

/**
 * Re-check a model proposal against the caller's catalog. Nothing the model says is
 * trusted: unknown dataset => rejected outright, unknown metric/dimension => dropped
 * and reported, and a draft with no metric left is rejected because it cannot be run.
 */
export function validateProposal(
    datasets: readonly CopilotDataset[],
    proposal: CopilotProposal,
): CopilotValidation {
    const dataset = datasets.find((entry) => entry.id === proposal.datasetId);
    if (!dataset) {
        return {
            ok: false,
            reason: `"${proposal.datasetId}" is not a dataset your role can report on, so no draft was produced.`,
        };
    }

    const requestedMetricIds = dedupe(proposal.metricIds ?? []);
    const metrics = requestedMetricIds.flatMap((id) => dataset.metrics.filter((metric) => metric.id === id));
    const discardedMetricIds = requestedMetricIds.filter(
        (id) => !dataset.metrics.some((metric) => metric.id === id),
    );

    if (metrics.length === 0) {
        return {
            ok: false,
            reason: `No metric on "${dataset.label}" matched that request, so there is nothing to measure yet. Pick a metric on the Reporting Engine instead.`,
        };
    }

    const requestedDimensionIds = dedupe(proposal.dimensionIds ?? []);
    const dimensions = requestedDimensionIds.flatMap((id) =>
        dataset.dimensions.filter((dimension) => dimension.id === id),
    );
    const discardedDimensionIds = requestedDimensionIds.filter(
        (id) => !dataset.dimensions.some((dimension) => dimension.id === id),
    );

    const filters: CopilotDraftFilter[] = [];
    const discardedFilterDimensionIds: string[] = [];
    for (const filter of proposal.filters ?? []) {
        const dimension = dataset.dimensions.find((entry) => entry.id === filter.dimensionId);
        const value = filter.value.trim();
        if (!dimension || !dimension.filterable || value === '') {
            discardedFilterDimensionIds.push(filter.dimensionId);
            continue;
        }
        filters.push({ dimensionId: dimension.id, dimensionLabel: dimension.label, value });
    }

    return {
        ok: true,
        draft: {
            datasetId: dataset.id,
            datasetLabel: dataset.label,
            datasetDescription: dataset.description,
            dateFilterLabel: dataset.dateFilterLabel,
            metrics,
            dimensions,
            filters,
            discardedMetricIds,
            discardedDimensionIds,
            discardedFilterDimensionIds: dedupe(discardedFilterDimensionIds),
        },
    };
}

/**
 * A sentence built entirely from catalog labels and the validated draft — no model
 * prose is ever surfaced, so the copilot cannot state a figure it did not compute.
 */
export function summariseDraft(draft: CopilotReportDraft): string {
    const metrics = joinLabels(draft.metrics.map((metric) => metric.label));
    const dimensions = joinLabels(draft.dimensions.map((dimension) => dimension.label));
    const grouped = dimensions ? ` broken down by ${dimensions}` : '';
    const filtered = draft.filters.length
        ? `, filtered to ${draft.filters.map((filter) => `${filter.dimensionLabel} = ${filter.value}`).join(' and ')}`
        : '';
    return `Run "${draft.datasetLabel}" for ${metrics}${grouped}${filtered}.`;
}

function joinLabels(labels: readonly string[]): string {
    if (labels.length === 0) return '';
    if (labels.length === 1) return labels[0];
    return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

function dedupe(values: readonly string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
