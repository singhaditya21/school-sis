import { evaluateAccess } from '../../authorization';
import {
    OPERATOR_ACTIONS,
    OPERATOR_CONSOLE_TILES,
    OPERATOR_RUNBOOKS,
    getOperatorAction,
} from './catalog';
import type {
    BuildOperatorConsoleSnapshotInput,
    OperatorActionDecision,
    OperatorActionDefinition,
    OperatorActionRequest,
    OperatorAuthContext,
    OperatorConsoleDomain,
    OperatorConsoleMetrics,
    OperatorConsoleScope,
    OperatorConsoleSnapshot,
    OperatorConsoleTile,
    OperatorConsoleTileState,
    OperatorSeverity,
    OperatorSignal,
} from './types';

const SEVERITY_RANK: Record<OperatorSeverity, number> = {
    HEALTHY: 0,
    INFO: 1,
    WARNING: 2,
    CRITICAL: 3,
};

const DOMAIN_TO_TILE_ID: Record<OperatorConsoleDomain, string> = {
    TENANTS: 'tenant-health',
    JOBS: 'job-queue',
    NOTIFICATIONS: 'notification-outbox',
    PAYMENTS: 'payment-reconciliation',
    INTEGRATIONS: 'integration-delivery',
    APPROVALS: 'approval-queue',
    INCIDENTS: 'incident-command',
    OBSERVABILITY: 'slo-observability',
    SECURITY: 'security-posture',
    DATA_PLATFORM: 'data-platform',
};

export function combineOperatorSeverity(values: readonly OperatorSeverity[]): OperatorSeverity {
    return values.reduce<OperatorSeverity>((highest, candidate) => (
        SEVERITY_RANK[candidate] > SEVERITY_RANK[highest] ? candidate : highest
    ), 'HEALTHY');
}

export function normalizeOperatorSeverity(value: unknown): OperatorSeverity {
    if (value === 'CRITICAL' || value === 'unhealthy') return 'CRITICAL';
    if (value === 'WARNING' || value === 'ERROR' || value === 'degraded') return 'WARNING';
    if (value === 'INFO') return 'INFO';
    return 'HEALTHY';
}

export function classifyOperatorDomainSeverity(
    domain: OperatorConsoleDomain,
    metrics: OperatorConsoleMetrics = {},
): OperatorSeverity {
    switch (domain) {
        case 'TENANTS':
            return severityFromCounts(
                metrics.tenants?.provisioningFailed,
                metrics.tenants?.suspended,
                metrics.tenants?.contractsExpiring,
            );
        case 'JOBS':
            return severityFromCounts(
                metrics.jobs?.deadLettered,
                (metrics.jobs?.failed || 0) + (metrics.jobs?.staleLocked || 0),
                metrics.jobs?.queued,
            );
        case 'NOTIFICATIONS':
            return severityFromCounts(
                metrics.notifications?.deadLettered,
                metrics.notifications?.failed,
                metrics.notifications?.queued,
            );
        case 'PAYMENTS':
            return severityFromCounts(
                (metrics.payments?.unreconciledOrders || 0) + (metrics.payments?.failedProviderEvents || 0),
                metrics.payments?.pendingRefundApprovals,
                undefined,
            );
        case 'INTEGRATIONS':
            return severityFromCounts(
                undefined,
                (metrics.integrations?.failingConnections || 0) + (metrics.integrations?.webhookFailures || 0),
                metrics.integrations?.expiredApiKeys,
            );
        case 'APPROVALS':
            return severityFromCounts(undefined, (metrics.approvals?.overdue || 0) + (metrics.approvals?.escalated || 0), metrics.approvals?.pending);
        case 'INCIDENTS':
            return severityFromCounts(metrics.incidents?.critical, metrics.incidents?.open, metrics.incidents?.acknowledged);
        case 'OBSERVABILITY':
            return severityFromCounts(
                normalizeOperatorSeverity(metrics.database?.status) === 'CRITICAL' ? 1 : undefined,
                (metrics.observability?.sloBreaches || 0) + (metrics.observability?.errorEvents || 0),
                metrics.observability?.warningEvents,
            );
        case 'SECURITY':
            return severityFromCounts(metrics.security?.openFindings, metrics.security?.suspiciousEvents, metrics.security?.secretsDueRotation);
        case 'DATA_PLATFORM':
            return severityFromCounts(metrics.dataPlatform?.failedMigrations, metrics.dataPlatform?.migrationDrift, metrics.dataPlatform?.metadataDrafts);
        default:
            return 'HEALTHY';
    }
}

