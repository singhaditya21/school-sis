'use client';

/**
 * @module app/(admin)/app/[object]/[id]/record-detail-client
 *
 * Salesforce Lightning Record Page Experience 2.0 + Education Cloud 360° Console (Track B):
 *   1. Interactive Stage Path Bar (`data-testid="record-stage-path"`) & SLA Countdown (`data-testid="record-sla-badge"`).
 *   2. Declarative Record Approval Bar (`data-testid="record-approval-bar"`).
 *   3. Omni-Channel Quick-Action Bar (`data-testid="record-quick-actions-bar"`) for Log Call / Counseling Note / Task & Clone Record.
 *   4. Potential Duplicate Detection & 1-Click Merge Banner (`data-testid="record-duplicate-banner"`).
 *   5. Chronological Activity & Field History Timeline (`data-testid="record-audit-timeline"`).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
    AlertTriangle,
    CheckCircle2,
    ChevronRight,
    Clock,
    Copy,
    Download,
    FileSignature,
    GitMerge,
    History,
    MessageSquarePlus,
    ShieldCheck,
    Timer,
    XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    cloneMetadataRecord,
    decideRecordApproval,
    generateRecordDocument,
    logRecordQuickActivity,
    mergeMetadataRecords,
    submitRecordForApproval,
    updateRecordFieldValue,
    type MetadataField,
    type RecordAuditTimelineEntry,
} from '@/lib/actions/metadata-engine';
import {
    computeRecordSlaStatus,
    type DuplicateMatchEntry,
} from '@/lib/metadata/platform';

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
    potentialDuplicates = [],
}: {
    objectName: string;
    recordId: string;
    fields: MetadataField[];
    recordData: Record<string, unknown>;
    potentialDuplicates?: DuplicateMatchEntry[];
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [approvalComment, setApprovalComment] = useState('');
    const [activityType, setActivityType] = useState<
        'CALL' | 'COUNSELING_NOTE' | 'FOLLOW_UP_TASK' | 'WHATSAPP_SENT'
    >('COUNSELING_NOTE');
    const [activitySubject, setActivitySubject] = useState('');
    const [activityNotes, setActivityNotes] = useState('');
    const [generatedDoc, setGeneratedDoc] = useState<{
        templateName: string;
        renderedBody: string;
        verificationCode: string;
        htmlDocument: string;
    } | null>(null);

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

    const slaStatus = computeRecordSlaStatus({
        createdAt: (recordData.created_at as string | Date | undefined) ?? null,
        currentStage,
        slaHours: 24,
    });

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

    const handleLogActivity = () => {
        if (!activitySubject.trim()) {
            toast.error('Enter an activity summary first');
            return;
        }
        startTransition(async () => {
            const res = await logRecordQuickActivity(objectName, recordId, {
                activityType,
                subject: activitySubject,
                notes: activityNotes,
            });
            if (!res.success) {
                toast.error(res.error || 'Failed to log activity');
                return;
            }
            setActivitySubject('');
            setActivityNotes('');
            toast.success('Activity added to 360° timeline.');
            router.refresh();
        });
    };

    const handleCloneRecord = () => {
        startTransition(async () => {
            const res = await cloneMetadataRecord(objectName, recordId);
            if (!res.success || !res.clonedRecordId) {
                toast.error(res.error || 'Failed to clone record');
                return;
            }
            toast.success('Record cloned! Opening cloned record...');
            router.push(`/app/${objectName}/${res.clonedRecordId}`);
        });
    };

    const handleMergeDuplicate = (duplicateRecordId: string) => {
        startTransition(async () => {
            const res = await mergeMetadataRecords(objectName, recordId, duplicateRecordId);
            if (!res.success) {
                toast.error(res.error || 'Failed to merge duplicate record');
                return;
            }
            toast.success('Duplicate record merged into this record.');
            router.refresh();
        });
    };

    const handleGenerateDocument = (templateId?: string) => {
        startTransition(async () => {
            const res = await generateRecordDocument(objectName, recordId, templateId);
            if (
                !res.success ||
                !res.renderedBody ||
                !res.verificationCode ||
                !res.htmlDocument
            ) {
                toast.error(res.error || 'Failed to generate document');
                return;
            }
            setGeneratedDoc({
                templateName: res.templateName || 'Official Document',
                renderedBody: res.renderedBody,
                verificationCode: res.verificationCode,
                htmlDocument: res.htmlDocument,
            });
            toast.success(`Generated "${res.templateName}" (${res.verificationCode})`);
            router.refresh();
        });
    };

    const handleDownloadHtmlDocument = () => {
        if (!generatedDoc || typeof window === 'undefined') return;
        const blob = new Blob([generatedDoc.htmlDocument], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${objectName}-${recordId.slice(0, 8)}-${generatedDoc.verificationCode}.html`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    };

    const slaBadgeColor =
        slaStatus.state === 'OVERDUE'
            ? 'bg-destructive-subtle text-destructive border-destructive/30'
            : slaStatus.state === 'AT_RISK'
              ? 'bg-warning-subtle text-warning border-warning/30'
              : slaStatus.state === 'COMPLETED'
                ? 'bg-success-subtle text-success border-success/30'
                : 'bg-info-subtle text-info border-info/30';

    return (
        <div className="space-y-4">
            {/* Duplicate Detection & 1-Click Merge Banner */}
            {potentialDuplicates.length > 0 && (
                <Card
                    className="border-warning/40 bg-warning-subtle/40 shadow-sm"
                    data-testid="record-duplicate-banner"
                >
                    <CardContent className="p-4 space-y-2.5">
                        <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="inline-flex items-center gap-1.5 font-semibold text-warning">
                                <AlertTriangle className="w-4 h-4" />
                                Potential Duplicate Records Detected ({potentialDuplicates.length})
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                                Merge consolidates blank fields &amp; child lookups into this record
                            </span>
                        </div>
                        <div className="space-y-1.5">
                            {potentialDuplicates.map((dup, idx) => (
                                <div
                                    key={`${dup.recordId}-${dup.fieldApiName}-${idx}`}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs"
                                >
                                    <div>
                                        <span className="font-mono text-muted-foreground mr-2">
                                            #{dup.recordId.slice(0, 8)}
                                        </span>
                                        <span className="font-medium text-foreground">
                                            Matched on {dup.fieldLabel}:{' '}
                                            <span className="font-mono text-primary">
                                                {dup.matchedValue}
                                            </span>
                                        </span>
                                    </div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={isPending}
                                        onClick={() => handleMergeDuplicate(dup.recordId)}
                                        data-testid="merge-duplicate-btn"
                                        className="h-7 text-xs gap-1"
                                    >
                                        <GitMerge className="w-3.5 h-3.5" />
                                        Merge Into This Record
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* 1. Salesforce Lightning Stage Path Bar + SLA Escalation Timer */}
            <Card className="border-border shadow-sm" data-testid="record-stage-path">
                <CardContent className="p-4 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                            {stageField ? `Stage Path · ${stageField.label}` : 'Record Lifecycle & SLA'}
                        </span>
                        <div className="flex items-center gap-2">
                            <span
                                data-testid="record-sla-badge"
                                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${slaBadgeColor}`}
                            >
                                <Timer className="w-3 h-3" />
                                {slaStatus.label}
                            </span>
                            {stageField && (
                                <span className="font-mono text-primary font-semibold">
                                    Current: {currentStage || 'Unset'}
                                </span>
                            )}
                        </div>
                    </div>
                    {stageField && stageOptions.length > 0 && (
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
                    )}
                </CardContent>
            </Card>

            {/* 2. Omni-Channel Quick-Action Bar (Log Call / Counseling Note / Task & Clone Record) */}
            <Card className="border-border shadow-sm" data-testid="record-quick-actions-bar">
                <CardContent className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs flex-1">
                        <MessageSquarePlus className="w-4 h-4 text-primary shrink-0" />
                        <Select
                            value={activityType}
                            onValueChange={val =>
                                setActivityType(
                                    val as
                                        | 'CALL'
                                        | 'COUNSELING_NOTE'
                                        | 'FOLLOW_UP_TASK'
                                        | 'WHATSAPP_SENT',
                                )
                            }
                        >
                            <SelectTrigger
                                className="h-8 text-xs w-40"
                                data-testid="quick-activity-type"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="COUNSELING_NOTE">Counseling Note</SelectItem>
                                <SelectItem value="CALL">Log a Call</SelectItem>
                                <SelectItem value="FOLLOW_UP_TASK">Follow-Up Task</SelectItem>
                                <SelectItem value="WHATSAPP_SENT">WhatsApp Logged</SelectItem>
                            </SelectContent>
                        </Select>
                        <Input
                            value={activitySubject}
                            onChange={e => setActivitySubject(e.target.value)}
                            placeholder="Subject (e.g. Discussed scholarship & hostel options)..."
                            data-testid="quick-activity-subject"
                            className="h-8 text-xs flex-1 min-w-[180px]"
                        />
                        <Input
                            value={activityNotes}
                            onChange={e => setActivityNotes(e.target.value)}
                            placeholder="Optional outcome notes..."
                            className="h-8 text-xs w-44"
                        />
                        <Button
                            type="button"
                            size="sm"
                            disabled={isPending}
                            onClick={handleLogActivity}
                            data-testid="log-quick-activity-btn"
                            className="h-8 text-xs"
                        >
                            Log Activity
                        </Button>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isPending}
                            onClick={handleCloneRecord}
                            data-testid="clone-record-btn"
                            className="h-8 text-xs gap-1"
                        >
                            <Copy className="w-3.5 h-3.5" />
                            Clone Record
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* 3. Declarative Record Approval Bar */}
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

            {/* 4. Track E: 1-Click OmniStudio Document & Certificate Generator */}
            <Card className="border-border shadow-sm" data-testid="record-docgen-bar">
                <CardContent className="p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs">
                            <FileSignature className="w-4 h-4 text-primary shrink-0" />
                            <span className="font-semibold text-foreground">
                                OmniStudio Document &amp; Certificate Generator
                            </span>
                            <span className="text-muted-foreground hidden md:inline">
                                Merge live record fields into verified Offer Letters &amp; Bonafide Certificates
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isPending}
                                onClick={() => handleGenerateDocument('default-offer-letter')}
                                data-testid="generate-record-doc-btn"
                                className="h-8 text-xs gap-1.5"
                            >
                                <FileSignature className="w-3.5 h-3.5" />
                                Generate Offer Letter
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isPending}
                                onClick={() =>
                                    handleGenerateDocument('default-bonafide-certificate')
                                }
                                data-testid="generate-bonafide-doc-btn"
                                className="h-8 text-xs gap-1.5"
                            >
                                <FileSignature className="w-3.5 h-3.5" />
                                Generate Certificate
                            </Button>
                        </div>
                    </div>

                    {generatedDoc && (
                        <div
                            className="rounded-lg border border-primary/30 bg-muted/30 p-4 space-y-2.5 text-xs"
                            data-testid="generated-doc-preview"
                        >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-foreground">
                                        {generatedDoc.templateName}
                                    </span>
                                    <Badge
                                        variant="outline"
                                        className="font-mono text-[10px] bg-success-subtle text-success border-success/30"
                                    >
                                        Verified: {generatedDoc.verificationCode}
                                    </Badge>
                                </div>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={handleDownloadHtmlDocument}
                                    data-testid="download-generated-doc-btn"
                                    className="h-7 text-xs gap-1"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    Download Printable Document
                                </Button>
                            </div>
                            <pre className="whitespace-pre-wrap rounded border border-border bg-background p-3 font-sans text-xs text-foreground leading-relaxed">
                                {generatedDoc.renderedBody}
                            </pre>
                        </div>
                    )}
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
