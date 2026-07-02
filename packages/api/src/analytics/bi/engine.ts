import { evaluateAccess } from '../../authorization';
import {
    BI_DASHBOARDS,
    BI_DATASETS,
    BI_EXPORT_POLICIES,
    BI_METRICS,
    getBiDataset,
    getBiExportPolicy,
} from './catalog';
import type {
    BiAuthContext,
    BiCatalogSnapshot,
    BiDashboardDefinition,
    BiDatasetDefinition,
    BiDomain,
    BiExportPolicy,
    BiExportRequest,
    BiMetricDefinition,
    BiQueryRequest,
    BiQueryValidation,
    BiScope,
} from './types';

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 50000;
const MAX_DATE_RANGE_DAYS = 1096;

export function buildBiCatalogSnapshot(
    context: BiAuthContext,
    scope: BiScope,
    tenantId?: string,
    generatedAt: Date | string = new Date(),
): BiCatalogSnapshot {
    const datasets = filterBiDatasetsForContext(context, BI_DATASETS, scope, tenantId);
    const datasetIds = new Set(datasets.map((dataset) => dataset.id));
    const metrics = BI_METRICS.filter((metric) => datasetIds.has(metric.datasetId));
    const dashboards = filterBiDashboardsForContext(context, BI_DASHBOARDS, scope, tenantId)
        .filter((dashboard) => dashboard.tiles.every((tile) => datasetIds.has(tile.datasetId)));
    const exports = filterBiExportsForContext(context, BI_EXPORT_POLICIES, scope, tenantId)
        .filter((policy) => policy.datasetIds.some((datasetId) => datasetIds.has(datasetId)));
    const domains = unique(datasets.map((dataset) => dataset.domain));

    return {
        scope,
        tenantId: scope === 'TENANT' ? tenantId : undefined,
        generatedAt: generatedAt instanceof Date ? generatedAt.toISOString() : generatedAt,
        datasets,
        metrics,
        dashboards,
        exports,
        coverage: {
            domains,
            datasetCount: datasets.length,
            metricCount: metrics.length,
            dashboardCount: dashboards.length,
            exportCount: exports.length,
        },
        governanceSignals: buildGovernanceSignals(datasets, exports),
    };
}

export function filterBiDatasetsForContext(
    context: BiAuthContext,
    datasets: readonly BiDatasetDefinition[],
    scope: BiScope,
    tenantId?: string,
): readonly BiDatasetDefinition[] {
    return datasets.filter((dataset) => canAccessBiAsset(context, dataset, scope, tenantId));
}

export function filterBiDashboardsForContext(
    context: BiAuthContext,
    dashboards: readonly BiDashboardDefinition[],
    scope: BiScope,
    tenantId?: string,
): readonly BiDashboardDefinition[] {
    return dashboards.filter((dashboard) => {
        if (!dashboard.personaRoles.includes(context.role)) return false;
        return canAccessBiAsset(context, dashboard, scope, tenantId);
    });
}

export function filterBiExportsForContext(
    context: BiAuthContext,
    exports: readonly BiExportPolicy[],
    scope: BiScope,
    tenantId?: string,
): readonly BiExportPolicy[] {
    return exports.filter((policy) => canAccessBiAsset(context, policy, scope, tenantId));
}

export function canAccessBiAsset(
    context: BiAuthContext,
    asset: Pick<BiDatasetDefinition | BiDashboardDefinition | BiExportPolicy, 'requiredPermission' | 'requiredScope'> & { scope?: BiScope },
    scope: BiScope,
    tenantId?: string,
): boolean {
    if (asset.scope && asset.scope !== scope) return false;

    const decision = evaluateAccess(
        { role: context.role, tenantId: context.tenantId, userId: context.userId },
        {
            permission: asset.requiredPermission,
            requiredScope: asset.requiredScope,
            operation: asset.requiredPermission.endsWith(':export') ? 'export' : 'read',
            resourceTenantId: scope === 'TENANT' ? tenantId ?? context.tenantId : undefined,
        },
    );

    return decision.allowed;
}

