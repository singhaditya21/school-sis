'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import {
    ArrowUpDown,
    Copy,
    ExternalLink,
    GripVertical,
    MessageSquare,
    Sparkles,
    X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AdmissionLeadItem } from '@/lib/actions/admissions';
import {
    scoreAdmissionLeadPropensity,
    type LeadPropensityResult,
} from '@/lib/admissions/lead-scoring';

import { moveLeadStage } from './actions';
import { generateLeadAiCopilotBriefAction } from './copilot-actions';
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

    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return new Date(date).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
    });
}

function tierBadgeClass(tier: LeadPropensityResult['tier']): string {
    if (tier === 'HOT') return 'border-brass/50 bg-primary text-primary-foreground';
    if (tier === 'WARM') return 'border-brass/40 bg-accent text-accent-foreground';
    if (tier === 'CLOSED') return 'border-success/30 bg-success-subtle text-success';
    return 'border-border bg-muted text-muted-foreground';
}

function LeadCard({
    lead,
    propensity,
    borderClass,
    onStageChange,
    onOpenCopilot,
    onDragStartLead,
    onDragEndLead,
}: {
    lead: AdmissionLeadItem;
    propensity: LeadPropensityResult;
    borderClass: string;
    onStageChange: (leadId: string, nextStage: string) => void;
    onOpenCopilot: (lead: AdmissionLeadItem) => void;
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
            <CardContent className="p-4 space-y-2.5">
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

                {/* AI Propensity Score Pill */}
                <div className="flex items-center justify-between gap-2 pt-0.5">
                    <Badge
                        variant="outline"
                        data-testid="lead-ai-score-badge"
                        className={`text-[11px] font-semibold ${tierBadgeClass(propensity.tier)}`}
                    >
                        <Sparkles className="h-3 w-3 mr-1 text-brass" />
                        {propensity.tier === 'CLOSED'
                            ? propensity.tierLabel
                            : `${propensity.tier} · ${propensity.score}%`}
                    </Badge>
                    <button
                        type="button"
                        data-testid={`open-lead-copilot-${lead.id}`}
                        onClick={() => onOpenCopilot(lead)}
                        className="inline-flex items-center gap-1 rounded-md border border-brass/35 bg-accent/60 px-2 py-1 text-[11px] font-semibold text-accent-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
                    >
                        <MessageSquare className="h-3 w-3 text-brass" />
                        Copilot
                    </button>
                </div>

                {propensity.signals[0] && (
                    <p className="text-[11px] text-muted-foreground truncate">
                        {propensity.signals[0]}
                    </p>
                )}

                <div className="flex justify-between items-center text-xs text-muted-foreground">
                    <span className="font-medium truncate">{lead.assignedToName || 'Unassigned'}</span>
                    <span>{formatRelativeDate(lead.createdAt)}</span>
                </div>
                {lead.parentName && (
                    <div className="text-xs text-muted-foreground truncate">{lead.parentName}</div>
                )}

                <label className="sr-only" htmlFor={`stage-${lead.id}`}>
                    Pipeline stage for {lead.childFirstName} {lead.childLastName}
                </label>
                <select
                    id={`stage-${lead.id}`}
                    value={lead.stage}
                    onChange={(e) => onStageChange(lead.id, e.target.value)}
                    className="w-full text-xs border border-border rounded px-2 py-1.5 bg-card focus:ring-2 focus:ring-ring"
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
    const [isCopilotLoading, startCopilotTransition] = useTransition();
    const [search, setSearch] = useState('');
    const [sortByAiPriority, setSortByAiPriority] = useState(true);
    const [localLeads, setLocalLeads] = useState<AdmissionLeadItem[]>(leads);
    const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
    const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

    const [activeCopilotLeadId, setActiveCopilotLeadId] = useState<string | null>(null);
    const [scriptLang, setScriptLang] = useState<'english' | 'hindi'>('english');
    const [copilotOverride, setCopilotOverride] = useState<{
        leadId: string;
        engineSource: string;
        talkingPoints: string[];
    } | null>(null);

    const propensityById = useMemo(() => {
        const map = new Map<string, LeadPropensityResult>();
        for (const l of localLeads) {
            map.set(l.id, scoreAdmissionLeadPropensity(l));
        }
        return map;
    }, [localLeads]);

    const hotLeadsCount = useMemo(() => {
        let count = 0;
        for (const l of localLeads) {
            if (propensityById.get(l.id)?.tier === 'HOT') count += 1;
        }
        return count;
    }, [localLeads, propensityById]);

    const handleOpenCopilot = (lead: AdmissionLeadItem) => {
        setActiveCopilotLeadId(lead.id);
        startCopilotTransition(async () => {
            const res = await generateLeadAiCopilotBriefAction(lead.id);
            if (res.data) {
                setCopilotOverride({
                    leadId: lead.id,
                    engineSource: res.data.engineSource,
                    talkingPoints: res.data.aiTalkingPoints,
                });
            }
        });
    };

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
        const filtered = !q
            ? [...localLeads]
            : localLeads.filter((l) =>
                  [
                      l.childFirstName,
                      l.childLastName,
                      l.parentName,
                      l.applyingForGrade,
                      l.parentPhone,
                      l.parentEmail,
                  ]
                      .filter(Boolean)
                      .some((value) => value.toLowerCase().includes(q)),
              );

        if (sortByAiPriority) {
            filtered.sort((a, b) => {
                const sa = propensityById.get(a.id)?.score ?? 0;
                const sb = propensityById.get(b.id)?.score ?? 0;
                return sb - sa;
            });
        }
        return filtered;
    }, [localLeads, search, sortByAiPriority, propensityById]);

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

    const selectedLead = activeCopilotLeadId
        ? localLeads.find((l) => l.id === activeCopilotLeadId) || null
        : null;
    const selectedPropensity = selectedLead
        ? propensityById.get(selectedLead.id) || scoreAdmissionLeadPropensity(selectedLead)
        : null;
    const activeTalkingPoints =
        selectedLead && copilotOverride?.leadId === selectedLead.id
            ? copilotOverride.talkingPoints
            : selectedPropensity?.talkingPoints || [];
    const activeEngineSource =
        selectedLead && copilotOverride?.leadId === selectedLead.id
            ? copilotOverride.engineSource
            : 'DETERMINISTIC_PROPENSITY_ENGINE';

    return (
        <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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

                <Card className="border-brass/40 bg-card">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-foreground uppercase tracking-widest flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-brass" />
                            AI Hot Leads
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div
                            data-testid="hot-leads-kpi-count"
                            className="text-2xl font-bold text-foreground"
                        >
                            {hotLeadsCount}
                        </div>
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

            {/* AI Counselor Copilot & Bilingual WhatsApp Outreach Drawer */}
            {selectedLead && selectedPropensity && (
                <Card
                    data-testid="admissions-copilot-panel"
                    className="border-brass/45 bg-card shadow-md overflow-hidden"
                >
                    <div className="bg-primary text-primary-foreground px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-brass/40">
                        <div className="flex items-center gap-2.5">
                            <Sparkles className="h-4 w-4 text-brass" />
                            <div>
                                <p className="text-sm font-bold">
                                    AI Counselor Copilot · {selectedLead.childFirstName}{' '}
                                    {selectedLead.childLastName} ({selectedLead.applyingForGrade})
                                </p>
                                <p className="text-xs text-primary-foreground/80">
                                    Propensity {selectedPropensity.score}/99 ({selectedPropensity.tierLabel}) · Engine:{' '}
                                    {activeEngineSource}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setActiveCopilotLeadId(null)}
                            className="rounded-lg p-1 text-primary-foreground/80 hover:bg-white/10 hover:text-white"
                            aria-label="Close AI Counselor Copilot"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <CardContent className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6">
                        <div className="lg:col-span-6 space-y-4">
                            <div className="rounded-xl border border-brass/30 bg-accent/40 p-3.5">
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Recommended Next Counselor Action
                                </p>
                                <p className="mt-1 text-sm font-medium text-foreground leading-relaxed">
                                    {selectedPropensity.nextBestAction}
                                </p>
                            </div>

                            <div className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Call Talking Points {isCopilotLoading ? '(Refreshing…)' : ''}
                                </p>
                                <ul className="space-y-1.5 text-xs text-foreground">
                                    {activeTalkingPoints.map((pt, idx) => (
                                        <li
                                            key={idx}
                                            className="rounded-lg border border-border bg-muted/40 px-3 py-2 leading-relaxed"
                                        >
                                            {pt}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        <div className="lg:col-span-6 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    1-Tap WhatsApp Guardian Outreach
                                </span>
                                <div className="inline-flex rounded-lg border border-border bg-muted p-0.5 text-xs">
                                    <button
                                        type="button"
                                        data-testid="copilot-lang-english"
                                        onClick={() => setScriptLang('english')}
                                        className={`rounded-md px-2.5 py-1 font-medium ${
                                            scriptLang === 'english'
                                                ? 'bg-card text-foreground shadow-sm'
                                                : 'text-muted-foreground'
                                        }`}
                                    >
                                        English
                                    </button>
                                    <button
                                        type="button"
                                        data-testid="copilot-lang-hindi"
                                        onClick={() => setScriptLang('hindi')}
                                        className={`rounded-md px-2.5 py-1 font-medium ${
                                            scriptLang === 'hindi'
                                                ? 'bg-card text-foreground shadow-sm'
                                                : 'text-muted-foreground'
                                        }`}
                                    >
                                        हिन्दी (Hindi)
                                    </button>
                                </div>
                            </div>

                            <div
                                data-testid="copilot-whatsapp-script-box"
                                className="rounded-xl border border-border bg-muted/40 p-3.5 text-xs text-foreground leading-relaxed"
                            >
                                {selectedPropensity.whatsappScripts[scriptLang]}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="gap-1.5 text-xs"
                                    onClick={() => {
                                        navigator.clipboard?.writeText(
                                            selectedPropensity.whatsappScripts[scriptLang],
                                        );
                                        toast.success('Copied personalized WhatsApp outreach script');
                                    }}
                                >
                                    <Copy className="h-3.5 w-3.5 text-brass" />
                                    Copy Script
                                </Button>

                                {selectedPropensity.whatsappDigits && (
                                    <a
                                        href={`https://wa.me/${selectedPropensity.whatsappDigits}?text=${encodeURIComponent(
                                            selectedPropensity.whatsappScripts[scriptLang],
                                        )}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                                    >
                                        Open in WhatsApp
                                        <ExternalLink className="h-3.5 w-3.5 text-brass" />
                                    </a>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

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
                        className="w-full sm:w-80 px-3 py-2 border border-border rounded-lg text-sm bg-background focus:ring-2 focus:ring-ring"
                    />
                    <button
                        type="button"
                        data-testid="toggle-ai-priority-sort"
                        onClick={() => setSortByAiPriority((v) => !v)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                            sortByAiPriority
                                ? 'border-brass/50 bg-primary text-primary-foreground'
                                : 'border-border bg-card text-foreground hover:bg-muted'
                        }`}
                    >
                        <ArrowUpDown className="h-3.5 w-3.5 text-brass" />
                        {sortByAiPriority ? 'Sorted by AI Propensity' : 'Sort by AI Propensity'}
                    </button>
                    <span className="text-sm text-muted-foreground">
                        Showing {visibleLeads.length} of {localLeads.length} loaded leads
                    </span>
                </div>
                <span className="text-xs text-muted-foreground">
                    Drag cards across columns or open Copilot for 1-tap WhatsApp follow-up
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
                                        propensity={
                                            propensityById.get(lead.id) ||
                                            scoreAdmissionLeadPropensity(lead)
                                        }
                                        borderClass={col.borderClass}
                                        onStageChange={handleMoveLead}
                                        onOpenCopilot={handleOpenCopilot}
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
