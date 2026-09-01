import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { getAllMetadataObjects } from '@/lib/actions/metadata-engine';
import { Card, CardContent } from '@/components/ui/card';
import { Database } from 'lucide-react';
import Link from 'next/link';
import { getObjectFieldCounts, getObjectRecordCounts } from './actions';
import NewObjectDialog from './new-object-dialog';
import { METADATA_EAV_TABLE_NAME } from '@school-sis/api/src/metadata/runtime';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

type MetadataObjectRow = {
    id: string;
    name: string;
    api_name: string;
    table_name: string;
    description: string | null;
    is_custom: boolean | null;
    status: string;
};

export default async function ObjectManagerListPage() {
    const session = await getSession();

    if (!session.isLoggedIn || (session.role !== 'SUPER_ADMIN' && session.role !== 'PLATFORM_ADMIN')) {
        redirect('/login');
    }

    const objects = (await getAllMetadataObjects()) as MetadataObjectRow[];
    const fieldCounts = objects.length > 0 ? await getObjectFieldCounts() : { total: {}, custom: {} };
    const recordCounts = objects.length > 0 ? await getObjectRecordCounts() : {};
    const tenantDefinedCount = objects.filter(obj => obj.table_name === METADATA_EAV_TABLE_NAME).length;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground dark:text-white">
                        Object Manager
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Inspect the data models registered for this school, add custom fields, or
                        define a whole new object. A tenant-defined object needs no migration and
                        no page: it is served at <code className="font-mono">/app/&lt;api_name&gt;</code>
                        the moment it is published.
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                        {tenantDefinedCount === 0
                            ? 'No tenant-defined objects yet.'
                            : `${tenantDefinedCount} tenant-defined object${tenantDefinedCount === 1 ? '' : 's'}.`}
                    </p>
                </div>
                <NewObjectDialog />
            </div>

            {objects.length === 0 ? (
                <Card>
                    <CardContent className="py-16 text-center">
                        <Database className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                        <p className="font-medium text-foreground dark:text-slate-200">
                            No objects are registered for this school.
                        </p>
                        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                            The metadata registry is empty, so there is nothing to configure yet.
                            Objects appear here once the platform provisions the standard data
                            models for your tenant.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {objects.map(obj => {
                        const total = fieldCounts.total[obj.id] ?? 0;
                        const custom = fieldCounts.custom[obj.id] ?? 0;
                        const isTenantDefined = obj.table_name === METADATA_EAV_TABLE_NAME;
                        const records = recordCounts[obj.id] ?? 0;

                        return (
                            <Card key={obj.id} className="hover:border-blue-500 hover:shadow-md transition-all h-full">
                                <CardContent className="p-6 flex flex-col h-full">
                                    <div className="flex justify-between items-start mb-4 gap-3">
                                        <Link
                                            href={`/settings/objects/${obj.id}`}
                                            className="font-bold text-lg text-foreground dark:text-slate-100 hover:underline"
                                        >
                                            {obj.name}
                                        </Link>
                                        {isTenantDefined ? (
                                            <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded shrink-0">Tenant-defined</span>
                                        ) : obj.is_custom ? (
                                            <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded shrink-0">Custom</span>
                                        ) : (
                                            <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded shrink-0">Standard</span>
                                        )}
                                    </div>
                                    <p className="text-sm text-muted-foreground flex-grow">
                                        {obj.description || 'No description provided.'}
                                    </p>
                                    <div className="mt-4 pt-4 border-t space-y-1">
                                        <div className="text-xs text-muted-foreground font-mono">
                                            API Name: {obj.api_name}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {total === 1 ? '1 field' : `${total} fields`}
                                            {custom > 0 ? ` · ${custom} custom` : ''}
                                            {isTenantDefined ? ` · ${records === 1 ? '1 record' : `${records} records`}` : ''}
                                        </div>
                                        <div className="flex gap-3 pt-2 text-xs font-medium">
                                            <Link href={`/settings/objects/${obj.id}`} className="text-blue-600 hover:underline">
                                                Configure fields
                                            </Link>
                                            <Link href={`/app/${obj.api_name}`} className="text-blue-600 hover:underline">
                                                Open records
                                            </Link>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
