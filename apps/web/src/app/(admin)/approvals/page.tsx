'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    Clock3,
    RefreshCw,
    ShieldCheck,
    XCircle,
} from 'lucide-react';

type WorkflowApprovalStatus =
    | 'PENDING'
    | 'ESCALATED'
    | 'APPROVED'
    | 'REJECTED'
    | 'CANCELLED'
    | 'EXPIRED';

type WorkflowApproval = {
    id: string;
    title: string;
    description: string;
    policyId: string;
    resourceType: string;
    resourceId?: string;
    status: WorkflowApprovalStatus;
    requestedByRole: string;
    requiredApproverRoles: string[];
    approvalsReceived: number;
    approvalsRequired: number;
    dueAt: string;
    expiresAt: string;
    isOverdue: boolean;
    createdAt: string;
    completedAt?: string;
    priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
};

type ApprovalResponse = {
    approvals: WorkflowApproval[];
};

type StatusFilter = WorkflowApprovalStatus | 'ALL';

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
    { label: 'Pending', value: 'PENDING' },
    { label: 'Escalated', value: 'ESCALATED' },
    { label: 'Approved', value: 'APPROVED' },
    { label: 'Rejected', value: 'REJECTED' },
    { label: 'All', value: 'ALL' },
];

function priorityClass(priority: WorkflowApproval['priority']) {
    if (priority === 'CRITICAL') return 'bg-red-50 text-red-700 border-red-200';
    if (priority === 'HIGH') return 'bg-amber-50 text-amber-700 border-amber-200';
    if (priority === 'LOW') return 'bg-slate-50 text-slate-600 border-slate-200';
    return 'bg-blue-50 text-blue-700 border-blue-200';
}

function statusClass(status: WorkflowApprovalStatus) {
    if (status === 'APPROVED') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (status === 'REJECTED' || status === 'CANCELLED' || status === 'EXPIRED') {
        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
    if (status === 'ESCALATED') return 'bg-red-50 text-red-700 border-red-200';
    return 'bg-amber-50 text-amber-700 border-amber-200';
}

function formatDate(value: string) {
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value));
}

function canReview(status: WorkflowApprovalStatus) {
    return status === 'PENDING' || status === 'ESCALATED';
}

