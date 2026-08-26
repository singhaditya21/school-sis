import { requireAuth } from '@/lib/auth/middleware';
import {
    listBiExportPolicies,
    buildBiCatalogSnapshot,
    getBiMetric,
} from '@school-sis/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ReportBuilder from './report-builder';
import { getBiDatasetDateLabel, isExecutableBiDataset, UNSUPPORTED_BI_DATASETS } from './bi-query-plan';
import type { ReportDatasetOption, ReportWorkspace } from './bi-types';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Reporting Engine | School SIS',
    description: 'Governed report builder over the School SIS BI catalog',
};

export default async function ReportsPage() {
    const { tenantId, userId, session } = await requireAuth('reports:read');

    const snapshot = buildBiCatalogSnapshot(
        { role: session.role, tenantId, userId },
        'TENANT',
        tenantId,
    );

    const datasets: ReportDatasetOption[] = snapshot.datasets.map((dataset) => {
        const executable = isExecutableBiDataset(dataset.id);
        const policy = dataset.exportable
            ? listBiExportPolicies().find(
                (entry) =>
                    entry.datasetIds.includes(dataset.id) &&
                    snapshot.exports.some((visible) => visible.id === entry.id),
            ) ?? null
            : null;

        return {
            id: dataset.id,
            label: dataset.label,
            description: dataset.description,
            domain: dataset.domain,
            dateFilterLabel: getBiDatasetDateLabel(dataset.id),
            executable,
            unavailableReason: executable
                ? null
                : UNSUPPORTED_BI_DATASETS[dataset.id] ??
                'This dataset has no execution plan in this release.',
            metrics: dataset.metricIds.flatMap((metricId) => {
                const metric = getBiMetric(metricId);
                return metric
                    ? [{ id: metric.id, label: metric.label, description: metric.description, format: metric.format }]
                    : [];
            }),
            dimensions: dataset.dimensions.map((dimension) => ({
                id: dimension.id,
                label: dimension.label,
                filterable: dimension.filterable,
                type: dimension.type,
            })),
            exportPolicy: policy
                ? {
                    id: policy.id,
                    label: policy.label,
                    maxRows: policy.maxRows,
                    requiresReason: policy.requiresReason,
                    requiresApproval: Boolean(policy.approvalPolicyId),
                }
                : null,
        };
    });

    const workspace: ReportWorkspace = {
        generatedAt: snapshot.generatedAt,
        datasets,
        governanceSignals: [...snapshot.governanceSignals],
        dashboards: snapshot.dashboards.map((dashboard) => ({
            id: dashboard.id,
            title: dashboard.title,
            description: dashboard.description,
            route: dashboard.route,
        })),
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Reporting Engine</h1>
                <p className="text-sm text-gray-500 mt-1">
                    Build reports over the governed BI catalog. Datasets, metrics and dimensions come from the
                    catalog your role is entitled to — no free-form SQL is accepted from this screen.
                </p>
            </div>

            {workspace.datasets.length === 0 ? (
                <Card>
                    <CardHeader>
                        <CardTitle>No datasets available for your role</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-gray-600">
                        The BI catalog did not grant your role access to any tenant-scoped dataset. Ask an
                        administrator for the relevant read permission (for example <code>fees:read</code> or{' '}
                        <code>attendance:read</code>).
                    </CardContent>
                </Card>
            ) : (
                <ReportBuilder workspace={workspace} />
            )}
        </div>
    );
}
