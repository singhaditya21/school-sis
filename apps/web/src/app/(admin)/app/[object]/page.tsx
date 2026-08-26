import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { queryRecords, getObjectMetadata } from '@/lib/actions/metadata-engine';
import GenericListClient from './generic-list';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function GenericObjectListPage({ params }: { params: Promise<{ object: string }> }) {
    const resolvedParams = await params;
    const session = await getSession();

    if (!session.isLoggedIn) {
        redirect('/login');
    }

    try {
        const { objectDef, fields, layouts, storageMode, hiddenFieldCount } =
            await getObjectMetadata(resolvedParams.object);

        // Find the LIST layout if it exists
        const listLayout = layouts.find(l => l.layoutType === 'LIST');

        // Field-level permissions are enforced server side; if the role can read
        // nothing there is no table to draw, so say so rather than render an
        // empty grid that looks like missing data.
        if (fields.length === 0) {
            return (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-8 text-center text-amber-800">
                    <h2 className="mb-2 text-xl font-bold">No readable fields</h2>
                    <p>Your role has no read access to any field on {objectDef.name}.</p>
                </div>
            );
        }

        const records = await queryRecords(resolvedParams.object, {}, 50, 0);

        return (
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white capitalize">
                            {objectDef.name}s
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            Manage {objectDef.name.toLowerCase()} records in your organization.
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {storageMode === 'EAV'
                                ? 'Tenant-defined object — this screen is generated from metadata, not from a page route.'
                                : 'Standard object — metadata projection over a built-in table.'}
                            {hiddenFieldCount > 0
                                ? ` ${hiddenFieldCount} field${hiddenFieldCount === 1 ? '' : 's'} hidden by field permissions.`
                                : ''}
                        </p>
                    </div>
                </div>

                <GenericListClient 
                    objectName={resolvedParams.object}
                    fields={fields} 
                    records={records} 
                    layout={listLayout?.schema}
                />
            </div>
        );
    } catch (e: unknown) {
        return (
            <div className="p-8 text-center border rounded-lg border-red-200 bg-red-50 text-red-600">
                <h2 className="text-xl font-bold mb-2">Error Loading Object</h2>
                <p>{(e as Error).message}</p>
            </div>
        );
    }
}