export default function ApprovalsPage() {
    const [approvals, setApprovals] = useState<WorkflowApproval[]>([]);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING');
    const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [submittingId, setSubmittingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const query = useMemo(() => {
        const params = new URLSearchParams({ limit: '100' });
        if (statusFilter !== 'ALL') params.set('status', statusFilter);
        return params.toString();
    }, [statusFilter]);

    const fetchApprovals = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/workflow-approvals?${query}`, { cache: 'no-store' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Failed to fetch approvals');
            setApprovals(((data as ApprovalResponse).approvals || []) as WorkflowApproval[]);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch approvals');
        } finally {
            setLoading(false);
        }
    }, [query]);

    useEffect(() => {
        void fetchApprovals();
    }, [fetchApprovals]);

    const handleReview = async (approvalId: string, decision: 'APPROVED' | 'REJECTED') => {
        setSubmittingId(approvalId);
        setNotice(null);
        setError(null);
        try {
            const res = await fetch(`/api/workflow-approvals/${encodeURIComponent(approvalId)}/review`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    decision,
                    reason: reviewReasons[approvalId]?.trim() || undefined,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Failed to review approval');

            setReviewReasons((current) => {
                const next = { ...current };
                delete next[approvalId];
                return next;
            });
            setNotice(decision === 'APPROVED' ? 'Approval recorded.' : 'Rejection recorded.');
            await fetchApprovals();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to review approval');
        } finally {
            setSubmittingId(null);
        }
    };

    return (
        <div className="mx-auto max-w-7xl p-6 lg:p-8">
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-950">Workflow Approvals</h1>
                    <p className="mt-1 text-sm text-slate-500">Tenant-scoped approval queue</p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => void fetchApprovals()}
                        className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={loading}
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>
            </div>

            <div className="mb-5 flex flex-wrap gap-2">
                {STATUS_FILTERS.map((filter) => (
                    <button
                        key={filter.value}
                        type="button"
                        onClick={() => setStatusFilter(filter.value)}
                        className={`h-9 rounded-md border px-3 text-sm font-medium transition ${
                            statusFilter === filter.value
                                ? 'border-slate-950 bg-slate-950 text-white'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                        {filter.label}
                    </button>
                ))}
            </div>

            {notice && (
                <div className="mb-4 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    <ShieldCheck className="h-4 w-4" />
                    {notice}
                </div>
            )}

            {error && (
                <div className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    <AlertTriangle className="h-4 w-4" />
                    {error}
                </div>
            )}

            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="grid grid-cols-[minmax(280px,1.4fr)_minmax(180px,.8fr)_minmax(180px,.7fr)_minmax(260px,1fr)] border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 max-xl:hidden">
                    <div>Request</div>
                    <div>Policy</div>
                    <div>Timing</div>
                    <div>Review</div>
                </div>

                {loading ? (
                    <div className="flex items-center gap-3 px-4 py-10 text-sm text-slate-500">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Loading approval queue...
                    </div>
                ) : approvals.length === 0 ? (
                    <div className="px-4 py-12 text-center">
                        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
                        <h2 className="mt-3 text-base font-semibold text-slate-950">No approvals found</h2>
                        <p className="mt-1 text-sm text-slate-500">Change the status filter to view other workflow states.</p>
                    </div>
                ) : (
                    approvals.map((approval) => (
                        <div
                            key={approval.id}
                            className="grid grid-cols-1 gap-4 border-b border-slate-100 px-4 py-4 last:border-b-0 xl:grid-cols-[minmax(280px,1.4fr)_minmax(180px,.8fr)_minmax(180px,.7fr)_minmax(260px,1fr)]"
                        >
                            <div className="min-w-0">
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${priorityClass(approval.priority)}`}>
                                        {approval.priority}
                                    </span>
                                    <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${statusClass(approval.status)}`}>
                                        {approval.status}
                                    </span>
                                    {approval.isOverdue && (
                                        <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                                            OVERDUE
                                        </span>
                                    )}
                                </div>
                                <h2 className="truncate text-base font-semibold text-slate-950">{approval.title}</h2>
                                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{approval.description}</p>
                                <div className="mt-2 text-xs text-slate-500">
                                    Resource: {approval.resourceType}
                                    {approval.resourceId ? ` / ${approval.resourceId}` : ''}
                                </div>
                            </div>

                            <div className="text-sm text-slate-700">
                                <div className="font-medium text-slate-950">{approval.policyId}</div>
                                <div className="mt-1 text-xs text-slate-500">
                                    Requested by {approval.requestedByRole}
                                </div>
                                <div className="mt-2 text-xs text-slate-500">
                                    {approval.approvalsReceived}/{approval.approvalsRequired} approvals
                                </div>
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {approval.requiredApproverRoles.map((role) => (
                                        <span key={role} className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                                            {role}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div className="text-sm text-slate-700">
                                <div className="flex items-center gap-2">
                                    <Clock3 className="h-4 w-4 text-slate-400" />
                                    Due {formatDate(approval.dueAt)}
                                </div>
                                <div className="mt-2 text-xs text-slate-500">
                                    Expires {formatDate(approval.expiresAt)}
                                </div>
                                {approval.completedAt && (
                                    <div className="mt-2 text-xs text-slate-500">
                                        Completed {formatDate(approval.completedAt)}
                                    </div>
                                )}
                            </div>

                            <div>
                                {canReview(approval.status) ? (
                                    <div className="space-y-3">
                                        <textarea
                                            value={reviewReasons[approval.id] || ''}
                                            onChange={(event) => setReviewReasons((current) => ({
                                                ...current,
                                                [approval.id]: event.target.value,
                                            }))}
                                            className="min-h-20 w-full resize-y rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                                            maxLength={1000}
                                            placeholder="Review note"
                                        />
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => void handleReview(approval.id, 'APPROVED')}
                                                disabled={submittingId === approval.id}
                                                className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                <CheckCircle2 className="h-4 w-4" />
                                                Approve
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void handleReview(approval.id, 'REJECTED')}
                                                disabled={submittingId === approval.id}
                                                className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                <XCircle className="h-4 w-4" />
                                                Reject
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                                        {approval.status}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
