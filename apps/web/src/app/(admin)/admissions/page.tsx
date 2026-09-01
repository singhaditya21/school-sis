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
            <div className="flex flex-wrap justify-between items-center gap-4 pb-4 border-b border-border">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Admissions Pipeline</h1>
                    <p className="text-muted-foreground mt-1">
                        Track every enquiry from first contact through to enrolment.
                    </p>
                </div>
                <Link
                    href="/admissions/new"
                    className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
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
                <div className="bg-white rounded-xl border border-border p-6">
                    <h2 className="text-lg font-semibold text-foreground mb-4">Conversion</h2>
                    <dl className="space-y-3 text-sm">
                        <div className="flex justify-between">
                            <dt className="text-muted-foreground">Leads on record</dt>
                            <dd className="font-medium text-foreground">{analytics.totalLeads}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-muted-foreground">Enrolled</dt>
                            <dd className="font-medium text-foreground">{analytics.enrolled}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-muted-foreground">Rejected</dt>
                            <dd className="font-medium text-foreground">{analytics.rejected}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-muted-foreground">Withdrawn</dt>
                            <dd className="font-medium text-foreground">{analytics.withdrawn}</dd>
                        </div>
                        <div className="flex justify-between border-t pt-3">
                            <dt className="text-muted-foreground">Conversion rate</dt>
                            <dd className="font-semibold text-foreground">{analytics.conversionRate}%</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-muted-foreground">Average days to enrol</dt>
                            <dd className="font-medium text-foreground">
                                {analytics.enrolled > 0 ? `${analytics.avgDaysToEnroll} days` : '—'}
                            </dd>
                        </div>
                    </dl>
                </div>

                <div className="bg-white rounded-xl border border-border p-6">
                    <h2 className="text-lg font-semibold text-foreground mb-4">Where leads come from</h2>
                    {sourceBreakdown.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No leads recorded yet.</p>
                    ) : (
                        <ul className="space-y-3 text-sm">
                            {sourceBreakdown.map((s) => (
                                <li key={s.source}>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground capitalize">
                                            {s.source.toLowerCase().replace(/_/g, ' ')}
                                        </span>
                                        <span className="font-medium text-foreground">{s.count}</span>
                                    </div>
                                    <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                                        <div
                                            className="h-1.5 rounded-full bg-primary"
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
                <p className="text-sm text-muted-foreground">
                    Showing the {leads.length} most recent leads of {total} on record.
                </p>
            )}
        </div>
    );
}
