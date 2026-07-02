import type { AuthorizationContext, AuthorizationScope } from '../../authorization';

export type BiScope = 'TENANT' | 'PLATFORM';

export type BiDomain =
    | 'ENROLLMENT'
    | 'ADMISSIONS'
    | 'ATTENDANCE'
    | 'ACADEMICS'
    | 'FEES'
    | 'COMMUNICATIONS'
    | 'OPERATIONS'
    | 'COMPLIANCE'
    | 'PLATFORM'
    | 'AI_ECONOMICS';

export type BiDataClassification =
    | 'public'
    | 'operational'
    | 'student_pii'
    | 'staff_pii'
    | 'academic'
    | 'financial'
    | 'secret';

export type BiRefreshStrategy = 'LIVE_QUERY' | 'MATERIALIZED_VIEW' | 'SNAPSHOT' | 'WAREHOUSE';

export type BiGrain =
    | 'student'
    | 'attendance_day'
    | 'invoice'
    | 'payment'
    | 'exam_result'
    | 'admission_lead'
    | 'notification'
    | 'job'
    | 'tenant'
    | 'month';

export type BiAggregation = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'ratio' | 'distinct_count';

export type BiFormat = 'number' | 'currency' | 'percentage' | 'duration' | 'date';

export type BiExportFormat = 'csv' | 'xlsx' | 'json';

export interface BiDimension {
    id: string;
    label: string;
    sourceColumn: string;
    type: 'string' | 'date' | 'number' | 'boolean';
    classification: BiDataClassification;
    filterable: boolean;
}

export interface BiMetricDefinition {
    id: string;
    datasetId: string;
    domain: BiDomain;
    label: string;
    description: string;
    aggregation: BiAggregation;
    expressionId: string;
    format: BiFormat;
    classification: BiDataClassification;
    ownerRole: string;
}

export interface BiDatasetDefinition {
    id: string;
    domain: BiDomain;
    scope: BiScope;
    label: string;
    description: string;
    grain: BiGrain;
    sourceTables: readonly string[];
    tenantColumn?: string;
    defaultDateField?: string;
    refreshStrategy: BiRefreshStrategy;
    dimensions: readonly BiDimension[];
    metricIds: readonly string[];
    requiredPermission: string;
    requiredScope: AuthorizationScope;
    classifications: readonly BiDataClassification[];
    exportable: boolean;
}

export interface BiDashboardTile {
    id: string;
    title: string;
    datasetId: string;
    metricIds: readonly string[];
    dimensionIds: readonly string[];
    visualization: 'kpi' | 'line' | 'bar' | 'table' | 'heatmap' | 'funnel';
}

export interface BiDashboardDefinition {
    id: string;
    scope: BiScope;
    domain: BiDomain;
    title: string;
    description: string;
    route: string;
    personaRoles: readonly string[];
    requiredPermission: string;
    requiredScope: AuthorizationScope;
    defaultFilters: readonly string[];
    tiles: readonly BiDashboardTile[];
}

export interface BiExportPolicy {
    id: string;
    label: string;
    datasetIds: readonly string[];
    formats: readonly BiExportFormat[];
    requiredPermission: string;
    requiredScope: AuthorizationScope;
    classifications: readonly BiDataClassification[];
    approvalPolicyId?: string;
    requiresReason: boolean;
    maxRows: number;
}

export interface BiQueryFilter {
    dimensionId: string;
    operator: 'eq' | 'neq' | 'in' | 'gte' | 'lte' | 'between';
    value: unknown;
}

export interface BiDateRange {
    from: string;
    to: string;
}

export interface BiQueryRequest {
    datasetId: string;
    scope: BiScope;
    tenantId?: string;
    metricIds: readonly string[];
    dimensionIds?: readonly string[];
    filters?: readonly BiQueryFilter[];
    dateRange?: BiDateRange;
    limit?: number;
}

export interface BiQueryValidation {
    valid: boolean;
    dataset?: BiDatasetDefinition;
    deniedReason?: string;
    normalizedLimit: number;
    approvalPolicyId?: string;
}

export interface BiExportRequest extends BiQueryRequest {
    exportPolicyId: string;
    format: BiExportFormat;
    reason?: string;
}

export interface BiCatalogSnapshot {
    scope: BiScope;
    tenantId?: string;
    generatedAt: string;
    datasets: readonly BiDatasetDefinition[];
    metrics: readonly BiMetricDefinition[];
    dashboards: readonly BiDashboardDefinition[];
    exports: readonly BiExportPolicy[];
    coverage: {
        domains: readonly BiDomain[];
        datasetCount: number;
        metricCount: number;
        dashboardCount: number;
        exportCount: number;
    };
    governanceSignals: readonly string[];
}

export type BiAuthContext = Pick<AuthorizationContext, 'role' | 'tenantId' | 'userId'>;
