'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency } from '@/lib/utils';

/**
 * Correction affordances for a counter-entry mistake: waive the outstanding
 * balance, or cancel the invoice outright.
 *
 * Both are approval-gated server side (`fees.invoice.waive` /
 * `fees.invoice.cancel`). The first submit almost always only FILES an approval
 * request (HTTP 202) — no money has moved at that point. The invoice is changed
 * only when the same route is called again with the id of an approval that a
 * finance lead or administrator has since approved (HTTP 200, EXECUTED).
 * Those two outcomes are reported differently on purpose.
 */

type CorrectionAction = 'WAIVE' | 'CANCEL';

type ApprovalStatus = 'PENDING' | 'ESCALATED' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';

type ApprovalSummary = {
    id: string;
    policyId: string;
    title: string;
    description: string;
    status: ApprovalStatus;
    approvalsReceived: number;
    approvalsRequired: number;
    requiredApproverRoles: string[];
    dueAt: string;
    isOverdue: boolean;
    createdAt: string;
};

/** Mirrors FINANCE_APPROVAL_POLICIES in @/lib/finance/approval-execution. */
const POLICY_ID: Record<CorrectionAction, string> = {
    WAIVE: 'fees.invoice.waive',
    CANCEL: 'fees.invoice.cancel',
};

const ROUTE_SEGMENT: Record<CorrectionAction, string> = {
    WAIVE: 'waive',
    CANCEL: 'cancel',
};

/** Approval resource type used by the finance routes. */
const APPROVAL_RESOURCE_TYPE = 'fees.invoice';

/** Statuses worth surfacing on the invoice; the rest are noise. */
const VISIBLE_APPROVAL_STATUSES = new Set<ApprovalStatus>(['PENDING', 'ESCALATED', 'APPROVED', 'REJECTED']);

const APPROVAL_STATUSES = new Set<ApprovalStatus>([
    'PENDING',
    'ESCALATED',
    'APPROVED',
    'REJECTED',
    'CANCELLED',
    'EXPIRED',
]);

const ACTION_LABEL: Record<CorrectionAction, { noun: string; request: string; apply: string }> = {
    WAIVE: { noun: 'waiver', request: 'Submit waiver request', apply: 'Apply approved waiver' },
    CANCEL: { noun: 'cancellation', request: 'Submit cancellation request', apply: 'Apply approved cancellation' },
};

type DialogState = {
    action: CorrectionAction;
    /** Set when completing an already-approved request rather than filing a new one. */
    approval?: ApprovalSummary;
    reason: string;
};

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

async function readJsonBody(response: Response): Promise<Record<string, unknown>> {
    try {
        return asRecord(await response.json());
    } catch {
        return {};
    }
}

function asString(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback;
}

