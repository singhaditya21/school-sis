import { notFound, redirect } from 'next/navigation';

import { getSession } from '@/lib/auth/session';

import { getLeadDocumentPack } from '../../actions';
import DocumentsChecklist from './documents-checklist';

export default async function AdmissionDocumentsPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const pack = await getLeadDocumentPack(id);
    if (!pack) notFound();

    return (
        <div className="max-w-5xl mx-auto">
            <DocumentsChecklist pack={pack} />
        </div>
    );
}
