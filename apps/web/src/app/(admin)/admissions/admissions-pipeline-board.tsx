'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AdmissionLeadItem } from '@/lib/actions/admissions';

import { moveLeadStage } from './actions';
import { PIPELINE_STAGES, STAGE_LABELS } from './constants';

/**
 * Column definitions that map UI columns to backend pipeline stages.
 * Between them the columns cover every value of the `pipeline_stage` enum,
 * so no lead can be silently dropped from the board.
 */
const PIPELINE_COLUMNS = [
    {
        key: 'new',
        label: 'New Inquiries',
        dotColor: 'bg-blue-400',
        stages: ['NEW', 'CONTACTED'],
        borderClass: 'border-border',
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
        key: 'offer',
        label: 'Offer & Acceptance',
        dotColor: 'bg-emerald-400',
        stages: ['OFFERED', 'ACCEPTED'],
        borderClass: 'border-emerald-200 border-l-4 border-l-emerald-400',
    },
    {
        key: 'closed',
        label: 'Closed',
        dotColor: 'bg-gray-400',
        stages: ['ENROLLED', 'REJECTED', 'WITHDRAWN'],
        borderClass: 'border-border border-l-4 border-l-gray-300',
    },
] as const;

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

function LeadCard({ lead, borderClass }: { lead: AdmissionLeadItem; borderClass: string }) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [stage, setStage] = useState(lead.stage);

    function handleStageChange(nextStage: string) {
        const previous = stage;
        setStage(nextStage);
        startTransition(async () => {
            const result = await moveLeadStage(lead.id, nextStage);
            if (result.success) {
                toast.success(
                    `${lead.childFirstName} moved to ${STAGE_LABELS[nextStage] || nextStage}.`,
                );
                router.refresh();
            } else {
                setStage(previous);
                toast.error(result.error || 'Could not move the lead.');
            }
        });
    }

    return (
        <Card className={`transition-shadow ${borderClass} ${isPending ? 'opacity-50' : 'hover:shadow-md'}`}>
            <CardContent className="p-4">
                <Link href={`/admissions/${lead.id}`} className="block group">
                    <h4 className="font-semibold text-foreground group-hover:text-primary">
                        {lead.childFirstName} {lead.childLastName}
                    </h4>
                    <p className="text-xs font-medium text-primary mt-1 bg-accent w-max px-2 py-0.5 rounded">
                        {lead.applyingForGrade}
                    </p>
                    <div className="flex justify-between items-center mt-3 text-xs text-muted-foreground">
                        <span className="font-medium">{lead.assignedToName || 'Unassigned'}</span>
                        <span>{formatRelativeDate(lead.createdAt)}</span>
                    </div>
                    {lead.parentName && (
                        <div className="mt-2 text-xs text-muted-foreground truncate">{lead.parentName}</div>
                    )}
                </Link>

                <label className="sr-only" htmlFor={`stage-${lead.id}`}>
                    Pipeline stage for {lead.childFirstName} {lead.childLastName}
                </label>
                <select
                    id={`stage-${lead.id}`}
                    value={stage}
                    disabled={isPending}
                    onChange={(e) => handleStageChange(e.target.value)}
                    className="mt-3 w-full text-xs border border-border rounded px-2 py-1.5 bg-white disabled:opacity-50 focus:ring-2 focus:ring-ring"
                >
                    {PIPELINE_STAGES.map((s) => (
                        <option key={s} value={s}>
                            {STAGE_LABELS[s] || s}
                        </option>
                    ))}
                </select>
            </CardContent>
        </Card>
    );
}

export default function AdmissionsPipelineBoard({
    leads,
    pipelineCounts,
    analytics,
}: AdmissionsPipelineBoardProps) {
    const [search, setSearch] = useState('');

    const visibleLeads = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return leads;
        return leads.filter((l) =>
            [l.childFirstName, l.childLastName, l.parentName, l.applyingForGrade, l.parentPhone, l.parentEmail]
                .filter(Boolean)
                .some((value) => value.toLowerCase().includes(q)),
        );
    }, [leads, search]);

    const columnLeads: Record<string, AdmissionLeadItem[]> = {};
    for (const col of PIPELINE_COLUMNS) {
        columnLeads[col.key] = visibleLeads.filter((l) =>
            (col.stages as readonly string[]).includes(l.stage),
        );
    }

    const columnCounts: Record<string, number> = {};
    for (const col of PIPELINE_COLUMNS) {
        columnCounts[col.key] = col.stages.reduce(
            (sum, stage) => sum + (pipelineCounts[stage] || 0),
            0,
        );
    }

    const documentsPendingCount = pipelineCounts['DOCUMENTS_PENDING'] || 0;
    const offeredCount = pipelineCounts['OFFERED'] || 0;

    return (
        <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="border-border bg-accent">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-primary uppercase tracking-widest">
                            Active Leads
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground">{analytics.activeInPipeline}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                            Awaiting Documents
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground">{documentsPendingCount}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                            Offers Outstanding
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground">{offeredCount}</div>
                    </CardContent>
                </Card>
                <Card className="border-emerald-100 bg-emerald-50/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-emerald-600 uppercase tracking-widest">
                            Enrolled
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground">{analytics.enrolled}</div>
                    </CardContent>
                </Card>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <label className="sr-only" htmlFor="lead-search">
                    Search leads
                </label>
                <input
                    id="lead-search"
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by child, parent, grade or contact…"
                    className="w-full sm:w-96 px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-ring"
                />
                <span className="text-sm text-muted-foreground">
                    Showing {visibleLeads.length} of {leads.length} loaded leads
                </span>
            </div>

            {/* Kanban Pipeline */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 overflow-x-auto pb-4">
                {PIPELINE_COLUMNS.map((col) => {
                    const colLeads = columnLeads[col.key];
                    const count = columnCounts[col.key];

                    return (
                        <div key={col.key} className="space-y-3 min-w-[260px]">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold text-foreground flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${col.dotColor}`}></span>
                                    {col.label}
                                </h3>
                                <span className="bg-muted text-muted-foreground px-2 py-0.5 rounded text-xs font-medium">
                                    {count}
                                </span>
                            </div>

                            {colLeads.length === 0 ? (
                                <div className="border border-dashed border-border rounded-lg p-6 text-center">
                                    <p className="text-sm text-muted-foreground">
                                        {search ? 'No matching leads' : 'No leads in this stage'}
                                    </p>
                                </div>
                            ) : (
                                colLeads.map((lead) => (
                                    <LeadCard key={lead.id} lead={lead} borderClass={col.borderClass} />
                                ))
                            )}
                        </div>
                    );
                })}
            </div>
        </>
    );
}
