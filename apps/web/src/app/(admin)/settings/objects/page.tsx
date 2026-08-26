import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { getAllMetadataObjects } from '@/lib/actions/metadata-engine';
import { Card, CardContent } from '@/components/ui/card';
import { Database } from 'lucide-react';
import Link from 'next/link';
import { getObjectFieldCounts } from './actions';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

type MetadataObjectRow = {
    id: string;
    name: string;
    api_name: string;
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

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                    Object Manager
                </h1>
                <p className="text-muted-foreground mt-1">
                    Inspect the data models registered for this school and add custom fields to
                    them.
                </p>
            </div>

            {objects.length === 0 ? (
                <Card>
                    <CardContent className="py-16 text-center">
                        <Database className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                        <p className="font-medium text-slate-700 dark:text-slate-200">
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

                        return (
                            <Link key={obj.id} href={`/settings/objects/${obj.id}`}>
                                <Card className="hover:border-blue-500 hover:shadow-md transition-all cursor-pointer h-full">
                                    <CardContent className="p-6 flex flex-col h-full">
                                        <div className="flex justify-between items-start mb-4 gap-3">
                                            <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">
                                                {obj.name}
                                            </h3>
                                            {obj.is_custom ? (
                                                <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded shrink-0">Custom</span>
                                            ) : (
                                                <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded shrink-0">Standard</span>
                                            )}
                                        </div>
                                        <p className="text-sm text-slate-500 flex-grow">
                                            {obj.description || 'No description provided.'}
                                        </p>
                                        <div className="mt-4 pt-4 border-t space-y-1">
                                            <div className="text-xs text-slate-400 font-mono">
                                                API Name: {obj.api_name}
                                            </div>
                                            <div className="text-xs text-slate-500">
                                                {total === 1 ? '1 field' : `${total} fields`}
                                                {custom > 0 ? ` · ${custom} custom` : ''}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
