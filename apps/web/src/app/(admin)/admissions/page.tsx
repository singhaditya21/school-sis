import Link from 'next/link';

import {
    getAdmissionLeads,
    getAdmissionPipelineCounts,
    getAdmissionsAnalytics,
} from '@/lib/actions/admissions';

import AdmissionsPipelineBoard from './admissions-pipeline-board';

export default async function AdmissionsPipelinePage() {
    const [{ leads, total }, pipelineCounts, analytics] = await Promise.all([
        getAdmissionLeads({ limit: 200 }),
        getAdmissionPipelineCounts(),
        getAdmissionsAnalytics(),
    ]);

    const sourceBreakdown = [...analytics.sourceBreakdown].sort((a, b) => b.count - a.count);

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <div className="flex flex-wrap justify-between items-center gap-4 pb-4 border-b border-gray-200">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Admissions Pipeline</h1>
                    <p className="text-gray-500 mt-1">
                        Track every enquiry from first contact through to enrolment.
                    </p>
                </div>
                <Link
                    href="/admissions/new"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                    + New Lead
                </Link>
            </div>

            <AdmissionsPipelineBoard
                leads={leads}
                pipelineCounts={pipelineCounts}
                analytics={{
                    activeInPipeline: analytics.activeInPipeline,
                    enrolled: analytics.enrolled,
                    totalLeads: analytics.totalLeads,
                }}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Conversion</h2>
                    <dl className="space-y-3 text-sm">
                        <div className="flex justify-between">
                            <dt className="text-gray-500">Leads on record</dt>
                            <dd className="font-medium text-gray-900">{analytics.totalLeads}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-gray-500">Enrolled</dt>
                            <dd className="font-medium text-gray-900">{analytics.enrolled}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-gray-500">Rejected</dt>
                            <dd className="font-medium text-gray-900">{analytics.rejected}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-gray-500">Withdrawn</dt>
                            <dd className="font-medium text-gray-900">{analytics.withdrawn}</dd>
                        </div>
                        <div className="flex justify-between border-t pt-3">
                            <dt className="text-gray-500">Conversion rate</dt>
                            <dd className="font-semibold text-gray-900">{analytics.conversionRate}%</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-gray-500">Average days to enrol</dt>
                            <dd className="font-medium text-gray-900">
                                {analytics.enrolled > 0 ? `${analytics.avgDaysToEnroll} days` : '—'}
                            </dd>
                        </div>
                    </dl>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Where leads come from</h2>
                    {sourceBreakdown.length === 0 ? (
                        <p className="text-sm text-gray-400">No leads recorded yet.</p>
                    ) : (
                        <ul className="space-y-3 text-sm">
                            {sourceBreakdown.map((s) => (
                                <li key={s.source}>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500 capitalize">
                                            {s.source.toLowerCase().replace(/_/g, ' ')}
                                        </span>
                                        <span className="font-medium text-gray-900">{s.count}</span>
                                    </div>
                                    <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100">
                                        <div
                                            className="h-1.5 rounded-full bg-blue-500"
                                            style={{
                                                width: analytics.totalLeads
                                                    ? `${Math.round((s.count / analytics.totalLeads) * 100)}%`
                                                    : '0%',
                                            }}
                                        />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {total > leads.length && (
                <p className="text-sm text-gray-500">
                    Showing the {leads.length} most recent leads of {total} on record.
                </p>
            )}
        </div>
    );
}