export function buildOperatorConsoleSnapshot(input: BuildOperatorConsoleSnapshotInput): OperatorConsoleSnapshot {
    const metrics = input.metrics ?? {};
    const scope = input.scope;
    const generatedAt = input.generatedAt instanceof Date
        ? input.generatedAt.toISOString()
        : input.generatedAt ?? new Date().toISOString();
    const allTiles: readonly OperatorConsoleTile[] = OPERATOR_CONSOLE_TILES;
    const visibleTiles = allTiles.filter((tile) => tile.availableScopes.includes(scope));
    const signals = buildOperatorSignals(metrics, scope, input.tenantId);
    const tiles = visibleTiles.map<OperatorConsoleTileState>((tile) => {
        const domainSignals = signals.filter((signal) => signal.domain === tile.domain);
        const severity = combineOperatorSeverity([
            classifyOperatorDomainSeverity(tile.domain, metrics),
            ...domainSignals.map((signal) => signal.severity),
        ]);

        return {
            ...tile,
            severity,
            signalCount: domainSignals.length,
        };
    });
    const status = combineOperatorSeverity(tiles.map((tile) => tile.severity));

    return {
        scope,
        tenantId: input.tenantId,
        status,
        healthScore: calculateOperatorHealthScore(tiles, signals),
        generatedAt,
        tiles,
        signals,
        metrics,
    };
}

export function calculateOperatorHealthScore(
    tiles: readonly Pick<OperatorConsoleTileState, 'severity'>[],
    signals: readonly Pick<OperatorSignal, 'severity'>[],
): number {
    const tilePenalty = tiles.reduce((total, tile) => total + penaltyFor(tile.severity), 0);
    const signalPenalty = signals.reduce((total, signal) => total + Math.ceil(penaltyFor(signal.severity) / 2), 0);
    return Math.max(0, Math.min(100, 100 - tilePenalty - signalPenalty));
}

export function filterOperatorTilesForContext<T extends OperatorConsoleTile>(
    context: OperatorAuthContext,
    tiles: readonly T[],
    scope: OperatorConsoleScope,
): readonly T[] {
    return tiles.filter((tile) => canViewOperatorTile(context, tile, scope));
}

export function canViewOperatorTile(
    context: OperatorAuthContext,
    tile: OperatorConsoleTile,
    scope: OperatorConsoleScope,
): boolean {
    if (!tile.availableScopes.includes(scope)) return false;
    if (!tile.ownerRoles.includes(context.role)) return false;

    const decision = evaluateAccess(
        { role: context.role, tenantId: context.tenantId, userId: context.userId },
        {
            permission: tile.requiredPermission,
            requiredScope: tile.requiredScope,
            operation: 'read',
            resourceTenantId: scope === 'TENANT' ? context.tenantId : undefined,
        },
    );

    return decision.allowed;
}

export function assertOperatorActionAllowed(
    context: OperatorAuthContext,
    request: OperatorActionRequest,
): OperatorActionDecision {
    const action = getOperatorAction(request.type);
    if (!action) {
        throw new Error(`Unknown operator action: ${request.type}`);
    }

    if (action.requiresReason && !request.reason?.trim()) {
        throw new Error(`Operator action ${action.type} requires an audit reason.`);
    }

    const resourceTenantId = action.targetScope === 'TENANT'
        ? request.targetTenantId ?? context.tenantId
        : undefined;

    if (action.targetScope === 'TENANT' && !resourceTenantId) {
        throw new Error(`Operator action ${action.type} requires a target tenant.`);
    }

    const decision = evaluateAccess(
        { role: context.role, tenantId: context.tenantId, userId: context.userId },
        {
            permission: action.requiredPermission,
            requiredScope: action.requiredScope,
            resourceTenantId,
            operation: action.requiredPermission.endsWith(':read') ? 'read' : 'update',
            approvalPolicyId: action.approvalPolicyId,
        },
    );

    if (!decision.allowed) {
        throw new Error(decision.reason ?? `Operator action ${action.type} is not allowed.`);
    }

    return {
        allowed: true,
        action,
        auditAction: action.auditAction,
        approvalPolicyId: action.approvalPolicyId,
    };
}

