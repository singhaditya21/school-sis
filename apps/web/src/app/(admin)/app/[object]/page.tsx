import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { queryRecords, getObjectMetadata } from '@/lib/actions/metadata-engine';
import {
    listObjectViewsAndCategoriesAction,
    listReportCategoriesAndObjectReportsAction,
} from '@/lib/actions/lcnc-platform';
import {
    evaluateEffectivePermission,
    resolveEffectiveUserRoleContext,
} from '@/lib/rbac/custom-roles';
import {
    listPermittedLayoutsForRole,
    resolveLayoutForRole,
    type HomeLayoutSchema,
} from '@/lib/metadata/lcnc-helpers';
import { Badge } from '@/components/ui/badge';
import GenericListClient from './generic-list';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function GenericObjectListPage({
    params,
}: {
    params: Promise<{ object: string }>;
}) {
    const resolvedParams = await params;
    const session = await getSession();

    if (!session.isLoggedIn) {
        redirect('/login');
    }

    try {
        const [
            { objectDef, fields, layouts, storageMode, hiddenFieldCount },
            roleCtx,
            viewsPayload,
            reportsPayload,
        ] = await Promise.all([
            getObjectMetadata(resolvedParams.object),
            resolveEffectiveUserRoleContext(
                session.userId,
                session.tenantId,
                session.role,
            ),
            listObjectViewsAndCategoriesAction(resolvedParams.object),
            listReportCategoriesAndObjectReportsAction(resolvedParams.object),
        ]);

        const listLayout = resolveLayoutForRole(
            layouts,
            'LIST',
            roleCtx.effectiveRoleCode,
            session.role,
        );
        const homeLayout = resolveLayoutForRole(
            layouts,
            'HOME',
            roleCtx.effectiveRoleCode,
            session.role,
        );
        const activeFormLayout = resolveLayoutForRole(
            layouts,
            'FORM',
            roleCtx.effectiveRoleCode,
            session.role,
        );
        const permittedForms = listPermittedLayoutsForRole(
            layouts,
            'FORM',
            roleCtx.effectiveRoleCode,
            session.role,
        ).map(l => ({
            id: l.id,
            name: l.name || 'Default Form',
            isDefault: Boolean(l.isDefault),
        }));

        const homeSchema = (homeLayout?.schema || undefined) as HomeLayoutSchema | undefined;

        if (fields.length === 0) {
            return (
                <div className="rounded-lg border border-warning/30 bg-warning-subtle p-8 text-center text-warning">
                    <h2 className="mb-2 text-xl font-bold">No readable fields</h2>
                    <p>Your role has no read access to any field on {objectDef.name}.</p>
                </div>
            );
        }

        const records = await queryRecords(resolvedParams.object, {}, 200, 0);

        const canCustomizeObject = evaluateEffectivePermission(roleCtx, 'metadata:publish');
        const canManageCategories =
            evaluateEffectivePermission(roleCtx, 'settings:write') || canCustomizeObject;

        return (
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div>
                        <div className="flex flex-wrap items-center gap-2.5">
                            <h1 className="text-2xl font-bold text-foreground capitalize">
                                {homeSchema?.welcomeHeadline || `${objectDef.name} Home`}
                            </h1>
                            <Badge variant="outline" className="text-xs">
                                {storageMode === 'EAV' ? 'Custom Object (EAV)' : 'System Object'}
                            </Badge>
                            {activeFormLayout?.name && (
                                <Badge variant="outline" className="text-xs font-mono">
                                    Form: {activeFormLayout.name}
                                </Badge>
                            )}
                        </div>
                        <p className="text-muted-foreground mt-1 text-sm">
                            {homeSchema?.welcomeSubtitle ||
                                `Dedicated Object Home Page — KPIs, categorized views, custom reports, and role-scoped forms for ${objectDef.name.toLowerCase()}.`}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {storageMode === 'EAV'
                                ? 'Tenant-defined object — dynamically rendered from metadata.'
                                : 'System object — metadata projection + custom_data JSONB extension over physical table.'}
                            {hiddenFieldCount > 0
                                ? ` ${hiddenFieldCount} field${hiddenFieldCount === 1 ? '' : 's'} hidden by role FLS.`
                                : ''}
                        </p>
                    </div>
                </div>

                <GenericListClient
                    objectId={objectDef.id}
                    objectLabel={objectDef.name}
                    objectName={resolvedParams.object}
                    fields={fields}
                    records={records}
                    layout={listLayout?.schema as { columns?: string[] } | undefined}
                    homeSchema={homeSchema}
                    initialViewCategories={viewsPayload.categories}
                    initialSavedViews={viewsPayload.views}
                    initialReportCategories={reportsPayload.categories}
                    initialObjectReports={reportsPayload.reports}
                    permittedForms={permittedForms}
                    canCustomizeObject={canCustomizeObject}
                    canManageCategories={canManageCategories}
                />
            </div>
        );
    } catch (e: unknown) {
        return (
            <div className="p-8 text-center border rounded-lg border-destructive/30 bg-destructive-subtle text-destructive">
                <h2 className="text-xl font-bold mb-2">Error Loading Object Home</h2>
                <p>{(e as Error).message}</p>
            </div>
        );
    }
}
