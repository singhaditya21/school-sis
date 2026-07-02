import {
    OPERATOR_CONSOLE_TILES,
    assertOperatorActionAllowed,
    buildOperatorConsoleSnapshot,
    filterOperatorTilesForContext,
    getOperatorConsoleTile,
    listActionsForDomain,
    listRunbooksForSignal,
    type OperatorSignal,
} from '../../../../packages/api/src/operations/operator-console';

const TENANT_ID = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';

describe('Admin operator console architecture', () => {
    it('defines console tiles for the full control-plane surface', () => {
        const domains = new Set(OPERATOR_CONSOLE_TILES.map((tile) => tile.domain));

        expect(domains).toEqual(new Set([
            'TENANTS',
            'JOBS',
            'NOTIFICATIONS',
            'PAYMENTS',
            'INTEGRATIONS',
            'APPROVALS',
            'INCIDENTS',
            'OBSERVABILITY',
            'SECURITY',
            'DATA_PLATFORM',
        ]));

        for (const tile of OPERATOR_CONSOLE_TILES) {
            expect(tile.sourceTables.length).toBeGreaterThan(0);
            expect(tile.requiredPermission).toContain(':');
            expect(tile.runbookCodes.length).toBeGreaterThan(0);
            expect(tile.actionTypes.length).toBeGreaterThan(0);
        }
    });

    it('projects platform metrics into critical operator signals and health score', () => {
        const snapshot = buildOperatorConsoleSnapshot({
            scope: 'PLATFORM',
            generatedAt: '2026-07-02T00:00:00.000Z',
            metrics: {
                database: { status: 'healthy', latencyMs: 20 },
                tenants: { total: 4, suspended: 1 },
                jobs: { deadLettered: 2, failed: 1 },
                payments: { unreconciledOrders: 1 },
                incidents: { critical: 1, open: 2 },
                observability: { sloBreaches: 1 },
            },
        });

        expect(snapshot.scope).toBe('PLATFORM');
        expect(snapshot.status).toBe('CRITICAL');
        expect(snapshot.healthScore).toBeLessThan(100);
        expect(snapshot.signals.map((signal) => signal.runbookCode)).toEqual(expect.arrayContaining([
            'jobs.dead-letter',
            'payments.reconciliation',
            'incidents.critical',
        ]));
        expect(snapshot.tiles.find((tile) => tile.id === 'tenant-health')).toBeDefined();
    });

    it('keeps tenant snapshots tenant-scoped and hides platform-only tenant health tile', () => {
        const snapshot = buildOperatorConsoleSnapshot({
            scope: 'TENANT',
            tenantId: TENANT_ID,
            metrics: {
                jobs: { failed: 1 },
                notifications: { queued: 3 },
                approvals: { overdue: 1 },
            },
        });

        expect(snapshot.tenantId).toBe(TENANT_ID);
        expect(snapshot.tiles.find((tile) => tile.id === 'tenant-health')).toBeUndefined();
        expect(snapshot.signals.every((signal) => signal.tenantId === TENANT_ID)).toBe(true);
        expect(snapshot.status).toBe('WARNING');
    });

    it('filters console tiles through existing fine-grained authorization', () => {
        const platformTiles = filterOperatorTilesForContext(
            { role: 'PLATFORM_ADMIN', userId: 'platform-user', tenantId: TENANT_ID },
            OPERATOR_CONSOLE_TILES,
            'PLATFORM',
        );
        const tenantTiles = filterOperatorTilesForContext(
            { role: 'SUPER_ADMIN', userId: 'tenant-user', tenantId: TENANT_ID },
            OPERATOR_CONSOLE_TILES,
            'TENANT',
        );
        const teacherTiles = filterOperatorTilesForContext(
            { role: 'TEACHER', userId: 'teacher-user', tenantId: TENANT_ID },
            OPERATOR_CONSOLE_TILES,
            'TENANT',
        );

        expect(platformTiles.map((tile) => tile.id)).toContain('tenant-health');
        expect(tenantTiles.map((tile) => tile.id)).toContain('payment-reconciliation');
        expect(tenantTiles.map((tile) => tile.id)).not.toContain('tenant-health');
        expect(teacherTiles).toHaveLength(0);
    });

    it('guards operator actions by scope, tenant ownership, and audit reason', () => {
        expect(assertOperatorActionAllowed({
            role: 'FINANCE_LEAD',
            userId: 'finance-user',
            tenantId: TENANT_ID,
        }, {
            type: 'RECONCILE_PAYMENT',
            targetTenantId: TENANT_ID,
            targetId: 'order_123',
            reason: 'Provider event and local order diverged.',
        })).toMatchObject({
            allowed: true,
            auditAction: 'operator.payment.reconcile',
            approvalPolicyId: 'payments.refund',
        });

        expect(() => assertOperatorActionAllowed({
            role: 'SUPER_ADMIN',
            userId: 'tenant-admin',
            tenantId: TENANT_ID,
        }, {
            type: 'SUSPEND_TENANT',
            reason: 'Contract breach.',
        })).toThrow();

        expect(() => assertOperatorActionAllowed({
            role: 'FINANCE_LEAD',
            userId: 'finance-user',
            tenantId: TENANT_ID,
        }, {
            type: 'RECONCILE_PAYMENT',
            targetTenantId: TENANT_ID,
        })).toThrow('requires an audit reason');
    });

    it('maps signals to runbooks and domain actions', () => {
        const signal: OperatorSignal = {
            id: 'payment-reconciliation:payments.reconciliation',
            domain: 'PAYMENTS',
            severity: 'CRITICAL',
            title: 'Payment reconciliation drift',
            summary: 'Payment orders need review.',
            count: 1,
            source: 'payment_orders',
            tileId: 'payment-reconciliation',
            runbookCode: 'payments.reconciliation',
            actionTypes: ['RECONCILE_PAYMENT'],
        };

        expect(getOperatorConsoleTile('payment-reconciliation')?.sourceTables).toContain('payment_orders');
        expect(listRunbooksForSignal(signal).map((runbook) => runbook.code)).toEqual(['payments.reconciliation']);
        expect(listActionsForDomain('PAYMENTS').map((action) => action.type)).toContain('RECONCILE_PAYMENT');
    });
});