function asCount(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asApprovalStatus(value: unknown): ApprovalStatus | null {
    return typeof value === 'string' && APPROVAL_STATUSES.has(value as ApprovalStatus)
        ? (value as ApprovalStatus)
        : null;
}

function toApprovalSummary(value: unknown): ApprovalSummary | null {
    const raw = asRecord(value);
    const id = asString(raw.id);
    const policyId = asString(raw.policyId);
    const status = asApprovalStatus(raw.status);
    if (!id || !status) return null;
    if (policyId !== POLICY_ID.WAIVE && policyId !== POLICY_ID.CANCEL) return null;

    const roles = Array.isArray(raw.requiredApproverRoles)
        ? raw.requiredApproverRoles.filter((role): role is string => typeof role === 'string')
        : [];

    return {
        id,
        policyId,
        title: asString(raw.title, 'Invoice correction'),
        description: asString(raw.description),
        status,
        approvalsReceived: asCount(raw.approvalsReceived),
        approvalsRequired: Math.max(1, asCount(raw.approvalsRequired)),
        requiredApproverRoles: roles,
        dueAt: asString(raw.dueAt),
        isOverdue: raw.isOverdue === true,
        createdAt: asString(raw.createdAt),
    };
}

function actionOfApproval(approval: ApprovalSummary): CorrectionAction {
    return approval.policyId === POLICY_ID.WAIVE ? 'WAIVE' : 'CANCEL';
}

/**
 * The approval summary does not carry the payload, but the server builds the
 * description as `… Reason: <reason>`. Re-executing an approved request has to
 * send back the identical reason, otherwise the payload hash check rejects it.
 */
function reasonFromDescription(description: string): string {
    const marker = 'Reason: ';
    const index = description.indexOf(marker);
    if (index < 0) return '';
    return description.slice(index + marker.length).trim();
}

function formatTimestamp(value: string): string {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function statusVariant(status: ApprovalStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
    if (status === 'APPROVED') return 'default';
    if (status === 'REJECTED') return 'destructive';
    if (status === 'ESCALATED') return 'destructive';
    return 'secondary';
}

export function InvoiceCorrection({
    invoiceId,
    invoiceNumber,
    status,
    totalAmount,
    paidAmount,
}: {
    invoiceId: string;
    invoiceNumber: string;
    status: string;
    totalAmount: number;
    paidAmount: number;
}) {
    const router = useRouter();
    const [approvals, setApprovals] = useState<ApprovalSummary[]>([]);
    const [approvalsLoaded, setApprovalsLoaded] = useState(false);
    const [approvalsError, setApprovalsError] = useState('');
    const [dialog, setDialog] = useState<DialogState | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const outstandingMinor = Math.max(0, Math.round((totalAmount - paidAmount) * 100));
    const paidMinor = Math.round(paidAmount * 100);

    // Mirrors assertInvoiceWaivable / assertInvoiceCancellable on the server.
    const canWaive = ['PENDING', 'PARTIAL', 'OVERDUE'].includes(status) && outstandingMinor > 0;
    const canCancel = ['DRAFT', 'PENDING'].includes(status) && paidMinor <= 0;

    const loadApprovals = useCallback(async () => {
        try {
            const response = await fetch(
                `/api/workflow-approvals?resourceType=${APPROVAL_RESOURCE_TYPE}&resourceId=${encodeURIComponent(invoiceId)}&limit=20`,
                { credentials: 'same-origin', cache: 'no-store' },
            );
            const body = await readJsonBody(response);
            if (!response.ok) {
                setApprovalsError(asString(body.error, 'Could not load correction approvals.'));
                setApprovalsLoaded(true);
                return;
            }

            const list = Array.isArray(body.approvals) ? body.approvals : [];
            const parsed = list
                .map(toApprovalSummary)
                .filter((item): item is ApprovalSummary => item !== null)
                .filter((item) => VISIBLE_APPROVAL_STATUSES.has(item.status))
                .slice(0, 5);

            setApprovals(parsed);
            setApprovalsError('');
        } catch {
            setApprovalsError('Could not load correction approvals.');
        }
        setApprovalsLoaded(true);
    }, [invoiceId]);

    useEffect(() => {
        void loadApprovals();
    }, [loadApprovals]);

    async function handleConfirm() {
        if (!dialog || submitting) return;

        const reason = dialog.reason.trim();
        if (reason.length < 3) {
            toast.error('Give an audit reason of at least 3 characters.');
            return;
        }

        const { action, approval } = dialog;
        const labels = ACTION_LABEL[action];
        setSubmitting(true);

        try {
            const response = await fetch(`/api/finance/invoices/${invoiceId}/${ROUTE_SEGMENT[action]}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(approval ? { reason, approvalRequestId: approval.id } : { reason }),
            });
            const body = await readJsonBody(response);

            if (response.ok && body.status === 'EXECUTED') {
                const amount = Number(asString(body.amount, '0'));
                toast.success(
                    action === 'WAIVE'
                        ? `Invoice ${invoiceNumber} waived. ${formatCurrency(Number.isFinite(amount) ? amount : 0)} written off.`
                        : `Invoice ${invoiceNumber} cancelled.`,
                    { duration: 8000 },
                );
                setDialog(null);
                await loadApprovals();
                router.refresh();
                return;
            }

            if (body.status === 'APPROVAL_REQUIRED') {
                const pending = toApprovalSummary(body.approval);
                if (response.status === 202) {
                    // 202 = filed, not done. Never dress this up as a completed correction.
                    toast.warning(
                        `${labels.noun === 'waiver' ? 'Waiver' : 'Cancellation'} submitted for approval. Invoice ${invoiceNumber} is unchanged until an approver signs off.`,
                        { duration: 10000 },
                    );
                } else {
                    toast.error(
                        `Not applied — the approval request is ${pending ? pending.status : 'no longer actionable'}. Invoice ${invoiceNumber} is unchanged.`,
                        { duration: 10000 },
                    );
                }
                setDialog(null);
                await loadApprovals();
                return;
            }

            toast.error(asString(body.error, `Could not submit the ${labels.noun}.`));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : `Could not submit the ${labels.noun}.`);
        } finally {
            setSubmitting(false);
        }
    }

    function openRequest(action: CorrectionAction) {
        setDialog({ action, reason: '' });
    }

    function openApply(approval: ApprovalSummary) {
        setDialog({
            action: actionOfApproval(approval),
            approval,
            reason: reasonFromDescription(approval.description),
        });
    }

    const dialogLabels = dialog ? ACTION_LABEL[dialog.action] : null;
    const applying = Boolean(dialog?.approval);
    const reasonLocked = applying;

    return (
        <div className="space-y-4" data-testid="invoice-correction">
            {!canWaive && !canCancel ? (
                <p className="text-sm text-muted-foreground">
                    Invoice status <span className="font-medium">{status}</span> cannot be waived or cancelled.
                    {paidMinor > 0
                        ? ' Money already collected has to be refunded before the invoice can be voided.'
                        : ''}
                </p>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-lg border p-4">
                        <p className="font-medium">Waive the balance</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Writes off the {formatCurrency(outstandingMinor / 100)} still outstanding and closes the
                            invoice as waived. Payments already taken stay on the record.
                        </p>
                        <Button
                            className="mt-3"
                            variant="outline"
                            data-testid="waive-invoice"
                            disabled={!canWaive}
                            onClick={() => openRequest('WAIVE')}
                        >
                            Waive balance
                        </Button>
                        {!canWaive && (
                            <p className="mt-2 text-xs text-muted-foreground">
                                Not available for a {status.toLowerCase()} invoice with no outstanding balance.
                            </p>
                        )}
                    </div>

                    <div className="rounded-lg border p-4">
                        <p className="font-medium">Cancel the invoice</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Voids the whole {formatCurrency(totalAmount)} invoice. Only possible while nothing has been
                            collected against it.
                        </p>
                        <Button
                            className="mt-3"
                            variant="outline"
                            data-testid="cancel-invoice"
                            disabled={!canCancel}
                            onClick={() => openRequest('CANCEL')}
                        >
                            Cancel invoice
                        </Button>
                        {!canCancel && (
                            <p className="mt-2 text-xs text-muted-foreground">
                                {paidMinor > 0
                                    ? 'Payments have been collected — refund them first.'
                                    : `Not available for a ${status.toLowerCase()} invoice.`}
                            </p>
                        )}
                    </div>
                </div>
            )}

            <div className="space-y-2">
                <p className="text-sm font-medium">Approval trail</p>
                {approvalsError ? (
                    <p className="text-sm text-muted-foreground">{approvalsError}</p>
                ) : !approvalsLoaded ? (
                    <p className="text-sm text-muted-foreground">Checking for correction approvals…</p>
                ) : approvals.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No waiver or cancellation has been requested for this invoice.
                    </p>
                ) : (
                    <ul className="space-y-2" data-testid="correction-approvals">
                        {approvals.map((approval) => {
                            const action = actionOfApproval(approval);
                            const eligible = action === 'WAIVE' ? canWaive : canCancel;
                            const reason = reasonFromDescription(approval.description);
                            const canApply = approval.status === 'APPROVED' && eligible && reason.length >= 3;

                            return (
                                <li key={approval.id} className="rounded-lg border p-3 text-sm">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant={statusVariant(approval.status)}>{approval.status}</Badge>
                                        <span className="font-medium">{approval.title}</span>
                                        {approval.isOverdue && approval.status !== 'APPROVED' && (
                                            <Badge variant="outline">Overdue</Badge>
                                        )}
                                    </div>
                                    {reason && (
                                        <p className="mt-1 text-muted-foreground">Reason: {reason}</p>
                                    )}
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {approval.approvalsReceived}/{approval.approvalsRequired} approvals ·
                                        {' '}requested {formatTimestamp(approval.createdAt)} · due {formatTimestamp(approval.dueAt)}
                                        {approval.requiredApproverRoles.length > 0
                                            ? ` · approver: ${approval.requiredApproverRoles.join(', ')}`
                                            : ''}
                                    </p>
                                    <div className="mt-2 flex flex-wrap items-center gap-3">
                                        {canApply && (
                                            <Button
                                                size="sm"
                                                data-testid="apply-approved-correction"
                                                onClick={() => openApply(approval)}
                                            >
                                                {ACTION_LABEL[action].apply}
                                            </Button>
                                        )}
                                        {approval.status === 'APPROVED' && !canApply && (
                                            <span className="text-xs text-muted-foreground">
                                                {eligible
                                                    ? 'Reason could not be recovered — file a fresh request to apply it.'
                                                    : 'Approved, but the invoice is no longer in a state this can be applied to.'}
                                            </span>
                                        )}
                                        {(approval.status === 'PENDING' || approval.status === 'ESCALATED') && (
                                            <span className="text-xs text-muted-foreground">
                                                Waiting on an approver — nothing has changed on this invoice yet.
                                            </span>
                                        )}
                                        <Link href="/approvals" className="text-xs underline">
                                            Open approvals queue
                                        </Link>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open && !submitting) setDialog(null); }}>
                <DialogContent>
                    {dialog && dialogLabels && (
                        <>
                            <DialogHeader>
                                <DialogTitle>
                                    {applying
                                        ? dialogLabels.apply
                                        : dialog.action === 'WAIVE'
                                            ? `Waive ${formatCurrency(outstandingMinor / 100)} on ${invoiceNumber}?`
                                            : `Cancel invoice ${invoiceNumber}?`}
                                </DialogTitle>
                                <DialogDescription>
                                    {applying
                                        ? `This applies the approved ${dialogLabels.noun} now. The invoice changes as soon as you confirm.`
                                        : dialog.action === 'WAIVE'
                                            ? `This does not change the invoice yet. It files a waiver request for ${formatCurrency(outstandingMinor / 100)}; a finance lead or administrator has to approve it before the balance is written off.`
                                            : 'This does not change the invoice yet. It files a cancellation request; a finance lead or administrator has to approve it before the invoice is voided.'}
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-2">
                                <Label htmlFor="correction-reason">Reason (kept in the money audit trail)</Label>
                                <Textarea
                                    id="correction-reason"
                                    data-testid="correction-reason"
                                    rows={3}
                                    value={dialog.reason}
                                    readOnly={reasonLocked}
                                    onChange={(event) =>
                                        setDialog((current) =>
                                            current ? { ...current, reason: event.target.value } : current,
                                        )
                                    }
                                    placeholder="e.g. Counter entry duplicated on 12 Aug; sibling concession applied late."
                                />
                                <p className="text-xs text-muted-foreground">
                                    {reasonLocked
                                        ? 'Locked to the reason the approver signed off on — changing it would invalidate the approval.'
                                        : 'At least 3 characters. This is shown to the approver and stored against the invoice.'}
                                </p>
                            </div>

                            <DialogFooter>
                                <Button
                                    variant="outline"
                                    onClick={() => setDialog(null)}
                                    disabled={submitting}
                                >
                                    Keep invoice as is
                                </Button>
                                <Button
                                    data-testid="confirm-correction"
                                    onClick={handleConfirm}
                                    disabled={submitting || dialog.reason.trim().length < 3}
                                >
                                    {submitting
                                        ? 'Working…'
                                        : applying
                                            ? dialogLabels.apply
                                            : dialogLabels.request}
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
