import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth/middleware';
import {
    evaluateEffectivePermission,
    resolveEffectiveUserRoleContext,
} from '@/lib/rbac/custom-roles';
import { listTenantObjectCatalog } from '@/lib/actions/lcnc-platform';
import NewObjectDialog from './new-object-dialog';
import { BlueprintInstaller } from './blueprint-installer';
import { SchemaPackageStudio } from './schema-package-studio';
import { ObjectCatalogClient } from './object-catalog-client';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function ObjectManagerListPage() {
    let auth;
    try {
        auth = await requireAuth('metadata:read');
    } catch {
        redirect('/unauthorized');
    }

    const [roleCtx, catalogRes] = await Promise.all([
        resolveEffectiveUserRoleContext(auth.userId, auth.tenantId, auth.session.role),
        listTenantObjectCatalog(),
    ]);

    const canPublish = evaluateEffectivePermission(roleCtx, 'metadata:publish');
    const objects = catalogRes.objects;
    const systemCount = objects.filter(o => !o.isCustom).length;
    const customCount = objects.filter(o => o.isCustom).length;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">
                        Object Manager
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        Enable or customize built-in System Objects for your school, or create
                        brand-new Custom Objects with dedicated Home Pages, Role-Scoped Forms,
                        Categorized Views, and Custom Reports—with zero code or migrations.
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                        {systemCount} System Objects · {customCount} Custom / Blueprint Objects
                    </p>
                </div>
                {canPublish && <NewObjectDialog />}
            </div>

            {canPublish && (
                <>
                    <BlueprintInstaller existingObjectApiNames={objects.map(o => o.apiName)} />
                    <SchemaPackageStudio
                        customObjects={objects
                            .filter(o => o.isCustom)
                            .map(o => ({ apiName: o.apiName, name: o.name }))}
                    />
                </>
            )}

            <ObjectCatalogClient initialObjects={objects} canPublish={canPublish} />
        </div>
    );
}
