'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AdmissionLeadItem } from '@/lib/actions/admissions';
import { updateLeadStage } from '@/lib/actions/admissions';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

/**
 * Column definitions that map UI columns to backend pipeline stages.
 * Each column groups one or more backend stages together.
 */
const PIPELINE_COLUMNS = [
    {
        key: 'new',
        label: 'New Inquiries',
        dotColor: 'bg-blue-400',
        stages: ['NEW', 'CONTACTED'],
        borderClass: 'border-gray-200',
    },
    {
        key: 'documents',
        label: 'Document Verification',
        dotColor: 'bg-amber-400',
        stages: ['FORM_SUBMITTED', 'DOCUMENTS_PENDING'],
        borderClass: 'border-amber-200 border-l-4 border-l-amber-400',
    },
    {
        key: 'interview',
        label: 'Entrance & Interview',
        dotColor: 'bg-purple-400',
        stages: ['INTERVIEW_SCHEDULED', 'INTERVIEW_DONE'],
        borderClass: 'border-purple-200 border-l-4 border-l-purple-400',
    },
    {
        key: 'enrollment',
        label: 'Enrollment Deposit',
        dotColor: 'bg-emerald-400',
        stages: ['OFFERED', 'ACCEPTED'],
        borderClass: 'border-emerald-200 border-l-4 border-l-emerald-400',
    },
] as const;

const STAGE_LABELS: Record<string, string> = {
    NEW: 'New',
    CONTACTED: 'Contacted',
    FORM_SUBMITTED: 'Form Submitted',
    DOCUMENTS_PENDING: 'Docs Pending',
    INTERVIEW_SCHEDULED: 'Interview Scheduled',
    INTERVIEW_DONE: 'Interview Done',
    OFFERED: 'Offered',
    ACCEPTED: 'Accepted',
    ENROLLED: 'Enrolled',
    REJECTED: 'Rejected',
    WITHDRAWN: 'Withdrawn',
};

interface AdmissionsPipelineBoardProps {
    leads: AdmissionLeadItem[];
    pipelineCounts: Record<string, number>;
    analytics: {
        activeInPipeline: number;
        enrolled: number;
        totalLeads: number;
    };
}

function formatRelativeDate(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return new Date(date).toLocaleDateString();
}

function LeadCard({
    lead,
    borderClass,
}: {
    lead: AdmissionLeadItem;
    borderClass: string;
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    return (
        <Card
            className={`hover:shadow-md transition-shadow cursor-grab ${borderClass} ${isPending ? 'opacity-50' : ''}`}
        >
            <CardContent className="p-4">
                <h4 className="font-semibold text-gray-900">
                    {lead.childFirstName} {lead.childLastName}
                </h4>
                <p className="text-xs font-medium text-blue-600 mt-1 bg-blue-50 w-max px-2 py-0.5 rounded">
                    {lead.applyingForGrade}
                </p>
                <div className="flex justify-between items-center mt-3 text-xs text-gray-500">
                    <span className="font-medium">
                        {STAGE_LABELS[lead.stage] || lead.stage}
                    </span>
                    <span>{formatRelativeDate(lead.createdAt)}</span>
                </div>
                {lead.parentName && (
                    <div className="mt-2 text-xs text-gray-400 truncate">
                        {lead.parentName}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export default function AdmissionsPipelineBoard({
    leads,
    pipelineCounts,
    analytics,
}: AdmissionsPipelineBoardProps) {
    // Group leads by column
    const columnLeads: Record<string, AdmissionLeadItem[]> = {};
    for (const col of PIPELINE_COLUMNS) {
        columnLeads[col.key] = leads.filter((l) =>
            col.stages.includes(l.stage as any)
        );
    }

    // Compute column counts from pipelineCounts
    const columnCounts: Record<string, number> = {};
    for (const col of PIPELINE_COLUMNS) {
        columnCounts[col.key] = col.stages.reduce(
            (sum, stage) => sum + (pipelineCounts[stage] || 0),
            0
        );
    }

    const documentsPendingCount = pipelineCounts['DOCUMENTS_PENDING'] || 0;
    const offeredCount = pipelineCounts['OFFERED'] || 0;

    return (
        <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="border-blue-100 bg-blue-50/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-blue-600 uppercase tracking-widest">
                            Active Leads
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-gray-900">
                            {analytics.activeInPipeline}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                            Document Verifications
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-gray-900">
                            {documentsPendingCount}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                            Fee Deposits Pending
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-gray-900">
                            {offeredCount}
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-emerald-100 bg-emerald-50/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-emerald-600 uppercase tracking-widest">
                            Enrolled
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-gray-900">
                            {analytics.enrolled}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Kanban Pipeline */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 overflow-x-auto pb-4">
                {PIPELINE_COLUMNS.map((col) => {
                    const colLeads = columnLeads[col.key];
                    const count = columnCounts[col.key];

                    return (
                        <div key={col.key} className="space-y-3 min-w-[280px]">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                                    <span
                                        className={`w-2 h-2 rounded-full ${col.dotColor}`}
                                    ></span>
                                    {col.label}
                                </h3>
                                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-medium">
                                    {count}
                                </span>
                            </div>

                            {colLeads.length === 0 ? (
                                <div className="border border-dashed border-gray-200 rounded-lg p-6 text-center">
                                    <p className="text-sm text-gray-400">
                                        No leads in this stage
                                    </p>
                                </div>
                            ) : (
                                colLeads.map((lead) => (
                                    <LeadCard
                                        key={lead.id}
                                        lead={lead}
                                        borderClass={col.borderClass}
                                    />
                                ))
                            )}
                        </div>
                    );
                })}
            </div>
        </>
    );
}
