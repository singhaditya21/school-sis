import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { getAllMetadataObjects, getObjectMetadataById } from '@/lib/actions/metadata-engine';
import FieldManagerClient from './field-manager';
import ObjectLayoutBuilderClient from './layout-builder';
import ExperiencePortalPublisherClient from './portal-publisher';
import DocumentTemplateStudioClient from './document-template-studio';
import Link from 'next/link';
import { ChevronLeft, ExternalLink } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

type ObjectMetadata = Awaited<ReturnType<typeof getObjectMetadataById>>;

export default async function ObjectDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = await params;
    const session = await getSession();

    if (!session.isLoggedIn || (session.role !== 'SUPER_ADMIN' && session.role !== 'PLATFORM_ADMIN')) {
        redirect('/login');
    }

    let metadata: ObjectMetadata | null = null;
    let availableObjects: { api_name: string; name: string }[] = [];
    let loadError: string | null = null;

    try {
        const [loadedMeta, allObjs] = await Promise.all([
            getObjectMetadataById(resolvedParams.id),
            getAllMetadataObjects(),
        ]);
        metadata = loadedMeta;
        availableObjects = allObjs.map(o => ({
            api_name: String(o.api_name),
            name: String(o.name),
        }));
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

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                    <Link href="/settings/objects" className="text-primary hover:underline flex items-center text-sm mb-4">
                        <ChevronLeft className="w-4 h-4 mr-1" /> Back to Objects
                    </Link>
                    <h1 className="text-2xl font-bold text-foreground capitalize flex items-center gap-3">
                        {objectDef.name} Object
                        {objectDef.is_custom ? (
                            <span className="px-2 py-1 bg-info-subtle text-info text-xs font-medium rounded uppercase tracking-wide">Custom</span>
                        ) : (
                            <span className="px-2 py-1 bg-accent text-primary text-xs font-medium rounded uppercase tracking-wide">Standard</span>
                        )}
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Manage custom fields, relational lookups, calculated formulas, role-based Field-Level Security (FLS), and drag-and-drop layouts for {objectDef.name}.
                    </p>
                </div>
                <Link
                    href={`/app/${objectDef.api_name}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                    Open Runtime App <ExternalLink className="w-4 h-4 text-primary" />
                </Link>
            </div>

            <FieldManagerClient
                objectId={resolvedParams.id}
                initialFields={fields}
                availableObjects={availableObjects}
            />

            <ObjectLayoutBuilderClient
                objectId={resolvedParams.id}
                objectName={objectDef.name}
                fields={fields}
                initialLayouts={layouts ?? []}
            />

            <DocumentTemplateStudioClient
                objectId={resolvedParams.id}
                objectName={objectDef.name}
                fields={fields}
                initialLayouts={layouts ?? []}
            />

            {objectDef.is_custom && (
                <ExperiencePortalPublisherClient
                    objectId={resolvedParams.id}
                    objectName={objectDef.name}
                    objectApiName={String(objectDef.api_name)}
                    tenantId={String(objectDef.tenant_id || session.tenantId || '')}
                    fields={fields}
                    initialLayouts={layouts ?? []}
                />
            )}
        </div>
    );
}
