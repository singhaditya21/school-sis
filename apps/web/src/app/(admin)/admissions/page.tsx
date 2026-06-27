import {
    getAdmissionLeads,
    getAdmissionPipelineCounts,
    getAdmissionsAnalytics,
} from '@/lib/actions/admissions';
import AdmissionsPipelineBoard from './admissions-pipeline-board';

export default async function AdmissionsPipelinePage() {
    const [{ leads }, pipelineCounts, analytics] = await Promise.all([
        getAdmissionLeads({ limit: 200 }),
        getAdmissionPipelineCounts(),
        getAdmissionsAnalytics(),
    ]);

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center pb-4 border-b border-gray-200">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Admissions Pipeline</h1>
                    <p className="text-gray-500 mt-1">Multi-program intake management for University Degrees and Coaching Batches.</p>
                </div>
                <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                    + New Application
                </button>
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
        </div>
    );
}