export function listRunbooksForSignal(signal: OperatorSignal) {
    return OPERATOR_RUNBOOKS.filter((runbook) => (
        runbook.domain === signal.domain
        && (!signal.runbookCode || runbook.code === signal.runbookCode)
        && SEVERITY_RANK[runbook.severity] <= SEVERITY_RANK[signal.severity]
    ));
}

export function listActionsForDomain(domain: OperatorConsoleDomain): readonly OperatorActionDefinition[] {
    return OPERATOR_ACTIONS.filter((action) => action.domain === domain);
}

function buildOperatorSignals(
    metrics: OperatorConsoleMetrics,
    scope: OperatorConsoleScope,
    tenantId?: string,
): OperatorSignal[] {
    const signals: OperatorSignal[] = [];
    const scopedTenantId = scope === 'TENANT' ? tenantId : undefined;

    addSignal(signals, {
        domain: 'TENANTS',
        severity: 'CRITICAL',
        title: 'Tenant provisioning failures',
        summary: 'One or more tenants failed provisioning and need platform intervention.',
        count: metrics.tenants?.provisioningFailed,
        source: 'tenants',
        runbookCode: 'tenant-health.degraded',
        actionTypes: ['OPEN_RUNBOOK'],
    });
    addSignal(signals, {
        domain: 'JOBS',
        severity: 'CRITICAL',
        title: 'Dead-lettered jobs',
        summary: 'Jobs reached terminal failure and require operator review before retry.',
        count: metrics.jobs?.deadLettered,
        source: 'background_jobs',
        runbookCode: 'jobs.dead-letter',
        actionTypes: ['RETRY_JOB', 'OPEN_RUNBOOK'],
        tenantId: scopedTenantId,
    });
    addSignal(signals, {
        domain: 'JOBS',
        severity: 'WARNING',
        title: 'Failed or stale jobs',
        summary: 'Job failures or stale locks are slowing background processing.',
        count: (metrics.jobs?.failed || 0) + (metrics.jobs?.staleLocked || 0),
        source: 'background_jobs',
        runbookCode: 'jobs.stale-locks',
        actionTypes: ['RETRY_JOB', 'OPEN_RUNBOOK'],
        tenantId: scopedTenantId,
    });
    addSignal(signals, {
        domain: 'NOTIFICATIONS',
        severity: 'CRITICAL',
        title: 'Dead-lettered notifications',
        summary: 'Failed communications reached the dead-letter queue.',
        count: metrics.notifications?.deadLettered,
        source: 'notification_outbox',
        runbookCode: 'notifications.dead-letter',
        actionTypes: ['REPLAY_NOTIFICATION', 'OPEN_RUNBOOK'],
        tenantId: scopedTenantId,
    });
    addSignal(signals, {
        domain: 'PAYMENTS',
        severity: 'CRITICAL',
        title: 'Payment reconciliation drift',
        summary: 'Payment orders or provider events are out of sync with local finance records.',
        count: (metrics.payments?.unreconciledOrders || 0) + (metrics.payments?.failedProviderEvents || 0),
        source: 'payment_orders',
        runbookCode: 'payments.reconciliation',
        actionTypes: ['RECONCILE_PAYMENT', 'OPEN_RUNBOOK'],
        tenantId: scopedTenantId,
    });
    addSignal(signals, {
        domain: 'INTEGRATIONS',
        severity: 'WARNING',
        title: 'Integration delivery failures',
        summary: 'Partner integrations or webhooks are failing and may need retry.',
        count: (metrics.integrations?.failingConnections || 0) + (metrics.integrations?.webhookFailures || 0),
        source: 'integration_audit_logs',
        runbookCode: 'integrations.delivery-failures',
        actionTypes: ['RETRY_WEBHOOK', 'OPEN_RUNBOOK'],
        tenantId: scopedTenantId,
    });
    addSignal(signals, {
        domain: 'APPROVALS',
        severity: 'WARNING',
        title: 'Overdue approvals',
        summary: 'Approval requests crossed their SLA and need escalation.',
        count: (metrics.approvals?.overdue || 0) + (metrics.approvals?.escalated || 0),
        source: 'workflow_approval_requests',
        runbookCode: 'approvals.sla-breach',
        actionTypes: ['REVIEW_APPROVAL', 'OPEN_RUNBOOK'],
        tenantId: scopedTenantId,
    });
    addSignal(signals, {
        domain: 'INCIDENTS',
        severity: 'CRITICAL',
        title: 'Critical incidents open',
        summary: 'Critical incidents require acknowledgement and owner assignment.',
        count: metrics.incidents?.critical,
        source: 'sre_incidents',
        runbookCode: 'incidents.critical',
        actionTypes: ['ACKNOWLEDGE_INCIDENT', 'OPEN_RUNBOOK'],
        tenantId: scopedTenantId,
    });
    addSignal(signals, {
        domain: 'OBSERVABILITY',
        severity: 'WARNING',
        title: 'SLO or telemetry breaches',
        summary: 'SLO breaches or high error volume indicate customer-facing reliability risk.',
        count: (metrics.observability?.sloBreaches || 0) + (metrics.observability?.errorEvents || 0),
        source: 'slo_measurements',
        runbookCode: 'observability.slo-breach',
        actionTypes: ['OPEN_RUNBOOK'],
        tenantId: scopedTenantId,
    });
    addSignal(signals, {
        domain: 'SECURITY',
        severity: 'WARNING',
        title: 'Security posture findings',
        summary: 'Security findings, suspicious events, or stale secrets need review.',
        count: (metrics.security?.openFindings || 0) + (metrics.security?.suspiciousEvents || 0) + (metrics.security?.secretsDueRotation || 0),
        source: 'audit_logs',
        runbookCode: 'security.secret-rotation',
        actionTypes: ['ROTATE_API_KEY', 'OPEN_RUNBOOK'],
        tenantId: scopedTenantId,
    });
    addSignal(signals, {
        domain: 'DATA_PLATFORM',
        severity: 'WARNING',
        title: 'Metadata migration drift',
        summary: 'Metadata drift or failed migrations can break tenant-specific dynamic objects.',
        count: (metrics.dataPlatform?.migrationDrift || 0) + (metrics.dataPlatform?.failedMigrations || 0),
        source: 'metadata_objects',
        runbookCode: 'metadata.migration-drift',
        actionTypes: ['OPEN_RUNBOOK'],
        tenantId: scopedTenantId,
    });

    return signals;
}

function addSignal(
    signals: OperatorSignal[],
    input: Omit<OperatorSignal, 'id' | 'tileId' | 'count'> & { count?: number },
): void {
    const count = toCount(input.count);
    if (count <= 0) return;

    const tileId = DOMAIN_TO_TILE_ID[input.domain];
    signals.push({
        ...input,
        id: `${tileId}:${input.runbookCode ?? input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        tileId,
        count,
    });
}

function toCount(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function severityFromCounts(critical?: number, warning?: number, info?: number): OperatorSeverity {
    if (toCount(critical) > 0) return 'CRITICAL';
    if (toCount(warning) > 0) return 'WARNING';
    if (toCount(info) > 0) return 'INFO';
    return 'HEALTHY';
}

function penaltyFor(severity: OperatorSeverity): number {
    switch (severity) {
        case 'CRITICAL':
            return 18;
        case 'WARNING':
            return 8;
        case 'INFO':
            return 2;
        default:
            return 0;
    }
}
