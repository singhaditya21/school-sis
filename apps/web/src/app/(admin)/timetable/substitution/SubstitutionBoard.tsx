'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    listFreeTeachersForSlot,
    resolveSubstitutionRequest,
    submitSubstitutionRequest,
} from '../_actions/substitution';
import type {
    AbsentTeacher,
    CoverObligation,
    SubstitutionRequestRow,
    TeacherOption,
} from '../_actions/substitution';
import type { GridPeriod, GridSectionOption } from '../_actions/grid';

interface RequestDraft {
    teacherId: string;
    sectionId: string;
    periodOrder: string;
    reason: string;
    substituteId: string;
}

const EMPTY_DRAFT: RequestDraft = {
    teacherId: '',
    sectionId: '',
    periodOrder: '',
    reason: '',
    substituteId: '',
};

function statusBadge(status: string) {
    if (status === 'pending') return <Badge className="bg-yellow-500">Pending</Badge>;
    if (status === 'approved') return <Badge className="bg-green-600">Approved</Badge>;
    if (status === 'rejected') return <Badge className="bg-red-600">Rejected</Badge>;
    return <Badge variant="outline">{status}</Badge>;
}

export default function SubstitutionBoard({
    date,
    isTimetabledDay,
    absentTeachers,
    obligationsByTeacher,
    teachers,
    requests,
    periods,
    sections,
}: {
    date: string;
    isTimetabledDay: boolean;
    absentTeachers: AbsentTeacher[];
    obligationsByTeacher: Record<string, CoverObligation[]>;
    teachers: TeacherOption[];
    requests: SubstitutionRequestRow[];
    periods: GridPeriod[];
    sections: GridSectionOption[];
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const [showCreate, setShowCreate] = useState(false);
    const [draft, setDraft] = useState<RequestDraft>(EMPTY_DRAFT);
    const [candidates, setCandidates] = useState<TeacherOption[]>([]);
    const [candidatesLoading, setCandidatesLoading] = useState(false);
    const [formError, setFormError] = useState('');
    const [banner, setBanner] = useState('');
    const [bannerError, setBannerError] = useState('');

    const [decisionTarget, setDecisionTarget] = useState<SubstitutionRequestRow | null>(null);
    const [decisionSubstitute, setDecisionSubstitute] = useState('');
    const [decisionCandidates, setDecisionCandidates] = useState<TeacherOption[]>([]);
    const [decisionError, setDecisionError] = useState('');

    const absentIds = new Set(absentTeachers.map((teacher) => teacher.userId));
    const availableCount = teachers.filter((teacher) => !absentIds.has(teacher.id)).length;
    const requestsOnDate = requests.filter((request) => request.date === date);
    const pendingCount = requests.filter((request) => request.status === 'pending').length;

    const loadCandidates = useCallback(
        async (periodOrder: string, excludeTeacherId: string, apply: (list: TeacherOption[]) => void) => {
            const order = Number(periodOrder);
            if (!Number.isInteger(order) || order < 1) {
                apply([]);
                return;
            }
            setCandidatesLoading(true);
            try {
                const free = await listFreeTeachersForSlot({
                    date,
                    periodOrder: order,
                    excludeTeacherId: excludeTeacherId || undefined,
                });
                apply(free);
            } finally {
                setCandidatesLoading(false);
            }
        },
        [date]
    );

    useEffect(() => {
        if (!showCreate) return;
        void loadCandidates(draft.periodOrder, draft.teacherId, setCandidates);
    }, [showCreate, draft.periodOrder, draft.teacherId, loadCandidates]);

    useEffect(() => {
        if (!decisionTarget) return;
        void loadCandidates(String(decisionTarget.period), decisionTarget.teacherId, setDecisionCandidates);
    }, [decisionTarget, loadCandidates]);

    function openCreate(prefill?: Partial<RequestDraft>) {
        setFormError('');
        setDraft({ ...EMPTY_DRAFT, ...prefill });
        setCandidates([]);
        setShowCreate(true);
    }

    function handleCreate() {
        setFormError('');
        startTransition(async () => {
            const result = await submitSubstitutionRequest({
                date,
                teacherId: draft.teacherId,
                sectionId: draft.sectionId,
                periodOrder: Number(draft.periodOrder),
                substituteId: draft.substituteId || undefined,
                reason: draft.reason || undefined,
            });
            if (!result.success) {
                setFormError(result.error ?? 'Could not create this request.');
                return;
            }
            setShowCreate(false);
            setDraft(EMPTY_DRAFT);
            setBannerError('');
            setBanner('Substitution request created.');
            router.refresh();
        });
    }

    function openDecision(request: SubstitutionRequestRow) {
        setDecisionError('');
        setDecisionSubstitute(request.substituteId ?? '');
        setDecisionCandidates([]);
        setDecisionTarget(request);
    }

    function decide(decision: 'approved' | 'rejected') {
        if (!decisionTarget) return;
        const requestId = decisionTarget.id;
        setDecisionError('');
        startTransition(async () => {
            const result = await resolveSubstitutionRequest({
                requestId,
                decision,
                substituteId: decision === 'approved' ? decisionSubstitute || undefined : undefined,
            });
            if (!result.success) {
                setDecisionError(result.error ?? 'Could not update this request.');
                return;
            }
            setDecisionTarget(null);
            setBannerError('');
            setBanner(result.message ?? 'Request updated.');
            router.refresh();
        });
    }

    return (
        <div className="space-y-6">
            {banner && (
                <div data-testid="substitution-banner" className="p-3 bg-green-50 border border-green-300 text-green-800 rounded-lg text-sm">
                    {banner}
                </div>
            )}
            {bannerError && (
                <div data-testid="substitution-banner-error" className="p-3 bg-red-50 border border-red-300 text-red-700 rounded-lg text-sm">
                    {bannerError}
                </div>
            )}

            <Card>
                <CardContent className="pt-4 flex flex-wrap items-end gap-4">
                    <div>
                        <label htmlFor="cover-date" className="block text-sm font-medium mb-1">Cover date</label>
                        <input
                            id="cover-date"
                            type="date"
                            data-testid="substitution-date-input"
                            value={date}
                            onChange={(event) => {
                                const next = event.target.value;
                                if (next) router.push(`/timetable/substitution?date=${next}`);
                            }}
                            className="px-3 py-2 border rounded-lg"
                        />
                    </div>
                    <Button
                        type="button"
                        data-testid="new-substitution-btn"
                        onClick={() => openCreate()}
                        disabled={teachers.length === 0 || sections.length === 0 || periods.length === 0}
                    >
                        + New Substitution
                    </Button>
                    {(teachers.length === 0 || sections.length === 0 || periods.length === 0) && (
                        <p className="text-sm text-amber-700">
                            {periods.length === 0
                                ? 'No teaching periods are configured, so a period cannot be picked.'
                                : sections.length === 0
                                    ? 'No classes are configured yet.'
                                    : 'No active teachers exist yet.'}
                        </p>
                    )}
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-4" data-testid="kpi-today">
                        <div className="text-sm text-gray-500">Requests on this date</div>
                        <div className="text-2xl font-bold text-blue-600">{requestsOnDate.length}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4" data-testid="kpi-pending">
                        <div className="text-sm text-gray-500">Pending approval (all dates)</div>
                        <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4" data-testid="kpi-absent">
                        <div className="text-sm text-gray-500">Teachers on approved leave</div>
                        <div className="text-2xl font-bold text-red-600">{absentTeachers.length}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4" data-testid="kpi-available">
                        <div className="text-sm text-gray-500">Teachers not on leave</div>
                        <div className="text-2xl font-bold text-green-600">{availableCount}</div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg" data-testid="absent-teachers-card-title">
                        Teachers on approved leave — {date}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4" data-testid="absent-teachers-list">
                        {absentTeachers.length === 0 ? (
                            <p className="text-gray-500" data-testid="no-absent-msg">
                                No approved leave covers this date. Absence is read from approved leave requests, so
                                unrecorded absence will not appear here.
                            </p>
                        ) : (
                            absentTeachers.map((teacher) => {
                                const obligations = obligationsByTeacher[teacher.userId] ?? [];
                                return (
                                    <div key={teacher.userId} className="border rounded-lg p-3" data-testid="absent-teacher-item">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-medium text-red-700">{teacher.name}</span>
                                            <Badge variant="outline">{teacher.leaveType}</Badge>
                                            <span className="text-xs text-gray-500">
                                                {teacher.fromDate} → {teacher.toDate}
                                            </span>
                                        </div>
                                        {teacher.reason && (
                                            <p className="text-xs text-gray-500 mt-1">{teacher.reason}</p>
                                        )}

                                        {!isTimetabledDay ? (
                                            <p className="text-sm text-gray-500 mt-2">
                                                Nothing is timetabled on this date.
                                            </p>
                                        ) : obligations.length === 0 ? (
                                            <p className="text-sm text-gray-500 mt-2">
                                                No classes timetabled for this teacher on this day.
                                            </p>
                                        ) : (
                                            <ul className="mt-3 space-y-2">
                                                {obligations.map((obligation) => (
                                                    <li
                                                        key={obligation.entryId}
                                                        className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 rounded px-3 py-2 text-sm"
                                                    >
                                                        <span>
                                                            <strong>{obligation.periodName}</strong>
                                                            <span className="text-gray-500"> ({obligation.startTime}–{obligation.endTime})</span>
                                                            {' · '}{obligation.subjectName}
                                                            {' · '}{obligation.className}
                                                            {obligation.roomNumber ? ` · Room ${obligation.roomNumber}` : ''}
                                                        </span>
                                                        {obligation.coveredBy ? (
                                                            <span className="text-green-700 text-xs font-medium">
                                                                Covered by {obligation.coveredBy}
                                                            </span>
                                                        ) : (
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="outline"
                                                                data-testid={`cover-btn-${obligation.entryId}`}
                                                                onClick={() =>
                                                                    openCreate({
                                                                        teacherId: teacher.userId,
                                                                        sectionId: obligation.sectionId,
                                                                        periodOrder: String(obligation.periodOrder),
                                                                        reason: teacher.leaveType,
                                                                    })
                                                                }
                                                            >
                                                                Request cover
                                                            </Button>
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Substitution Requests</CardTitle>
                </CardHeader>
                <CardContent>
                    {requests.length === 0 ? (
                        <p className="text-gray-500 text-center py-8">No substitution requests yet.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table data-testid="substitutions-table">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Absent Teacher</TableHead>
                                        <TableHead>Substitute</TableHead>
                                        <TableHead>Class</TableHead>
                                        <TableHead>Period</TableHead>
                                        <TableHead>On grid</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {requests.map((request) => (
                                        <TableRow key={request.id} data-testid={`substitution-row-${request.id}`}>
                                            <TableCell>
                                                <Link
                                                    href={`/timetable/substitution/detail/${request.id}`}
                                                    className="text-blue-600 hover:underline"
                                                >
                                                    {request.date}
                                                </Link>
                                            </TableCell>
                                            <TableCell className="font-medium text-red-600">
                                                {request.originalTeacher}
                                                {request.reason && (
                                                    <span className="text-xs text-gray-500 block font-normal">{request.reason}</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-green-700">{request.substitute || 'Unassigned'}</TableCell>
                                            <TableCell>
                                                {request.className ? <Badge variant="outline">{request.className}</Badge> : '—'}
                                            </TableCell>
                                            <TableCell>{request.periodName || `Period ${request.period}`}</TableCell>
                                            <TableCell className="text-xs">
                                                {request.linkedEntryId ? (
                                                    <span className="text-green-700">Attached</span>
                                                ) : (
                                                    <span className="text-gray-400">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell>{statusBadge(request.status)}</TableCell>
                                            <TableCell>
                                                {request.status === 'pending' ? (
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        data-testid={`approve-btn-${request.id}`}
                                                        onClick={() => openDecision(request)}
                                                    >
                                                        Review
                                                    </Button>
                                                ) : (
                                                    <span className="text-xs text-gray-400">—</span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={showCreate} onOpenChange={(open) => { if (!open) setShowCreate(false); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Substitution Request — {date}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                        {formError && (
                            <div data-testid="validation-error" className="p-3 bg-red-50 border border-red-300 text-red-700 rounded-lg text-sm">
                                {formError}
                            </div>
                        )}

                        <div>
                            <label htmlFor="absent-teacher" className="block text-sm font-medium mb-1">Absent teacher</label>
                            <select
                                id="absent-teacher"
                                data-testid="absent-teacher-select"
                                value={draft.teacherId}
                                onChange={(event) => setDraft({ ...draft, teacherId: event.target.value, substituteId: '' })}
                                className="w-full px-3 py-2 border rounded-lg bg-white"
                            >
                                <option value="">Select teacher…</option>
                                {teachers.map((teacher) => (
                                    <option key={teacher.id} value={teacher.id}>
                                        {teacher.name} ({teacher.weeklyPeriods} periods/week)
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="cover-class" className="block text-sm font-medium mb-1">Class</label>
                                <select
                                    id="cover-class"
                                    data-testid="class-select"
                                    value={draft.sectionId}
                                    onChange={(event) => setDraft({ ...draft, sectionId: event.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg bg-white"
                                >
                                    <option value="">Select class…</option>
                                    {sections.map((section) => (
                                        <option key={section.id} value={section.id}>
                                            {section.gradeName}-{section.sectionName}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="cover-period" className="block text-sm font-medium mb-1">Period</label>
                                <select
                                    id="cover-period"
                                    data-testid="period-select"
                                    value={draft.periodOrder}
                                    onChange={(event) => setDraft({ ...draft, periodOrder: event.target.value, substituteId: '' })}
                                    className="w-full px-3 py-2 border rounded-lg bg-white"
                                >
                                    <option value="">Select period…</option>
                                    {periods.map((period) => (
                                        <option key={period.id} value={String(period.displayOrder)}>
                                            {period.name} ({period.startTime}–{period.endTime})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label htmlFor="cover-reason" className="block text-sm font-medium mb-1">Reason (optional)</label>
                            <input
                                id="cover-reason"
                                type="text"
                                data-testid="reason-input"
                                maxLength={255}
                                value={draft.reason}
                                onChange={(event) => setDraft({ ...draft, reason: event.target.value })}
                                placeholder="e.g. Sick leave"
                                className="w-full px-3 py-2 border rounded-lg"
                            />
                        </div>

                        <div>
                            <label htmlFor="cover-substitute" className="block text-sm font-medium mb-1">
                                Substitute teacher (optional)
                            </label>
                            <select
                                id="cover-substitute"
                                data-testid="substitute-teacher-select"
                                value={draft.substituteId}
                                onChange={(event) => setDraft({ ...draft, substituteId: event.target.value })}
                                disabled={!draft.periodOrder}
                                className="w-full px-3 py-2 border rounded-lg bg-white disabled:bg-gray-100"
                            >
                                <option value="">
                                    {draft.periodOrder ? 'Leave unassigned…' : 'Pick a period first'}
                                </option>
                                {candidates.map((candidate) => (
                                    <option key={candidate.id} value={candidate.id}>
                                        {candidate.name} ({candidate.weeklyPeriods} periods/week)
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-500 mt-1">
                                {candidatesLoading
                                    ? 'Checking who is free…'
                                    : !draft.periodOrder
                                        ? 'Only teachers free in that period and not on leave are listed.'
                                        : candidates.length === 0
                                            ? 'No teacher is free in this period on this date.'
                                            : `${candidates.length} teacher${candidates.length === 1 ? '' : 's'} free, least loaded first.`}
                            </p>
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                            <Button
                                type="button"
                                data-testid="submit-request-btn"
                                disabled={isPending}
                                onClick={handleCreate}
                            >
                                {isPending ? 'Saving…' : 'Create Request'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={decisionTarget !== null} onOpenChange={(open) => { if (!open) setDecisionTarget(null); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Review substitution request</DialogTitle>
                    </DialogHeader>
                    {decisionTarget && (
                        <div className="space-y-4 pt-2 text-sm">
                            {decisionError && (
                                <div data-testid="decision-error" className="p-3 bg-red-50 border border-red-300 text-red-700 rounded-lg">
                                    {decisionError}
                                </div>
                            )}
                            <div className="rounded-lg border p-3 space-y-1">
                                <div><span className="text-gray-500">Date:</span> {decisionTarget.date}</div>
                                <div><span className="text-gray-500">Absent:</span> {decisionTarget.originalTeacher}</div>
                                <div><span className="text-gray-500">Class:</span> {decisionTarget.className ?? 'Not set'}</div>
                                <div>
                                    <span className="text-gray-500">Period:</span>{' '}
                                    {decisionTarget.periodName || `Period ${decisionTarget.period}`}
                                </div>
                                <div><span className="text-gray-500">Reason:</span> {decisionTarget.reason || 'Not given'}</div>
                            </div>

                            <div>
                                <label htmlFor="decision-substitute" className="block text-sm font-medium mb-1">
                                    Substitute teacher
                                </label>
                                <select
                                    id="decision-substitute"
                                    data-testid="decision-substitute-select"
                                    value={decisionSubstitute}
                                    onChange={(event) => setDecisionSubstitute(event.target.value)}
                                    className="w-full px-3 py-2 border rounded-lg bg-white"
                                >
                                    <option value="">Select a free teacher…</option>
                                    {decisionTarget.substituteId && decisionTarget.substitute &&
                                        !decisionCandidates.some((c) => c.id === decisionTarget.substituteId) && (
                                        <option value={decisionTarget.substituteId}>
                                            {decisionTarget.substitute} (already proposed)
                                        </option>
                                    )}
                                    {decisionCandidates.map((candidate) => (
                                        <option key={candidate.id} value={candidate.id}>
                                            {candidate.name} ({candidate.weeklyPeriods} periods/week)
                                        </option>
                                    ))}
                                </select>
                                <p className="text-xs text-gray-500 mt-1">
                                    {candidatesLoading
                                        ? 'Checking who is free…'
                                        : decisionCandidates.length === 0
                                            ? 'No teacher is free in this period on this date.'
                                            : `${decisionCandidates.length} free, least loaded first.`}
                                </p>
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <Button type="button" variant="outline" onClick={() => setDecisionTarget(null)}>Cancel</Button>
                                <Button
                                    type="button"
                                    variant="destructive"
                                    data-testid="reject-btn"
                                    disabled={isPending}
                                    onClick={() => decide('rejected')}
                                >
                                    Reject
                                </Button>
                                <Button
                                    type="button"
                                    data-testid="approve-confirm-btn"
                                    disabled={isPending || !decisionSubstitute}
                                    onClick={() => decide('approved')}
                                >
                                    {isPending ? 'Saving…' : 'Approve'}
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
