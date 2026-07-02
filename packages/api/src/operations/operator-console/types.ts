import type { AuthorizationContext, AuthorizationScope } from '../../authorization';

export type OperatorConsoleScope = 'PLATFORM' | 'TENANT';

export type OperatorConsoleDomain =
    | 'TENANTS'
    | 'JOBS'
    | 'NOTIFICATIONS'
    | 'PAYMENTS'
    | 'INTEGRATIONS'
    | 'APPROVALS'
    | 'INCIDENTS'
    | 'OBSERVABILITY'
    | 'SECURITY'
    | 'DATA_PLATFORM';

export type OperatorSeverity = 'HEALTHY' | 'INFO' | 'WARNING' | 'CRITICAL';

export type OperatorActionType =
    | 'ACKNOWLEDGE_INCIDENT'
    | 'RESOLVE_INCIDENT'
    | 'RETRY_JOB'
    | 'REPLAY_NOTIFICATION'
    | 'RETRY_WEBHOOK'
    | 'RECONCILE_PAYMENT'
    | 'REVIEW_APPROVAL'
    | 'ROTATE_API_KEY'
    | 'SUSPEND_TENANT'
    | 'OPEN_RUNBOOK';

export type OperatorDataFreshness = 'REAL_TIME' | 'NEAR_REAL_TIME' | 'BATCH';

export interface OperatorConsoleTile {
    id: string;
    domain: OperatorConsoleDomain;
    label: string;
    description: string;
    availableScopes: readonly OperatorConsoleScope[];
    requiredPermission: string;
    requiredScope: AuthorizationScope;
    dataFreshness: OperatorDataFreshness;
    sourceTables: readonly string[];
    drilldownRoute: string;
    runbookCodes: readonly string[];
    actionTypes: readonly OperatorActionType[];
    ownerRoles: readonly string[];
}

export interface OperatorActionDefinition {
    type: OperatorActionType;
    domain: OperatorConsoleDomain;
    label: string;
    description: string;
    requiredPermission: string;
    requiredScope: AuthorizationScope;
    targetScope: OperatorConsoleScope;
    auditAction: string;
    requiresReason: boolean;
    approvalPolicyId?: string;
}

export interface OperatorRunbook {
    code: string;
    domain: OperatorConsoleDomain;
    title: string;
    severity: OperatorSeverity;
    ownerRole: string;
    summary: string;
    steps: readonly string[];
    escalation: string;
}

export interface OperatorSignal {
    id: string;
    domain: OperatorConsoleDomain;
    severity: OperatorSeverity;
    title: string;
    summary: string;
    count: number;
    source: string;
    tileId: string;
    tenantId?: string;
    runbookCode?: string;
    actionTypes: readonly OperatorActionType[];
    metadata?: Record<string, unknown>;
}

export interface OperatorConsoleTileState extends OperatorConsoleTile {
    severity: OperatorSeverity;
    signalCount: number;
}

export interface OperatorConsoleSnapshot {
    scope: OperatorConsoleScope;
    tenantId?: string;
    status: OperatorSeverity;
    healthScore: number;
    generatedAt: string;
    tiles: readonly OperatorConsoleTileState[];
    signals: readonly OperatorSignal[];
    metrics: OperatorConsoleMetrics;
}

export interface OperatorConsoleMetrics {
    database?: {
        status?: 'healthy' | 'degraded' | 'unhealthy' | OperatorSeverity;
        latencyMs?: number | null;
    };
    tenants?: {
        total?: number;
        suspended?: number;
        provisioningFailed?: number;
        contractsExpiring?: number;
    };
    jobs?: {
        queued?: number;
        failed?: number;
        deadLettered?: number;
        staleLocked?: number;
    };
    notifications?: {
        queued?: number;
        failed?: number;
        deadLettered?: number;
    };
    payments?: {
        unreconciledOrders?: number;
        failedProviderEvents?: number;
        pendingRefundApprovals?: number;
    };
    integrations?: {
        failingConnections?: number;
        webhookFailures?: number;
        expiredApiKeys?: number;
    };
    approvals?: {
        pending?: number;
        overdue?: number;
        escalated?: number;
    };
    incidents?: {
        open?: number;
        critical?: number;
        acknowledged?: number;
    };
    observability?: {
        sloBreaches?: number;
        errorEvents?: number;
        warningEvents?: number;
    };
    security?: {
        suspiciousEvents?: number;
        secretsDueRotation?: number;
        openFindings?: number;
    };
    dataPlatform?: {
        migrationDrift?: number;
        metadataDrafts?: number;
        failedMigrations?: number;
    };
}

export interface BuildOperatorConsoleSnapshotInput {
    scope: OperatorConsoleScope;
    tenantId?: string;
    generatedAt?: Date | string;
    metrics?: OperatorConsoleMetrics;
}

export interface OperatorActionRequest {
    type: OperatorActionType;
    targetId?: string;
    targetTenantId?: string;
    reason?: string;
}

export interface OperatorActionDecision {
    allowed: boolean;
    action: OperatorActionDefinition;
    reason?: string;
    auditAction: string;
    approvalPolicyId?: string;
}

export type OperatorAuthContext = Pick<AuthorizationContext, 'role' | 'tenantId' | 'userId'>;
