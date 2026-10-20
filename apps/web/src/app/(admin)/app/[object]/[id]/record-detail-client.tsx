'use client';

/**
 * @module app/(admin)/app/[object]/[id]/record-detail-client
 *
 * Salesforce Lightning Record Page Experience 2.0:
 *   1. Interactive Stage Path Bar (`data-testid="record-stage-path"`) for 1-click stage advancement.
 *   2. Declarative Record Approval Bar (`data-testid="record-approval-bar"`) for Submit / Approve / Reject.
 *   3. Chronological Activity & Field History Timeline (`data-testid="record-audit-timeline"`).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
    CheckCircle2,
    ChevronRight,
    Clock,
    History,
    ShieldCheck,
    XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    decideRecordApproval,
    submitRecordForApproval,
    updateRecordFieldValue,
    type MetadataField,
    type RecordAuditTimelineEntry,
} from '@/lib/actions/metadata-engine';

const STAGE_FIELD_PRIORITY = [
    'pipeline_stage',
    'drive_stage',
    'resolution_status',
    'approval_status',
    'academic_standing',
    'batch_status',
    'status',
];

export function RecordExperienceHeader({
    objectName,
    recordId,
    fields,
    recordData,
}: {
    objectName: string;
    recordId: string;
    fields: MetadataField[];
    recordData: Record<string, unknown>;
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [approvalComment, setApprovalComment] = useState('');

    // Resolve primary stage picklist field for the Lightning Path Bar
    const stageField =
        STAGE_FIELD_PRIORITY.map(api =>
            fields.find(
                f =>
                    f.apiName === api &&
                    f.dataType === 'PICKLIST' &&
                    Array.isArray(f.picklistOptions) &&
                    f.picklistOptions.length > 0,
            ),
        ).find(Boolean) ||
        fields.find(
            f =>
                f.dataType === 'PICKLIST' &&
                Array.isArray(f.picklistOptions) &&
                f.picklistOptions.length > 0,
        );

    const stageOptions = stageField?.picklistOptions || [];
    const currentStage = stageField ? String(recordData[stageField.apiName] ?? '') : '';
    const currentStageIdx = stageOptions.indexOf(currentStage);

    const handleAdvanceStage = (nextStage: string) => {
        if (!stageField || nextStage === currentStage) return;
        startTransition(async () => {
            const res = await updateRecordFieldValue(
                objectName,
                recordId,
                stageField.apiName,
                nextStage,
            );
            if (!res.success) {
                toast.error(res.error || 'Could not update stage');
                return;
            }
            toast.success(`${stageField.label} advanced to ${nextStage}`);
            router.refresh();
        });
    };

    const handleSubmitApproval = () => {
        startTransition(async () => {
            const res = await submitRecordForApproval(objectName, recordId, approvalComment);
            if (!res.success) {
                toast.error(res.error || 'Approval submission failed');
                return;
            }
            setApprovalComment('');
            toast.success('Record submitted for approval.');
            router.refresh();
        });
    };

    const handleDecision = (decision: 'APPROVED' | 'REJECTED') => {
        startTransition(async () => {
            const res = await decideRecordApproval(
                objectName,
                recordId,
                decision,
                approvalComment,
            );
            if (!res.success) {
                toast.error(res.error || 'Decision failed');
                return;
            }
            setApprovalComment('');
            toast.success(`Record marked ${decision.toLowerCase()}.`);
            router.refresh();
        });
    };

    return (
        <div className="space-y-4">
            {/* 1. Salesforce Lightning Stage Path Bar */}
            {stageField && stageOptions.length > 0 && (
                <Card className="border-border shadow-sm" data-testid="record-stage-path">
                    <CardContent className="p-4 space-y-2.5">
                        <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                                Stage Path · {stageField.label}
                            </span>
                            <span className="font-mono text-primary font-semibold">
                                Current: {currentStage || 'Unset'}
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                            {stageOptions.map((option, idx) => {
                                const isCurrent = option === currentStage;
                                const isCompleted =
                                    currentStageIdx >= 0 && idx < currentStageIdx;
                                return (
                                    <button
                                        key={option}
                                        type="button"
                                        disabled={isPending}
                                        onClick={() => handleAdvanceStage(option)}
                                        data-testid={`stage-step-${option}`}
                                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
                                            isCurrent
                                                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                                : isCompleted
                                                  ? 'bg-success-subtle text-success border-success/30 hover:bg-success-subtle/80'
                                                  : 'bg-muted/60 text-muted-foreground border-border hover:text-foreground'
                                        }`}
                                    >
                                        {isCompleted && <CheckCircle2 className="w-3 h-3" />}
                                        <span>{option.replace(/_/g, ' ')}</span>
                                        {idx < stageOptions.length - 1 && (
                                            <ChevronRight className="w-3 h-3 opacity-60" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* 2. Declarative Record Approval Bar */}
            <Card className="border-border shadow-sm" data-testid="record-approval-bar">
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs">
                        <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                        <span className="font-semibold text-foreground">
                            Approval Process
                        </span>
                        <Input
                            value={approvalComment}
                            onChange={e => setApprovalComment(e.target.value)}
                            placeholder="Optional approval or review note..."
                            className="h-8 text-xs w-56 sm:w-64"
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isPending}
                            onClick={handleSubmitApproval}
                            data-testid="submit-record-approval"
                            className="h-8 text-xs"
                        >
                            Submit for Approval
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isPending}
                            onClick={() => handleDecision('APPROVED')}
                            data-testid="approve-record-btn"
                            className="h-8 text-xs text-success border-success/30 hover:bg-success-subtle"
                        >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                            Approve
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isPending}
                            onClick={() => handleDecision('REJECTED')}
                            data-testid="reject-record-btn"
                            className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive-subtle"
                        >
                            <XCircle className="w-3.5 h-3.5 mr-1" />
                            Reject
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export function RecordAuditTimelineCard({
    timeline,
}: {
    timeline: RecordAuditTimelineEntry[];
}) {
    return (
        <Card data-testid="record-audit-timeline">
            <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                    <History className="w-4 h-4 text-primary" />
                    Activity &amp; Audit History Timeline
                </CardTitle>
            </CardHeader>
            <CardContent>
                {timeline.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                        No audit or workflow activity recorded for this record yet.
                    </p>
                ) : (
                    <div className="space-y-2.5">
                        {timeline.map(entry => (
                            <div
                                key={entry.id}
                                className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3 text-xs"
                            >
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="font-mono text-[10px]">
                                            {entry.action}
                                        </Badge>
                                        <span className="font-medium text-foreground">
                                            {entry.summary}
                                        </span>
                                    </div>
                                </div>
                                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground font-mono shrink-0">
                                    <Clock className="w-3 h-3" />
                                    {new Date(entry.createdAt).toLocaleString()}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
