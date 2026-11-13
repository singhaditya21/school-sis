import { requireAuth } from '@/lib/auth/middleware';
import { hasPermission, UserRole } from '@/lib/rbac/permissions';
import {
    listBiExportPolicies,
    buildBiCatalogSnapshot,
    getBiMetric,
} from '@school-sis/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { listReportCategoriesAndObjectReportsAction } from '@/lib/actions/lcnc-platform';
import ReportBuilder from './report-builder';
import { CustomObjectReportBuilder } from './custom-object-report-builder';
import { getCustomObjectReportCatalog, getSavedBiReports } from './bi-actions';
import { getBiDatasetDateLabel, isExecutableBiDataset, UNSUPPORTED_BI_DATASETS } from './bi-query-plan';
import type { ReportDatasetOption, ReportWorkspace } from './bi-types';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Custom Reports & BI Studio | ScholarMind',
    description: 'Categorized custom object reports and governed BI report builder',
};

export default async function ReportsPage() {
    const [{ tenantId, userId, session }, savedReports, customCatalog, lcncReportData] =
        await Promise.all([
            requireAuth('reports:read'),
            getSavedBiReports().catch(() => []),
            getCustomObjectReportCatalog().catch(() => []),
            listReportCategoriesAndObjectReportsAction().catch(() => ({
                categories: [],
                reports: [],
            })),
        ]);

    const snapshot = buildBiCatalogSnapshot(
        { role: session.role, tenantId, userId },
        'TENANT',
        tenantId,
    );

    const datasets: ReportDatasetOption[] = snapshot.datasets.map(dataset => {
        const executable = isExecutableBiDataset(dataset.id);
        const policy = dataset.exportable
            ? listBiExportPolicies().find(
                  entry =>
                      entry.datasetIds.includes(dataset.id) &&
                      snapshot.exports.some(visible => visible.id === entry.id),
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
            metrics: dataset.metricIds.flatMap(metricId => {
                const metric = getBiMetric(metricId);
                return metric
                    ? [
                          {
                              id: metric.id,
                              label: metric.label,
                              description: metric.description,
                              format: metric.format,
                          },
                      ]
                    : [];
            }),
            dimensions: dataset.dimensions.map(dimension => ({
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
        dashboards: snapshot.dashboards.map(dashboard => ({
            id: dashboard.id,
            title: dashboard.title,
            description: dashboard.description,
            route: dashboard.route,
        })),
    };

    const canManageCategories =
        hasPermission(session.role as UserRole, 'settings:write') ||
        session.role === 'SCHOOL_ADMIN' ||
        session.role === 'SUPER_ADMIN' ||
        session.role === 'PLATFORM_ADMIN';

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground">
                    Custom Reports &amp; BI Studio
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Organize reports into tenant Report Categories, build custom reports across all 19 System Objects and Custom EAV Objects, and run governed BI ledger datasets.
                </p>
            </div>

            <CustomObjectReportBuilder
                catalog={customCatalog}
                initialCategories={lcncReportData.categories}
                initialSavedReports={lcncReportData.reports}
                canManageCategories={canManageCategories}
            />

            {workspace.datasets.length === 0 ? (
                <Card>
                    <CardHeader>
                        <CardTitle>No standard BI datasets available for your role</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        The BI catalog did not grant your role access to any standard dataset. Ask a
                        Tenant Admin for the relevant read permission (for example{' '}
                        <code>fees:read</code> or <code>attendance:read</code>), or run object reports above.
                    </CardContent>
                </Card>
            ) : (
                <ReportBuilder workspace={workspace} initialSavedReports={savedReports} />
            )}
        </div>
    );
}
