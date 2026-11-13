'use client';

/**
 * @module app/(admin)/app/[object]/object-copilot-bar
 *
 * Agentforce Object Home Grounded Copilot & 4-Eyes Review Proposer:
 * Queries OWD/FLS-filtered aggregate KPIs, stage distributions, numeric rollups,
 * active formula validation rules, and pending multi-step approvals on any System
 * or Custom Object, and lets authorized staff propose human-approved stage transitions.
 */

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
    Bot,
    ChevronDown,
    ChevronUp,
    ExternalLink,
    ShieldCheck,
    Sparkles,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
    askObjectCopilotAction,
    proposeObjectCopilotApprovalAction,
    type ObjectCopilotInsightsResult,
} from '@/lib/actions/lcnc-tier3';

const QUICK_PROMPTS = [
    'Summarize pipeline stage breakdown and key totals',
    'Check active formula validation rules and pending approvals',
    'Highlight numeric rollups and average values across visible records',
];

export function ObjectCopilotBar({
    objectApiName,
    objectLabel,
    sampleRecordIds,
    canProposeApproval,
}: {
    objectApiName: string;
    objectLabel: string;
    sampleRecordIds: { id: string; label: string }[];
    canProposeApproval: boolean;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [question, setQuestion] = useState(QUICK_PROMPTS[0]);
    const [result, setResult] = useState<ObjectCopilotInsightsResult | null>(null);

    // 4-eyes review proposal state
    const [showProposeForm, setShowProposeForm] = useState(false);
    const [selectedRecordId, setSelectedRecordId] = useState(sampleRecordIds[0]?.id || '');
    const [proposedStage, setProposedStage] = useState('APPROVED');
    const [proposalReason, setProposalReason] = useState('');

    const runCopilotQuery = (promptText: string) => {
        const clean = promptText.trim();
        if (!clean) {
            toast.error('Enter a question for Object Copilot.');
            return;
        }
        setQuestion(clean);
        startTransition(async () => {
            const res = await askObjectCopilotAction({
                objectApiName,
                question: clean,
            });
            if (res.success === false) {
                toast.error(res.error || 'Object Copilot could not answer.');
                return;
            }
            setResult(res);
        });
    };

    const handleProposeReview = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedRecordId.trim()) {
            toast.error('Enter or choose a record UUID.');
            return;
        }
        startTransition(async () => {
            const res = await proposeObjectCopilotApprovalAction({
                objectApiName,
                recordId: selectedRecordId.trim(),
                proposedStage,
                reason: proposalReason,
            });
            if (res.success === false) {
                toast.error(res.error || 'Could not queue approval proposal.');
                return;
            }
            toast.success(res.summary || '4-eyes approval request queued.');
            setProposalReason('');
            setShowProposeForm(false);
        });
    };

    return (
        <Card className="border-primary/20 bg-accent/15 shadow-sm" data-testid="object-copilot-bar">
            <CardContent className="p-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                        <div className="rounded-lg bg-primary/10 p-2 text-primary">
                            <Bot className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-foreground">
                                    Object Copilot — {objectLabel}
                                </span>
                                <Badge variant="outline" className="text-[10px] font-mono">
                                    OWD + FLS Grounded
                                </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Instant grounded KPI rollups, stage distributions, governance posture, and 4-eyes review proposals.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Link
                            href="/chat"
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Full AI Spine <ExternalLink className="w-3 h-3" />
                        </Link>
                        <Button
                            type="button"
                            size="sm"
                            variant={isOpen ? 'outline' : 'default'}
                            onClick={() => {
                                const next = !isOpen;
                                setIsOpen(next);
                                if (next && !result) {
                                    runCopilotQuery(question);
                                }
                            }}
                            data-testid="toggle-object-copilot-btn"
                            className="text-xs gap-1.5"
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                            {isOpen ? 'Hide Copilot' : 'Ask Object Copilot'}
                            {isOpen ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                            )}
                        </Button>
                    </div>
                </div>

                {isOpen && (
                    <div className="space-y-4 border-t border-border pt-4">
                        <div className="flex flex-wrap gap-1.5">
                            {QUICK_PROMPTS.map(preset => (
                                <button
                                    key={preset}
                                    type="button"
                                    disabled={isPending}
                                    onClick={() => runCopilotQuery(preset)}
                                    className="rounded-full border border-border bg-background px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                                >
                                    {preset}
                                </button>
                            ))}
                        </div>

                        <form
                            onSubmit={e => {
                                e.preventDefault();
                                runCopilotQuery(question);
                            }}
                            className="flex flex-col sm:flex-row gap-2"
                        >
                            <Input
                                value={question}
                                onChange={e => setQuestion(e.target.value)}
                                placeholder={`Ask about ${objectLabel.toLowerCase()} stages, totals, or approvals...`}
                                data-testid="object-copilot-question-input"
                                className="text-xs bg-background"
                            />
                            <Button
                                type="submit"
                                size="sm"
                                disabled={isPending}
                                data-testid="object-copilot-ask-btn"
                                className="text-xs gap-1.5 shrink-0"
                            >
                                <Sparkles className="w-3.5 h-3.5" />
                                {isPending ? 'Analyzing...' : 'Analyze'}
                            </Button>
                            {canProposeApproval && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setShowProposeForm(prev => !prev)}
                                    data-testid="object-copilot-open-propose-btn"
                                    className="text-xs gap-1.5 shrink-0"
                                >
                                    <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                                    Propose 4-Eyes Review
                                </Button>
                            )}
                        </form>

                        {result?.success && (
                            <div
                                className="rounded-lg border border-border bg-card p-4 space-y-3"
                                data-testid="object-copilot-answer-card"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-xs font-semibold text-primary">
                                        Grounded Insight Summary
                                    </span>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <Badge variant="outline" className="text-[10px]">
                                            {result.visibleRecordCount ?? 0} Visible Records
                                        </Badge>
                                        <Badge variant="outline" className="text-[10px]">
                                            {result.activeValidationRulesCount ?? 0} Validation Rules
                                        </Badge>
                                        <Badge variant="outline" className="text-[10px]">
                                            {result.pendingApprovalsCount ?? 0} Pending Approvals
                                        </Badge>
                                    </div>
                                </div>
                                <p className="text-xs text-foreground leading-relaxed">
                                    {result.answer}
                                </p>

                                {result.picklistDistributions &&
                                    result.picklistDistributions.length > 0 && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                            {result.picklistDistributions.map(dist => (
                                                <div
                                                    key={dist.fieldApiName}
                                                    className="rounded-md border border-border bg-muted/20 p-2.5 space-y-1.5"
                                                >
                                                    <span className="text-[11px] font-semibold text-foreground block">
                                                        {dist.fieldLabel} Distribution
                                                    </span>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {dist.buckets.map(b => (
                                                            <Badge
                                                                key={b.option}
                                                                variant="secondary"
                                                                className="text-[10px] font-mono"
                                                            >
                                                                {b.option}: {b.count}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                {result.numericRollups && result.numericRollups.length > 0 && (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
                                        {result.numericRollups.map(nr => (
                                            <div
                                                key={nr.fieldApiName}
                                                className="rounded-md border border-border bg-muted/20 p-2.5 text-xs"
                                            >
                                                <span className="text-[11px] text-muted-foreground block">
                                                    {nr.fieldLabel}
                                                </span>
                                                <span className="font-mono font-semibold text-foreground">
                                                    Sum: {nr.sum.toLocaleString()} · Avg:{' '}
                                                    {nr.avg.toLocaleString()}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {showProposeForm && canProposeApproval && (
                            <form
                                onSubmit={handleProposeReview}
                                className="rounded-lg border border-primary/30 bg-card p-4 space-y-3"
                                data-testid="object-copilot-propose-form"
                            >
                                <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                    <ShieldCheck className="w-4 h-4 text-primary" />
                                    Propose Governed 4-Eyes Stage Review (Queues to Approvals Spine)
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div className="space-y-1">
                                        <Label className="text-[11px]">Target Record</Label>
                                        {sampleRecordIds.length > 0 ? (
                                            <select
                                                value={selectedRecordId}
                                                onChange={e => setSelectedRecordId(e.target.value)}
                                                className="w-full h-9 rounded-md border border-border bg-background px-2.5 text-xs text-foreground"
                                            >
                                                {sampleRecordIds.map(item => (
                                                    <option key={item.id} value={item.id}>
                                                        {item.label} ({item.id.slice(0, 8)})
                                                    </option>
                                                ))}
                                            </select>
                                        ) : (
                                            <Input
                                                value={selectedRecordId}
                                                onChange={e => setSelectedRecordId(e.target.value)}
                                                placeholder="Record UUID"
                                                className="h-9 text-xs font-mono"
                                            />
                                        )}
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[11px]">Proposed Stage / Decision</Label>
                                        <Input
                                            value={proposedStage}
                                            onChange={e => setProposedStage(e.target.value)}
                                            placeholder="e.g. APPROVED"
                                            className="h-9 text-xs"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[11px]">Justification *</Label>
                                        <Input
                                            value={proposalReason}
                                            onChange={e => setProposalReason(e.target.value)}
                                            placeholder="Reason for approver review..."
                                            required
                                            className="h-9 text-xs"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setShowProposeForm(false)}
                                        className="text-xs"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        size="sm"
                                        disabled={isPending}
                                        className="text-xs gap-1.5"
                                    >
                                        <ShieldCheck className="w-3.5 h-3.5" />
                                        Queue 4-Eyes Approval
                                    </Button>
                                </div>
                            </form>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
