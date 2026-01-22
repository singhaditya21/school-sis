import { getSession } from '@/lib/auth/session';
import Link from 'next/link';

interface AdmissionLead {
    id: string;
    childName: string;
    parentName: string;
    parentPhone: string;
    parentEmail?: string;
    status: string;
    notes?: string;
    createdAt: string;
}

export default async function AdmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getSession();

    let lead: AdmissionLead | null = null;

    try {
        const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/admissions/leads/${id}`,
            {
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                    'Content-Type': 'application/json',
                },
                cache: 'no-store',
            }
        );

        if (response.ok) {
            const data = await response.json();
            lead = data.data;
        }
    } catch (error) {
        console.error('[Admissions] API Error:', error);
    }

    if (!lead) {
        return <div className="p-8 text-center text-gray-500">Lead not found.</div>;
    }

    const statusColors: Record<string, string> = {
        NEW: 'bg-blue-100 text-blue-700',
        CONTACTED: 'bg-yellow-100 text-yellow-700',
        SCHEDULED: 'bg-purple-100 text-purple-700',
        VISITED: 'bg-indigo-100 text-indigo-700',
        APPLIED: 'bg-orange-100 text-orange-700',
        ENROLLED: 'bg-green-100 text-green-700',
        REJECTED: 'bg-red-100 text-red-700',
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">{lead.childName}</h1>
                    <span className={`px-2 py-1 rounded text-sm ${statusColors[lead.status] || 'bg-gray-100'}`}>
                        {lead.status}
                    </span>
                </div>
                <Link href="/admissions" className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h2 className="font-semibold mb-4">Parent Information</h2>
                    <dl className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <dt className="text-gray-500">Name</dt>
                            <dd>{lead.parentName}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-gray-500">Phone</dt>
                            <dd>{lead.parentPhone}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-gray-500">Email</dt>
                            <dd>{lead.parentEmail || 'N/A'}</dd>
                        </div>
                    </dl>
                </div>

                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h2 className="font-semibold mb-4">Actions</h2>
                    <div className="space-y-2">
                        <Link href={`/admissions/${id}/documents`} className="block w-full px-4 py-2 text-center border rounded-lg hover:bg-gray-50">
                            📄 View Documents
                        </Link>
                        <a href={`tel:${lead.parentPhone}`} className="block w-full px-4 py-2 text-center bg-green-600 text-white rounded-lg hover:bg-green-700">
                            📞 Call Parent
                        </a>
                    </div>
                </div>
            </div>

            {lead.notes && (
                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h2 className="font-semibold mb-2">Notes</h2>
                    <p className="text-gray-600">{lead.notes}</p>
                </div>
            )}
        </div>
    );
}
