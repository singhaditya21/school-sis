import {
    BI_DATASETS,
    BI_DASHBOARDS,
    BI_EXPORT_POLICIES,
    BI_METRICS,
    assertBiExportAllowed,
    buildBiCatalogSnapshot,
    listDatasetDomains,
    validateBiQueryRequest,
} from '../../../../packages/api/src/analytics/bi';

const TENANT_ID = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';

describe('Reporting Analytics BI architecture', () => {
    it('defines governed datasets, metrics, dashboards, and export policies', () => {
        expect(listDatasetDomains()).toEqual(expect.arrayContaining([
            'ENROLLMENT',
            'ATTENDANCE',
            'ACADEMICS',
            'FEES',
            'ADMISSIONS',
            'COMMUNICATIONS',
            'OPERATIONS',
            'PLATFORM',
            'AI_ECONOMICS',
        ]));

        const metricIds = new Set(BI_METRICS.map((metric) => metric.id));
        for (const dataset of BI_DATASETS) {
            expect(dataset.sourceTables.length).toBeGreaterThan(0);
            expect(dataset.dimensions.length).toBeGreaterThan(0);
            expect(dataset.metricIds.every((metricId) => metricIds.has(metricId))).toBe(true);
            expect(dataset.requiredPermission).toContain(':');
            expect(dataset.classifications.length).toBeGreaterThan(0);
        }

        expect(BI_DASHBOARDS.length).toBeGreaterThanOrEqual(4);
        expect(BI_EXPORT_POLICIES.every((policy) => policy.maxRows > 0)).toBe(true);
    });

    it('builds tenant-scoped catalog snapshots for school administrators', () => {
        const snapshot = buildBiCatalogSnapshot({
            role: 'SCHOOL_ADMIN',
            userId: 'school-admin',
            tenantId: TENANT_ID,
        }, 'TENANT', TENANT_ID, '2026-07-02T00:00:00.000Z');

        expect(snapshot.scope).toBe('TENANT');
        expect(snapshot.tenantId).toBe(TENANT_ID);
        expect(snapshot.datasets.map((dataset) => dataset.id)).toEqual(expect.arrayContaining([
            'enrollment.students',
            'attendance.daily',
            'academics.results',
            'fees.ledger',
        ]));
        expect(snapshot.datasets.some((dataset) => dataset.scope === 'PLATFORM')).toBe(false);
        expect(snapshot.dashboards.map((dashboard) => dashboard.id)).toContain('school.executive_overview');
        expect(snapshot.governanceSignals.some((signal) => signal.includes('student PII'))).toBe(true);
    });

    it('keeps platform datasets behind platform scope', () => {
        const tenantSnapshot = buildBiCatalogSnapshot({
            role: 'SUPER_ADMIN',
            userId: 'tenant-admin',
            tenantId: TENANT_ID,
        }, 'TENANT', TENANT_ID);
        const platformSnapshot = buildBiCatalogSnapshot({
            role: 'PLATFORM_ADMIN',
            userId: 'platform-admin',
            tenantId: TENANT_ID,
        }, 'PLATFORM');

        expect(tenantSnapshot.datasets.map((dataset) => dataset.id)).not.toContain('platform.tenant_fleet');
        expect(platformSnapshot.datasets.map((dataset) => dataset.id)).toContain('platform.tenant_fleet');
        expect(platformSnapshot.dashboards.map((dashboard) => dashboard.id)).toContain('platform.portfolio');
    });

    it('validates BI query requests against the semantic model, not caller SQL', () => {
        const valid = validateBiQueryRequest({
            role: 'FINANCE_LEAD',
            userId: 'finance-user',
            tenantId: TENANT_ID,
        }, {
            scope: 'TENANT',
            tenantId: TENANT_ID,
            datasetId: 'fees.ledger',
            metricIds: ['collected_amount', 'outstanding_amount'],
            dimensionIds: ['due_month', 'invoice_status'],
            filters: [{ dimensionId: 'invoice_status', operator: 'in', value: ['PENDING', 'OVERDUE'] }],
            dateRange: { from: '2026-01-01', to: '2026-07-02' },
            limit: 500,
        });

        expect(valid.valid).toBe(true);
        expect(valid.normalizedLimit).toBe(500);

        const invalidMetric = validateBiQueryRequest({
            role: 'FINANCE_LEAD',
            userId: 'finance-user',
            tenantId: TENANT_ID,
        }, {
            scope: 'TENANT',
            tenantId: TENANT_ID,
            datasetId: 'fees.ledger',
            metricIds: ['drop table students'],
        });

        expect(invalidMetric.valid).toBe(false);
        expect(invalidMetric.deniedReason).toContain('Invalid metric selection');

        const invalidRange = validateBiQueryRequest({
            role: 'FINANCE_LEAD',
            userId: 'finance-user',
            tenantId: TENANT_ID,
        }, {
            scope: 'TENANT',
            tenantId: TENANT_ID,
            datasetId: 'fees.ledger',
            metricIds: ['collected_amount'],
            dateRange: { from: '2020-01-01', to: '2026-07-02' },
        });

        expect(invalidRange.valid).toBe(false);
        expect(invalidRange.deniedReason).toContain('date range exceeds');
    });

    it('requires audit reason and approval metadata for sensitive exports', () => {
        expect(() => assertBiExportAllowed({
            role: 'SUPER_ADMIN',
            userId: 'tenant-admin',
            tenantId: TENANT_ID,
        }, {
            exportPolicyId: 'exports.udise_plus',
            format: 'csv',
            scope: 'TENANT',
            tenantId: TENANT_ID,
            datasetId: 'enrollment.students',
            metricIds: ['active_students'],
        })).toThrow('requires an audit reason');

        const allowed = assertBiExportAllowed({
            role: 'SUPER_ADMIN',
            userId: 'tenant-admin',
            tenantId: TENANT_ID,
        }, {
            exportPolicyId: 'exports.udise_plus',
            format: 'csv',
            scope: 'TENANT',
            tenantId: TENANT_ID,
            datasetId: 'enrollment.students',
            metricIds: ['active_students'],
            dimensionIds: ['grade'],
            reason: 'Annual statutory UDISE+ submission.',
        });

        expect(allowed.valid).toBe(true);
        expect(allowed.approvalPolicyId).toBe('data.export_pii');
    });

    it('blocks tenant actors from platform BI exports', () => {
        expect(() => assertBiExportAllowed({
            role: 'SUPER_ADMIN',
            userId: 'tenant-admin',
            tenantId: TENANT_ID,
        }, {
            exportPolicyId: 'exports.platform_portfolio',
            format: 'csv',
            scope: 'PLATFORM',
            datasetId: 'platform.tenant_fleet',
            metricIds: ['active_tenants'],
            reason: 'Board review.',
        })).toThrow();
    });
});