export function validateBiQueryRequest(
    context: BiAuthContext,
    request: BiQueryRequest,
): BiQueryValidation {
    const dataset = getBiDataset(request.datasetId);
    const normalizedLimit = normalizeLimit(request.limit);
    if (!dataset) {
        return { valid: false, deniedReason: `Unknown BI dataset: ${request.datasetId}`, normalizedLimit };
    }

    if (!canAccessBiAsset(context, dataset, request.scope, request.tenantId)) {
        return { valid: false, dataset, deniedReason: 'Actor is not allowed to access this BI dataset.', normalizedLimit };
    }

    if (dataset.scope !== request.scope) {
        return { valid: false, dataset, deniedReason: 'Dataset scope does not match request scope.', normalizedLimit };
    }

    if (request.scope === 'TENANT' && !request.tenantId && !context.tenantId) {
        return { valid: false, dataset, deniedReason: 'Tenant-scoped BI queries require a tenant context.', normalizedLimit };
    }

    const allowedMetrics = new Set(dataset.metricIds);
    const invalidMetrics = request.metricIds.filter((metricId) => !allowedMetrics.has(metricId));
    if (request.metricIds.length === 0 || invalidMetrics.length > 0) {
        return { valid: false, dataset, deniedReason: `Invalid metric selection: ${invalidMetrics.join(', ') || 'none selected'}`, normalizedLimit };
    }

    const allowedDimensions = new Set(dataset.dimensions.map((dimension) => dimension.id));
    const invalidDimensions = (request.dimensionIds ?? []).filter((dimensionId) => !allowedDimensions.has(dimensionId));
    if (invalidDimensions.length > 0) {
        return { valid: false, dataset, deniedReason: `Invalid dimensions: ${invalidDimensions.join(', ')}`, normalizedLimit };
    }

    const invalidFilters = (request.filters ?? [])
        .filter((filter) => !dataset.dimensions.some((dimension) => dimension.id === filter.dimensionId && dimension.filterable));
    if (invalidFilters.length > 0) {
        return { valid: false, dataset, deniedReason: `Invalid filters: ${invalidFilters.map((filter) => filter.dimensionId).join(', ')}`, normalizedLimit };
    }

    if (request.dateRange) {
        const rangeDays = daysBetween(request.dateRange.from, request.dateRange.to);
        if (!Number.isFinite(rangeDays) || rangeDays < 0) {
            return { valid: false, dataset, deniedReason: 'Invalid BI date range.', normalizedLimit };
        }
        if (rangeDays > MAX_DATE_RANGE_DAYS) {
            return { valid: false, dataset, deniedReason: `BI date range exceeds ${MAX_DATE_RANGE_DAYS} days.`, normalizedLimit };
        }
    }

    return { valid: true, dataset, normalizedLimit };
}

export function assertBiExportAllowed(
    context: BiAuthContext,
    request: BiExportRequest,
): BiQueryValidation {
    const policy = getBiExportPolicy(request.exportPolicyId);
    if (!policy) {
        throw new Error(`Unknown BI export policy: ${request.exportPolicyId}`);
    }

    if (!policy.datasetIds.includes(request.datasetId)) {
        throw new Error(`Export policy ${policy.id} does not allow dataset ${request.datasetId}.`);
    }

    if (!policy.formats.includes(request.format)) {
        throw new Error(`Export policy ${policy.id} does not allow ${request.format}.`);
    }

    if (policy.requiresReason && !request.reason?.trim()) {
        throw new Error(`Export policy ${policy.id} requires an audit reason.`);
    }

    if (!canAccessBiAsset(context, policy, request.scope, request.tenantId)) {
        throw new Error(`Actor is not allowed to use export policy ${policy.id}.`);
    }

    const validation = validateBiQueryRequest(context, {
        ...request,
        limit: Math.min(request.limit ?? policy.maxRows, policy.maxRows),
    });
    if (!validation.valid) {
        throw new Error(validation.deniedReason ?? 'Invalid BI export request.');
    }

    return {
        ...validation,
        approvalPolicyId: policy.approvalPolicyId,
    };
}

export function listMetricsForDataset(datasetId: string): readonly BiMetricDefinition[] {
    return BI_METRICS.filter((metric) => metric.datasetId === datasetId);
}

export function listDatasetDomains(datasets: readonly BiDatasetDefinition[] = BI_DATASETS): readonly BiDomain[] {
    return unique(datasets.map((dataset) => dataset.domain));
}

function buildGovernanceSignals(
    datasets: readonly BiDatasetDefinition[],
    exports: readonly BiExportPolicy[],
): readonly string[] {
    const signals: string[] = [];
    const piiDatasets = datasets.filter((dataset) => dataset.classifications.includes('student_pii'));
    const financialDatasets = datasets.filter((dataset) => dataset.classifications.includes('financial'));
    const unapprovedSensitiveExports = exports.filter((policy) => {
        const sensitive = policy.classifications.includes('student_pii') || policy.classifications.includes('financial');
        return sensitive && !policy.approvalPolicyId;
    });

    if (piiDatasets.length > 0) {
        signals.push(`${piiDatasets.length} datasets contain student PII and require tenant-scoped access.`);
    }
    if (financialDatasets.length > 0) {
        signals.push(`${financialDatasets.length} datasets contain financial metrics and require audit-aware exports.`);
    }
    if (unapprovedSensitiveExports.length === 0) {
        signals.push('Sensitive export policies require approval or an audit reason.');
    }

    return signals;
}

function normalizeLimit(limit: number | undefined): number {
    if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
    return Math.max(1, Math.min(Math.floor(limit!), MAX_LIMIT));
}

function daysBetween(from: string, to: string): number {
    const fromTime = Date.parse(from);
    const toTime = Date.parse(to);
    if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) return Number.NaN;
    return Math.floor((toTime - fromTime) / 86_400_000);
}

function unique<T extends string>(values: readonly T[]): readonly T[] {
    return Array.from(new Set(values));
}
