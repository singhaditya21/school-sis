import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAdmissionLeads, getAdmissionPipelineCounts } from '@/lib/actions/admissions';

export default async function AdmissionsPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const { leads, total } = await getAdmissionLeads();
    const pipeline = await getAdmissionPipelineCounts();

    const stageColors: Record<string, string> = {
        NEW: 'bg-blue-100 text-blue-700',
        CONTACTED: 'bg-yellow-100 text-yellow-700',
        FORM_SUBMITTED: 'bg-purple-100 text-purple-700',
        DOCUMENTS_PENDING: 'bg-orange-100 text-orange-700',
        INTERVIEW_SCHEDULED: 'bg-indigo-100 text-indigo-700',
        INTERVIEW_DONE: 'bg-cyan-100 text-cyan-700',
        OFFERED: 'bg-teal-100 text-teal-700',
        ACCEPTED: 'bg-lime-100 text-lime-700',
        ENROLLED: 'bg-green-100 text-green-700',
        REJECTED: 'bg-red-100 text-red-700',
        WITHDRAWN: 'bg-gray-100 text-gray-700',
    };

    const pipelineStages = ['NEW', 'CONTACTED', 'FORM_SUBMITTED', 'INTERVIEW_SCHEDULED', 'OFFERED', 'ENROLLED'];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Admissions</h1>
                    <p className="text-gray-600 mt-1">{total} leads total</p>
                </div>
                <Link href="/admissions/new" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    + Add Lead
                </Link>
            </div>

            {/* Pipeline Funnel */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {pipelineStages.map(stage => (
                    <div key={stage} className="bg-white rounded-lg shadow-sm border p-4 text-center">
                        <p className="text-2xl font-bold">{pipeline[stage] || 0}</p>
                        <p className="text-xs text-gray-500 mt-1">{stage.replace(/_/g, ' ')}</p>
                    </div>
                ))}
            </div>

            {/* Leads Table */}
            <div className="bg-white rounded-xl shadow-sm border">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Child Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Grade</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Parent</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stage</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned To</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {leads.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                                        No leads found. Add your first lead to get started.
                                    </td>
                                </tr>
                            ) : (
                                leads.map((lead) => (
                                    <tr key={lead.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                                            {lead.childFirstName} {lead.childLastName}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                            {lead.applyingForGrade}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                                            {lead.parentName}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                                            {lead.parentPhone}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${stageColors[lead.stage] || 'bg-gray-100 text-gray-700'}`}>
                                                {lead.stage.replace(/_/g, ' ')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-600 capitalize">
                                            {lead.source.toLowerCase().replace(/_/g, ' ')}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                            {lead.assignedToName || '—'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <Link href={`/admissions/${lead.id}`} className="text-blue-600 hover:underline">
                                                View
                                            </Link>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
