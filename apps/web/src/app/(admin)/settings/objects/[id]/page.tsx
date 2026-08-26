import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { getObjectMetadataById } from '@/lib/actions/metadata-engine';
import FieldManagerClient from './field-manager';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

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
    let loadError: string | null = null;

    try {
        metadata = await getObjectMetadataById(resolvedParams.id);
    } catch (e: unknown) {
        loadError = (e as Error).message || 'Unknown error';
    }

    if (!metadata) {
        return (
            <div className="p-8 text-center border rounded-lg border-red-200 bg-red-50 text-red-600">
                <h2 className="text-xl font-bold mb-2">Error Loading Object</h2>
                <p>{loadError}</p>
                <Link href="/settings/objects" className="mt-4 inline-flex items-center text-sm underline">
                    <ChevronLeft className="w-4 h-4 mr-1" /> Back to Objects
                </Link>
            </div>
        );
    }

    const { objectDef, fields } = metadata;

    return (
        <div className="space-y-6">
            <div>
                <Link href="/settings/objects" className="text-blue-600 hover:underline flex items-center text-sm mb-4">
                    <ChevronLeft className="w-4 h-4 mr-1" /> Back to Objects
                </Link>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white capitalize flex items-center gap-3">
                    {objectDef.name} Object
                    {objectDef.is_custom ? (
                        <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded uppercase tracking-wide">Custom</span>
                    ) : (
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded uppercase tracking-wide">Standard</span>
                    )}
                </h1>
                <p className="text-muted-foreground mt-1">
                    Review the registered fields for the {objectDef.name} entity and add custom
                    ones. Page layouts are not editable in this release.
                </p>
            </div>

            <FieldManagerClient objectId={resolvedParams.id} initialFields={fields} />
        </div>
    );
}
