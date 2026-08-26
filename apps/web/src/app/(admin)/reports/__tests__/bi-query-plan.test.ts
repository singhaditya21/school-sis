import { BI_DATASETS, getBiDataset, validateBiQueryRequest } from '@school-sis/api';
import {
    BiCompileError,
    compileBiQuery,
    getBiDatasetDateLabel,
    isExecutableBiDataset,
    UNSUPPORTED_BI_DATASETS,
} from '../bi-query-plan';

const TENANT_ID = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
const CONTEXT = { role: 'SUPER_ADMIN', tenantId: TENANT_ID, userId: 'super-admin' };

function compileEverything(datasetId: string) {
    const dataset = getBiDataset(datasetId)!;
    return compileBiQuery({
        dataset,
        tenantId: TENANT_ID,
        metricIds: [...dataset.metricIds],
        dimensionIds: dataset.dimensions.map((dimension) => dimension.id),
        filters: [],
        limit: 100,
    });
}

describe('BI execution plans', () => {
    it('accounts for every catalog dataset, either as runnable or with a stated reason', () => {
        for (const dataset of BI_DATASETS) {
            if (isExecutableBiDataset(dataset.id)) continue;
            expect(UNSUPPORTED_BI_DATASETS[dataset.id]).toBeTruthy();
        }
        // Guard against a stale exclusion outliving the dataset it describes.
        for (const datasetId of Object.keys(UNSUPPORTED_BI_DATASETS)) {
            expect(BI_DATASETS.some((dataset) => dataset.id === datasetId)).toBe(true);
            expect(isExecutableBiDataset(datasetId)).toBe(false);
        }
    });

    it('can compile every metric and dimension of every runnable dataset', () => {
        for (const dataset of BI_DATASETS) {
            if (!isExecutableBiDataset(dataset.id)) continue;

            const compiled = compileEverything(dataset.id);
            expect(compiled.columns).toHaveLength(dataset.dimensions.length + dataset.metricIds.length);
            expect(compiled.sql).toContain('$1');
            expect(compiled.params[0]).toBe(TENANT_ID);
            expect(getBiDatasetDateLabel(dataset.id)).toBeTruthy();
        }
    });

    it('scopes every runnable dataset to the tenant', () => {
        for (const dataset of BI_DATASETS) {
            if (!isExecutableBiDataset(dataset.id)) continue;
            const compiled = compileEverything(dataset.id);
            expect(compiled.sql).toMatch(/WHERE [^]*tenant_id = \$1/);
        }
    });

    it('binds filter values as parameters instead of inlining them', () => {
        const dataset = getBiDataset('enrollment.students')!;
        const compiled = compileBiQuery({
            dataset,
            tenantId: TENANT_ID,
            metricIds: ['active_students'],
            dimensionIds: ['grade'],
            filters: [{ dimensionId: 'grade', operator: 'eq', value: "Grade 1'; DROP TABLE students; --" }],
            limit: 25,
        });

        expect(compiled.sql).not.toContain('DROP TABLE');
        expect(compiled.params).toContain("Grade 1'; DROP TABLE students; --");
    });

    it('refuses a metric that the dataset does not own', () => {
        const dataset = getBiDataset('enrollment.students')!;
        expect(() =>
            compileBiQuery({
                dataset,
                tenantId: TENANT_ID,
                metricIds: ['collection_rate'],
                dimensionIds: [],
                filters: [],
                limit: 25,
            }),
        ).toThrow(BiCompileError);
    });

    it('refuses platform datasets that have no execution plan', () => {
        const dataset = getBiDataset('platform.tenant_fleet')!;
        expect(() =>
            compileBiQuery({
                dataset,
                tenantId: TENANT_ID,
                metricIds: ['active_tenants'],
                dimensionIds: [],
                filters: [],
                limit: 25,
            }),
        ).toThrow(BiCompileError);
    });

    it('only compiles requests the catalog validator already accepted', () => {
        const validation = validateBiQueryRequest(CONTEXT, {
            datasetId: 'fees.ledger',
            scope: 'TENANT',
            tenantId: TENANT_ID,
            metricIds: ['collection_rate'],
            dimensionIds: ['due_month'],
            filters: [{ dimensionId: 'invoice_status', operator: 'in', value: ['PENDING', 'OVERDUE'] }],
            dateRange: { from: '2025-04-01', to: '2026-03-31' },
            limit: 500,
        });

        expect(validation.valid).toBe(true);

        const compiled = compileBiQuery({
            dataset: validation.dataset!,
            tenantId: TENANT_ID,
            metricIds: ['collection_rate'],
            dimensionIds: ['due_month'],
            filters: [{ dimensionId: 'invoice_status', operator: 'in', value: ['PENDING', 'OVERDUE'] }],
            dateRange: { from: '2025-04-01', to: '2026-03-31' },
            limit: validation.normalizedLimit,
        });

        expect(compiled.sql).toContain('GROUP BY');
        expect(compiled.sql).toContain('= ANY(');
        expect(compiled.params).toEqual([
            TENANT_ID,
            '2025-04-01',
            '2026-03-31',
            ['PENDING', 'OVERDUE'],
            500,
        ]);
    });
});
