import { getSession } from '@/lib/auth/session';
import Link from 'next/link';

interface AdmissionLead {
    id: string;
    childName: string;
    parentName: string;
    parentPhone: string;
    parentEmail?: string;
    status: string;
    source?: string;
    notes?: string;
    createdAt: string;
}

// Mock admission leads
const mockLeads: AdmissionLead[] = [
    { id: '1', childName: 'Atharva Sharma', parentName: 'Vinod Sharma', parentPhone: '9876543201', status: 'NEW', source: 'Website', createdAt: '2026-01-20' },
    { id: '2', childName: 'Aaradhya Patel', parentName: 'Suresh Patel', parentPhone: '9876543202', status: 'CONTACTED', source: 'Referral', createdAt: '2026-01-19' },
    { id: '3', childName: 'Rudra Singh', parentName: 'Manoj Singh', parentPhone: '9876543203', status: 'SCHEDULED', source: 'Walk-in', createdAt: '2026-01-18' },
    { id: '4', childName: 'Avni Gupta', parentName: 'Rakesh Gupta', parentPhone: '9876543204', status: 'VISITED', source: 'Ad Campaign', createdAt: '2026-01-17' },
    { id: '5', childName: 'Shivansh Reddy', parentName: 'Kumar Reddy', parentPhone: '9876543205', status: 'APPLIED', source: 'Website', createdAt: '2026-01-16' },
    { id: '6', childName: 'Manya Joshi', parentName: 'Anil Joshi', parentPhone: '9876543206', status: 'ENROLLED', source: 'Referral', createdAt: '2026-01-15' },
    { id: '7', childName: 'Lakshya Mehta', parentName: 'Deepak Mehta', parentPhone: '9876543207', status: 'NEW', source: 'Website', createdAt: '2026-01-14' },
    { id: '8', childName: 'Kiara Chopra', parentName: 'Sanjay Chopra', parentPhone: '9876543208', status: 'CONTACTED', source: 'Social Media', createdAt: '2026-01-13' },
    { id: '9', childName: 'Reyansh Nair', parentName: 'Pradeep Nair', parentPhone: '9876543209', status: 'SCHEDULED', source: 'Walk-in', createdAt: '2026-01-12' },
    { id: '10', childName: 'Shanaya Das', parentName: 'Amit Das', parentPhone: '9876543210', status: 'VISITED', source: 'Referral', createdAt: '2026-01-11' },
];

export default async function AdmissionsPage() {
    const session = await getSession();

    // Fetch leads from Java API
    let leads: AdmissionLead[] = [];
    let useMockData = false;

    try {
        const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/admissions/leads`,
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
            leads = data.data?.content || data.content || [];
            if (leads.length === 0) useMockData = true;
        } else {
            useMockData = true;
        }
    } catch (error) {
        console.error('[Admissions] API Error, using mock data:', error);
        useMockData = true;
    }

    // Use mock data as fallback
    if (useMockData) {
        leads = mockLeads;
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
                    <h1 className="text-3xl font-bold">Admissions</h1>
                    <p className="text-gray-600 mt-1">Manage admission leads and applications</p>
                </div>
                <Link
                    href="/admissions/new"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                    + Add Lead
                </Link>
            </div>

            <div className="bg-white rounded-xl shadow-sm border">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Child Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Parent</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {leads.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                                        No leads found. Add your first lead to get started.
                                    </td>
                                </tr>
                            ) : (
                                leads.map((lead) => (
                                    <tr key={lead.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                                            {lead.childName}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                                            {lead.parentName}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                                            {lead.parentPhone}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[lead.status] || 'bg-gray-100 text-gray-700'}`}>
                                                {lead.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                                            {lead.source || '-'}
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
