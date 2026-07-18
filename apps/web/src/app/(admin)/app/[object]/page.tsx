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
        const { objectDef, fields, layouts } = await getObjectMetadata(resolvedParams.object);
        const records = await queryRecords(resolvedParams.object, {}, 50, 0);

        // Find the LIST layout if it exists
        const listLayout = layouts.find(l => l.layoutType === 'LIST');

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
