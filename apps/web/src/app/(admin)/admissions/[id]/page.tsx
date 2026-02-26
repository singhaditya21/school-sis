import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';
import { getAdmissionLeadDetail } from '@/lib/actions/queries';

export default async function AdmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const lead = await getAdmissionLeadDetail(id);

    if (!lead) {
        return <div className="p-8 text-center text-gray-500">Lead not found.</div>;
    }

    const stageColors: Record<string, string> = {
        NEW: 'bg-blue-100 text-blue-700', CONTACTED: 'bg-yellow-100 text-yellow-700',
        FORM_SUBMITTED: 'bg-purple-100 text-purple-700', DOCUMENTS_PENDING: 'bg-orange-100 text-orange-700',
        INTERVIEW_SCHEDULED: 'bg-indigo-100 text-indigo-700', OFFERED: 'bg-teal-100 text-teal-700',
        ENROLLED: 'bg-green-100 text-green-700', REJECTED: 'bg-red-100 text-red-700',
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">{lead.childFirstName} {lead.childLastName}</h1>
                    <p className="text-gray-600">Applying for {lead.applyingForGrade}</p>
                </div>
                <Link href="/admissions" className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h2 className="font-semibold mb-4">Child Information</h2>
                    <dl className="space-y-2 text-sm">
                        <div className="flex justify-between"><dt className="text-gray-500">Name</dt><dd>{lead.childFirstName} {lead.childLastName}</dd></div>
                        <div className="flex justify-between"><dt className="text-gray-500">DOB</dt><dd>{lead.childDob ? formatDate(lead.childDob) : 'N/A'}</dd></div>
                        <div className="flex justify-between"><dt className="text-gray-500">Applying For</dt><dd>{lead.applyingForGrade}</dd></div>
                        <div className="flex justify-between"><dt className="text-gray-500">Stage</dt><dd>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${stageColors[lead.stage] || 'bg-gray-100 text-gray-700'}`}>{lead.stage.replace(/_/g, ' ')}</span>
                        </dd></div>
                    </dl>
                </div>

                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h2 className="font-semibold mb-4">Parent/Guardian</h2>
                    <dl className="space-y-2 text-sm">
                        <div className="flex justify-between"><dt className="text-gray-500">Name</dt><dd>{lead.parentName}</dd></div>
                        <div className="flex justify-between"><dt className="text-gray-500">Phone</dt><dd>{lead.parentPhone}</dd></div>
                        <div className="flex justify-between"><dt className="text-gray-500">Email</dt><dd>{lead.parentEmail || 'N/A'}</dd></div>
                        <div className="flex justify-between"><dt className="text-gray-500">Source</dt><dd className="capitalize">{lead.source.toLowerCase().replace(/_/g, ' ')}</dd></div>
                    </dl>
                </div>
            </div>

            {lead.notes && (
                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h2 className="font-semibold mb-2">Notes</h2>
                    <p className="text-sm text-gray-700">{lead.notes}</p>
                </div>
            )}

            {lead.applications.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h2 className="font-semibold mb-4">Applications ({lead.applications.length})</h2>
                    <div className="divide-y">
                        {lead.applications.map(app => (
                            <div key={app.id} className="py-3 flex justify-between items-center">
                                <div>
                                    <p className="font-medium">{app.applicationNumber}</p>
                                    <p className="text-sm text-gray-500">{formatDate(app.createdAt)}</p>
                                </div>
                                <span className={`px-2 py-1 rounded text-xs font-medium ${app.submittedAt ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                    }`}>{app.submittedAt ? 'Submitted' : 'Draft'}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex gap-3">
                <Link href={`/admissions/${id}/documents`} className="px-4 py-2 border rounded-lg hover:bg-gray-50">📄 Documents</Link>
            </div>
        </div>
    );
}
