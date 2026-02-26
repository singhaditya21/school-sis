import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import Link from 'next/link';
import { getAdmissionLeadDetail } from '@/lib/actions/queries';

export default async function AdmissionDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const lead = await getAdmissionLeadDetail(id);
    if (!lead) return <div className="p-8 text-center text-gray-500">Lead not found.</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Documents</h1>
                    <p className="text-gray-600">{lead.childFirstName} {lead.childLastName}</p>
                </div>
                <Link href={`/admissions/${id}`} className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6">
                <p className="text-gray-500">Document upload functionality will be available after file storage is configured (Step 7).</p>
                <div className="mt-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <p className="text-sm text-yellow-800">📎 Required documents: Birth Certificate, Address Proof, Previous School TC, Passport Photos, Aadhaar Card</p>
                </div>
            </div>
        </div>
    );
}
