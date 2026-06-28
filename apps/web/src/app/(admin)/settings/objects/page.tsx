import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { getAllMetadataObjects } from '@/lib/actions/metadata-engine';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function ObjectManagerListPage() {
    const session = await getSession();

    if (!session.isLoggedIn || session.role !== 'TENANT_ADMIN') {
        redirect('/login');
    }

    const objects = await getAllMetadataObjects();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                    Object Manager
                </h1>
                <p className="text-muted-foreground mt-1">
                    Configure your data models, add custom fields, and design layouts.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {objects.map(obj => (
                    <Link key={obj.id} href={`/settings/objects/${obj.id}`}>
                        <Card className="hover:border-blue-500 hover:shadow-md transition-all cursor-pointer h-full">
                            <CardContent className="p-6 flex flex-col h-full">
                                <div className="flex justify-between items-start mb-4">
                                    <h3 className="font-bold text-lg text-slate-900">{obj.name}</h3>
                                    {obj.is_custom ? (
                                        <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded">Custom</span>
                                    ) : (
                                        <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">Standard</span>
                                    )}
                                </div>
                                <p className="text-sm text-slate-500 flex-grow">
                                    {obj.description || 'No description provided.'}
                                </p>
                                <div className="mt-4 pt-4 border-t text-xs text-slate-400 font-mono">
                                    API Name: {obj.api_name}
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    );
}
