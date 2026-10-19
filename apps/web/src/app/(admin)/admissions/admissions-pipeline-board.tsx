'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { GripVertical } from 'lucide-react';
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
        dotColor: 'bg-primary',
        defaultDropStage: 'NEW',
        stages: ['NEW', 'CONTACTED'],
        borderClass: 'border-border',
    },
    {
        key: 'documents',
        label: 'Document Verification',
        dotColor: 'bg-warning',
        defaultDropStage: 'DOCUMENTS_PENDING',
        stages: ['FORM_SUBMITTED', 'DOCUMENTS_PENDING'],
        borderClass: 'border-warning/30 border-l-4 border-l-warning',
    },
    {
        key: 'interview',
        label: 'Entrance & Interview',
        dotColor: 'bg-info',
        defaultDropStage: 'INTERVIEW_SCHEDULED',
        stages: ['INTERVIEW_SCHEDULED', 'INTERVIEW_DONE'],
        borderClass: 'border-info/30 border-l-4 border-l-info',
    },
    {
        key: 'offer',
        label: 'Offer & Acceptance',
        dotColor: 'bg-success',
        defaultDropStage: 'OFFERED',
        stages: ['OFFERED', 'ACCEPTED'],
        borderClass: 'border-success/30 border-l-4 border-l-success',
    },
    {
        key: 'closed',
        label: 'Closed',
        dotColor: 'bg-muted-foreground',
        defaultDropStage: 'ENROLLED',
        stages: ['ENROLLED', 'REJECTED', 'WITHDRAWN'],
        borderClass: 'border-border border-l-4 border-l-muted-foreground',
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

function LeadCard({
    lead,
    borderClass,
    onStageChange,
    onDragStartLead,
    onDragEndLead,
}: {
    lead: AdmissionLeadItem;
    borderClass: string;
    onStageChange: (leadId: string, nextStage: string) => void;
    onDragStartLead: (leadId: string) => void;
    onDragEndLead: () => void;
}) {
    return (
        <Card
            draggable
            onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', lead.id);
                onDragStartLead(lead.id);
            }}
            onDragEnd={onDragEndLead}
            data-testid={`lead-card-${lead.id}`}
            className={`transition-shadow cursor-grab active:cursor-grabbing ${borderClass} hover:shadow-md`}
        >
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                    <Link href={`/admissions/${lead.id}`} className="block group flex-1 min-w-0">
                        <h4 className="font-semibold text-foreground group-hover:text-primary truncate">
                            {lead.childFirstName} {lead.childLastName}
                        </h4>
                        <p className="text-xs font-medium text-primary mt-1 bg-accent w-max px-2 py-0.5 rounded">
                            {lead.applyingForGrade}
                        </p>
                    </Link>
                    <GripVertical className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
                </div>

                <div className="flex justify-between items-center mt-3 text-xs text-muted-foreground">
                    <span className="font-medium">{lead.assignedToName || 'Unassigned'}</span>
                    <span>{formatRelativeDate(lead.createdAt)}</span>
                </div>
                {lead.parentName && (
                    <div className="mt-2 text-xs text-muted-foreground truncate">{lead.parentName}</div>
                )}

                <label className="sr-only" htmlFor={`stage-${lead.id}`}>
                    Pipeline stage for {lead.childFirstName} {lead.childLastName}
                </label>
                <select
                    id={`stage-${lead.id}`}
                    value={lead.stage}
                    onChange={(e) => onStageChange(lead.id, e.target.value)}
                    className="mt-3 w-full text-xs border border-border rounded px-2 py-1.5 bg-card focus:ring-2 focus:ring-ring"
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
    const router = useRouter();
    const [, startTransition] = useTransition();
    const [search, setSearch] = useState('');
    const [localLeads, setLocalLeads] = useState<AdmissionLeadItem[]>(leads);
    const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
    const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

    const handleMoveLead = (leadId: string, nextStage: string) => {
        const target = localLeads.find((l) => l.id === leadId);
        if (!target || target.stage === nextStage) return;

        const previousStage = target.stage;
        setLocalLeads((prev) =>
            prev.map((l) => (l.id === leadId ? { ...l, stage: nextStage } : l)),
        );

        startTransition(async () => {
            const result = await moveLeadStage(leadId, nextStage);
            if (result.success) {
                toast.success(
                    `${target.childFirstName} moved to ${STAGE_LABELS[nextStage] || nextStage}.`,
                );
                router.refresh();
            } else {
                setLocalLeads((prev) =>
                    prev.map((l) => (l.id === leadId ? { ...l, stage: previousStage } : l)),
                );
                toast.error(result.error || 'Could not move the lead.');
            }
        });
    };

    const visibleLeads = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return localLeads;
        return localLeads.filter((l) =>
            [l.childFirstName, l.childLastName, l.parentName, l.applyingForGrade, l.parentPhone, l.parentEmail]
                .filter(Boolean)
                .some((value) => value.toLowerCase().includes(q)),
        );
    }, [localLeads, search]);

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
                <Card className="border-success/30 bg-success-subtle">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-success uppercase tracking-widest">
                            Enrolled
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground">{analytics.enrolled}</div>
                    </CardContent>
                </Card>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
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
                        Showing {visibleLeads.length} of {localLeads.length} loaded leads
                    </span>
                </div>
                <span className="text-xs text-muted-foreground">
                    Drag and drop cards across columns to advance pipeline stages
                </span>
            </div>

            {/* Drag-and-Drop Kanban Pipeline */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 overflow-x-auto pb-4">
                {PIPELINE_COLUMNS.map((col) => {
                    const colLeads = columnLeads[col.key];
                    const count = columnCounts[col.key];
                    const isOver = dragOverColumn === col.key;

                    return (
                        <div
                            key={col.key}
                            onDragOver={(e) => {
                                e.preventDefault();
                                setDragOverColumn(col.key);
                            }}
                            onDragLeave={() => setDragOverColumn(null)}
                            onDrop={(e) => {
                                e.preventDefault();
                                const id = e.dataTransfer.getData('text/plain') || draggedLeadId;
                                setDragOverColumn(null);
                                setDraggedLeadId(null);
                                if (id) {
                                    handleMoveLead(id, col.defaultDropStage);
                                }
                            }}
                            data-testid={`kanban-column-${col.key}`}
                            className={`space-y-3 min-w-[260px] rounded-xl p-2 transition-colors ${
                                isOver ? 'bg-accent/60 ring-2 ring-primary' : ''
                            }`}
                        >
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
                                        {search ? 'No matching leads' : 'Drop lead here'}
                                    </p>
                                </div>
                            ) : (
                                colLeads.map((lead) => (
                                    <LeadCard
                                        key={lead.id}
                                        lead={lead}
                                        borderClass={col.borderClass}
                                        onStageChange={handleMoveLead}
                                        onDragStartLead={setDraggedLeadId}
                                        onDragEndLead={() => {
                                            setDraggedLeadId(null);
                                            setDragOverColumn(null);
                                        }}
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
