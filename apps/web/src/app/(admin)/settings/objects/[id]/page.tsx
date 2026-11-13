import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import { requireAuth } from '@/lib/auth/middleware';
import { getAllMetadataObjects, getObjectMetadataById } from '@/lib/actions/metadata-engine';
import { listTenantRolesWithPermissions } from '@/lib/actions/lcnc-platform';
import { getObjectGovernanceConfigAction } from '@/lib/actions/lcnc-tier2';
import { listInstalledMetadataPackagesAction } from '@/lib/actions/lcnc-tier3';
import FieldManagerClient from './field-manager';
import ObjectLayoutBuilderClient from './layout-builder';
import ObjectGovernanceStudioClient from './object-governance-studio';
import ExperiencePortalPublisherClient from './portal-publisher';
import DocumentTemplateStudioClient from './document-template-studio';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

type ObjectMetadata = Awaited<ReturnType<typeof getObjectMetadataById>>;

export default async function ObjectDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = await params;
    let auth;
    try {
        auth = await requireAuth('metadata:read');
    } catch {
        redirect('/unauthorized');
    }

    let metadata: ObjectMetadata | null = null;
    let availableObjects: { api_name: string; name: string }[] = [];
    let customRoles: { code: string; name: string }[] = [];
    let loadError: string | null = null;

    try {
        const [loadedMeta, allObjs, rolesRes] = await Promise.all([
            getObjectMetadataById(resolvedParams.id),
            getAllMetadataObjects(),
            listTenantRolesWithPermissions().catch(() => ({ success: false, roles: [] })),
        ]);
        metadata = loadedMeta;
        availableObjects = allObjs.map(o => ({
            api_name: String(o.api_name),
            name: String(o.name),
        }));
        customRoles = rolesRes.roles
            .filter(r => r.isActive)
            .map(r => ({ code: r.code, name: r.name }));
    } catch (e: unknown) {
        loadError = (e as Error).message || 'Unknown error';
    }

    if (!metadata) {
        return (
            <div className="p-8 text-center border rounded-lg border-destructive/30 bg-destructive-subtle text-destructive">
                <h2 className="text-xl font-bold mb-2">Error Loading Object</h2>
                <p>{loadError}</p>
                <Link href="/settings/objects" className="mt-4 inline-flex items-center text-sm underline">
                    <ChevronLeft className="w-4 h-4 mr-1" /> Back to Objects
                </Link>
            </div>
        );
    }

    const { objectDef, fields, layouts } = metadata;
    const [governanceConfig, pkgInfo] = await Promise.all([
        getObjectGovernanceConfigAction(String(objectDef.api_name)).catch(() => ({
            owdMode: 'PUBLIC_READ_WRITE' as const,
            sharingRules: [],
            validationRules: [],
            approvalProcesses: [],
        })),
        listInstalledMetadataPackagesAction().catch(() => ({
            success: false,
            tenantCode: null,
            packages: [],
        })),
    ]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                    <Link href="/settings/objects" className="text-primary hover:underline flex items-center text-sm mb-4">
                        <ChevronLeft className="w-4 h-4 mr-1" /> Back to Object Manager
                    </Link>
                    <h1 className="text-2xl font-bold text-foreground capitalize flex items-center gap-3">
                        {objectDef.name} Object
                        {objectDef.is_custom ? (
                            <span className="px-2 py-1 bg-success-subtle text-success text-xs font-medium rounded uppercase tracking-wide">
                                Custom (EAV)
                            </span>
                        ) : (
                            <span className="px-2 py-1 bg-accent text-primary text-xs font-medium rounded uppercase tracking-wide">
                                System Object
                            </span>
                        )}
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        Configure custom fields, lookups, formulas, role-based Field-Level Security
                        (FLS), named role-scoped Forms, List layouts, and the Object Home Page KPI
                        workspace for {objectDef.name}.
                    </p>
                </div>
                <Link
                    href={`/app/${objectDef.api_name}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                    Open Object Home <ExternalLink className="w-4 h-4 text-primary" />
                </Link>
            </div>

            <FieldManagerClient
                objectId={resolvedParams.id}
                initialFields={fields}
                availableObjects={availableObjects}
                customRoles={customRoles}
            />

            <ObjectLayoutBuilderClient
                objectId={resolvedParams.id}
                objectName={objectDef.name}
                fields={fields}
                initialLayouts={layouts ?? []}
                customRoles={customRoles}
            />

            <ObjectGovernanceStudioClient
                objectName={objectDef.name}
                objectApiName={String(objectDef.api_name)}
                fields={fields}
                customRoles={customRoles}
                initialOwdMode={governanceConfig.owdMode}
                initialSharingRules={governanceConfig.sharingRules}
                initialValidationRules={governanceConfig.validationRules}
                initialApprovalProcesses={governanceConfig.approvalProcesses}
            />

            <DocumentTemplateStudioClient
                objectId={resolvedParams.id}
                objectName={objectDef.name}
                fields={fields}
                initialLayouts={layouts ?? []}
            />

            <ExperiencePortalPublisherClient
                objectId={resolvedParams.id}
                objectName={objectDef.name}
                objectApiName={String(objectDef.api_name)}
                tenantId={String(objectDef.tenant_id || auth.tenantId || '')}
                tenantCode={pkgInfo.tenantCode}
                fields={fields}
                initialLayouts={layouts ?? []}
            />
        </div>
    );
}
