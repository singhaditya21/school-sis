import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { getObjectMetadata, queryRecords } from '@/lib/actions/metadata-engine';
import GenericFormClient from './generic-form';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function GenericObjectFormPage({ params }: { params: { object: string, id: string } }) {
    const session = await getSession();

    if (!session.isLoggedIn) {
        redirect('/login');
    }

    try {
        const { objectDef, fields, layouts } = await getObjectMetadata(params.object);
        
        let initialData = {};
        if (params.id !== 'new') {
            const records = await queryRecords(params.object, { id: params.id }, 1, 0);
            if (records.length > 0) {
                initialData = records[0];
            } else {
                throw new Error("Record not found");
            }
        }

        // Find the FORM layout if it exists
        const formLayout = layouts.find(l => l.layoutType === 'FORM');

        return (
            <div className="space-y-6 max-w-4xl mx-auto">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white capitalize">
                            {params.id === 'new' ? `New ${objectDef.name}` : `Edit ${objectDef.name}`}
                        </h1>
                    </div>
                </div>

                <GenericFormClient 
                    objectName={params.object}
                    recordId={params.id === 'new' ? undefined : params.id}
                    fields={fields}
                    initialData={initialData}
                    layout={formLayout?.schema}
                />
            </div>
        );
    } catch (e: any) {
        return (
            <div className="p-8 text-center border rounded-lg border-red-200 bg-red-50 text-red-600">
                <h2 className="text-xl font-bold mb-2">Error Loading Form</h2>
                <p>{e.message}</p>
            </div>
        );
    }
}
