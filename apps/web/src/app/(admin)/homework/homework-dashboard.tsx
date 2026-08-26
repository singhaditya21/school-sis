'use client';

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    createHomeworkAssignment,
    deleteHomeworkAssignment,
    getAssignmentTracking,
    gradeHomeworkSubmission,
} from './actions';
import type {
    HomeworkAssignmentRow,
    HomeworkOptions,
    HomeworkPendingStudentRow,
    HomeworkStats,
    HomeworkSubmissionRow,
} from './types';

interface Props {
    assignments: HomeworkAssignmentRow[];
    stats: HomeworkStats;
    options: HomeworkOptions;
    filters: { gradeId: string; subjectId: string; scope: 'all' | 'open' | 'overdue' };
}

const SCOPES: { key: 'all' | 'open' | 'overdue'; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'open', label: 'Open' },
    { key: 'overdue', label: 'Past due' },
];

function formatDate(value: string | null): string {
    if (!value) return '—';
    const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(value: string | null): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function isOverdue(dueDate: string): boolean {
    const due = new Date(`${dueDate}T23:59:59`);
    return !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
}

function classLabel(a: HomeworkAssignmentRow): string {
    if (!a.gradeName) return 'Whole school';
    return a.sectionName ? `${a.gradeName} · ${a.sectionName}` : a.gradeName;
}

export default function HomeworkDashboardClient({ assignments, stats, options, filters }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [createOpen, setCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [formGradeId, setFormGradeId] = useState('');

    const [trackerFor, setTrackerFor] = useState<HomeworkAssignmentRow | null>(null);
    const [trackerLoading, setTrackerLoading] = useState(false);
    const [submissions, setSubmissions] = useState<HomeworkSubmissionRow[]>([]);
    const [pending, setPending] = useState<HomeworkPendingStudentRow[]>([]);
    const [rosterKnown, setRosterKnown] = useState(false);
    const [gradingId, setGradingId] = useState<string | null>(null);

    const applyFilter = useCallback(
        (key: 'gradeId' | 'subjectId' | 'scope', value: string) => {
            const next = new URLSearchParams();
            const merged = { ...filters, [key]: value };
            if (merged.gradeId) next.set('gradeId', merged.gradeId);
            if (merged.subjectId) next.set('subjectId', merged.subjectId);
            if (merged.scope && merged.scope !== 'all') next.set('scope', merged.scope);
            const qs = next.toString();
            startTransition(() => router.push(qs ? `/homework?${qs}` : '/homework'));
        },
        [filters, router]
    );

    const loadTracking = useCallback(async (assignment: HomeworkAssignmentRow) => {
        setTrackerFor(assignment);
        setTrackerLoading(true);
        try {
            const result = await getAssignmentTracking(assignment.id);
            if (!result.success) {
                toast.error(result.error ?? 'Could not load submissions.');
                setSubmissions([]);
                setPending([]);
                setRosterKnown(false);
                return;
            }
            setSubmissions(result.submissions);
            setPending(result.pending);
            setRosterKnown(result.rosterKnown);
        } catch {
            toast.error('Could not load submissions.');
        } finally {
            setTrackerLoading(false);
        }
    }, []);

    async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setCreating(true);
        try {
            const maxMarksRaw = String(form.get('maxMarks') ?? '').trim();
            const result = await createHomeworkAssignment({
                title: String(form.get('title') ?? ''),
                description: String(form.get('description') ?? '') || undefined,
                gradeId: String(form.get('gradeId') ?? '') || undefined,
                sectionId: String(form.get('sectionId') ?? '') || undefined,
                subjectId: String(form.get('subjectId') ?? '') || undefined,
                dueDate: String(form.get('dueDate') ?? ''),
                maxMarks: maxMarksRaw ? Number(maxMarksRaw) : null,
            });
            if (!result.success) {
                toast.error(result.error ?? 'Could not create the assignment.');
                return;
            }
            toast.success('Assignment created.');
            setCreateOpen(false);
            setFormGradeId('');
            router.refresh();
        } catch {
            toast.error('Could not create the assignment.');
        } finally {
            setCreating(false);
        }
    }

    async function handleGrade(event: React.FormEvent<HTMLFormElement>, submissionId: string) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const marksRaw = String(form.get('marks') ?? '').trim();
        setGradingId(submissionId);
        try {
            const result = await gradeHomeworkSubmission({
                submissionId,
                marks: marksRaw === '' ? null : Number(marksRaw),
                feedback: String(form.get('feedback') ?? ''),
            });
            if (!result.success) {
                toast.error(result.error ?? 'Could not save the grade.');
                return;
            }
            toast.success('Grade saved.');
            if (trackerFor) await loadTracking(trackerFor);
            router.refresh();
        } catch {
            toast.error('Could not save the grade.');
        } finally {
            setGradingId(null);
        }
    }

    async function handleDelete(assignment: HomeworkAssignmentRow) {
        setGradingId(assignment.id);
        try {
            const result = await deleteHomeworkAssignment(assignment.id);
            if (!result.success) {
                toast.error(result.error ?? 'Could not delete the assignment.');
                return;
            }
            toast.success('Assignment deleted.');
            router.refresh();
        } catch {
            toast.error('Could not delete the assignment.');
        } finally {
            setGradingId(null);
        }
    }

    const sectionsForForm =
        options.grades.find((g) => g.gradeId === formGradeId)?.sections ?? [];

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">Homework</h1>
                    <p className="text-gray-500 mt-1">
                        Assign work to a class, watch submissions land, and enter marks.
                    </p>
                </div>
                <Button onClick={() => setCreateOpen(true)} className="bg-blue-600 hover:bg-blue-700">
                    New assignment
                </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Assignments</div>
                        <div className="text-2xl font-bold text-gray-900">{stats.totalAssignments}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Due in next 7 days</div>
                        <div className="text-2xl font-bold text-blue-600">{stats.dueThisWeek}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Submissions received</div>
                        <div className="text-2xl font-bold text-green-600">{stats.totalSubmissions}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Awaiting marks</div>
                        <div className="text-2xl font-bold text-orange-600">{stats.pendingGrading}</div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardContent className="pt-4 flex flex-col md:flex-row md:items-end gap-3">
                    <div className="space-y-1">
                        <Label htmlFor="filter-grade" className="text-xs text-gray-500">Class</Label>
                        <select
                            id="filter-grade"
                            className="h-10 w-full md:w-48 px-3 bg-white border border-gray-300 rounded-md text-sm"
                            value={filters.gradeId}
                            onChange={(e) => applyFilter('gradeId', e.target.value)}
                        >
                            <option value="">All classes</option>
                            {options.grades.map((g) => (
                                <option key={g.gradeId} value={g.gradeId}>{g.gradeName}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="filter-subject" className="text-xs text-gray-500">Subject</Label>
                        <select
                            id="filter-subject"
                            className="h-10 w-full md:w-48 px-3 bg-white border border-gray-300 rounded-md text-sm"
                            value={filters.subjectId}
                            onChange={(e) => applyFilter('subjectId', e.target.value)}
                        >
                            <option value="">All subjects</option>
                            {options.subjects.map((s) => (
                                <option key={s.subjectId} value={s.subjectId}>{s.subjectName}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex gap-1 md:ml-auto">
                        {SCOPES.map((scope) => (
                            <Button
                                key={scope.key}
                                type="button"
                                size="sm"
                                variant={filters.scope === scope.key ? 'default' : 'outline'}
                                onClick={() => applyFilter('scope', scope.key)}
                            >
                                {scope.label}
                            </Button>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase font-semibold">
                            <tr>
                                <th className="px-6 py-3">Assignment</th>
                                <th className="px-6 py-3">Class</th>
                                <th className="px-6 py-3">Due</th>
                                <th className="px-6 py-3">Submitted</th>
                                <th className="px-6 py-3">Marked</th>
                                <th className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {assignments.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                        <p className="font-medium">No assignments match these filters</p>
                                        <p className="text-sm mt-1">
                                            Create an assignment to start tracking homework.
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                assignments.map((a) => (
                                    <tr key={a.id} className="hover:bg-gray-50/80">
                                        <td className="px-6 py-4">
                                            <div className="font-semibold text-gray-900">{a.title}</div>
                                            <div className="text-xs text-gray-500 mt-0.5">
                                                {a.subjectName ?? 'No subject'}
                                                {a.assignedByName ? ` · set by ${a.assignedByName}` : ''}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-700">{classLabel(a)}</td>
                                        <td className="px-6 py-4">
                                            <div className="text-gray-900">{formatDate(a.dueDate)}</div>
                                            <Badge
                                                variant="secondary"
                                                className={
                                                    isOverdue(a.dueDate)
                                                        ? 'bg-orange-100 text-orange-700 hover:bg-orange-100'
                                                        : 'bg-green-100 text-green-700 hover:bg-green-100'
                                                }
                                            >
                                                {isOverdue(a.dueDate) ? 'Past due' : 'Open'}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 text-gray-700">
                                            {a.expectedCount === null
                                                ? a.submissionCount
                                                : `${a.submissionCount} / ${a.expectedCount}`}
                                        </td>
                                        <td className="px-6 py-4 text-gray-700">
                                            {a.gradedCount} / {a.submissionCount}
                                            {a.maxMarks !== null && (
                                                <span className="text-xs text-gray-500"> · out of {a.maxMarks}</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right whitespace-nowrap">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                onClick={() => loadTracking(a)}
                                            >
                                                Submissions
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                disabled={gradingId === a.id}
                                                onClick={() => handleDelete(a)}
                                            >
                                                Delete
                                            </Button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {isPending && <p className="text-xs text-gray-400">Updating…</p>}

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>New assignment</DialogTitle>
                        <DialogDescription>
                            Homework is visible to every active student in the class you pick.
                        </DialogDescription>
                    </DialogHeader>
                    <form className="space-y-4" onSubmit={handleCreate}>
                        <div className="space-y-2">
                            <Label htmlFor="title">Title</Label>
                            <Input id="title" name="title" required maxLength={255} placeholder="Chapter 5 — questions 1 to 20" />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="gradeId">Class</Label>
                                <select
                                    id="gradeId"
                                    name="gradeId"
                                    value={formGradeId}
                                    onChange={(e) => setFormGradeId(e.target.value)}
                                    className="w-full h-10 px-3 bg-white border border-gray-300 rounded-md text-sm"
                                >
                                    <option value="">Whole school</option>
                                    {options.grades.map((g) => (
                                        <option key={g.gradeId} value={g.gradeId}>{g.gradeName}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="sectionId">Section</Label>
                                <select
                                    id="sectionId"
                                    name="sectionId"
                                    disabled={!formGradeId}
                                    className="w-full h-10 px-3 bg-white border border-gray-300 rounded-md text-sm disabled:bg-gray-100"
                                >
                                    <option value="">All sections</option>
                                    {sectionsForForm.map((s) => (
                                        <option key={s.sectionId} value={s.sectionId}>{s.sectionName}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="subjectId">Subject</Label>
                                <select
                                    id="subjectId"
                                    name="subjectId"
                                    className="w-full h-10 px-3 bg-white border border-gray-300 rounded-md text-sm"
                                >
                                    <option value="">No subject</option>
                                    {options.subjects.map((s) => (
                                        <option key={s.subjectId} value={s.subjectId}>{s.subjectName}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Instructions</Label>
                            <Textarea id="description" name="description" className="h-28 resize-none" placeholder="What students need to do." />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="dueDate">Due date</Label>
                                <Input id="dueDate" name="dueDate" type="date" required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="maxMarks">Maximum marks (optional)</Label>
                                <Input id="maxMarks" name="maxMarks" type="number" min={0} max={1000} step={1} placeholder="20" />
                            </div>
                        </div>

                        <p className="text-xs text-gray-500">
                            File attachments are not available in this release — put links or instructions in the text above.
                        </p>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={creating} className="bg-blue-600 hover:bg-blue-700">
                                {creating ? 'Creating…' : 'Create assignment'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={trackerFor !== null} onOpenChange={(open) => !open && setTrackerFor(null)}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{trackerFor?.title ?? 'Submissions'}</DialogTitle>
                        <DialogDescription>
                            {trackerFor
                                ? `${classLabel(trackerFor)} · due ${formatDate(trackerFor.dueDate)}`
                                : ''}
                        </DialogDescription>
                    </DialogHeader>

                    {trackerLoading ? (
                        <p className="py-8 text-center text-gray-500">Loading submissions…</p>
                    ) : (
                        <div className="space-y-6">
                            <section className="space-y-3">
                                <h3 className="text-sm font-semibold text-gray-900">
                                    Submitted ({submissions.length})
                                </h3>
                                {submissions.length === 0 ? (
                                    <p className="text-sm text-gray-500">Nothing has been handed in yet.</p>
                                ) : (
                                    submissions.map((s) => (
                                        <form
                                            key={s.submissionId}
                                            onSubmit={(e) => handleGrade(e, s.submissionId)}
                                            className="border rounded-lg p-4 space-y-3"
                                        >
                                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                                                <div className="font-medium text-gray-900">
                                                    {s.studentName ?? 'Unknown student'}
                                                    {s.rollNumber !== null && (
                                                        <span className="text-gray-500 font-normal"> · Roll {s.rollNumber}</span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    Submitted {formatDateTime(s.submittedAt)}
                                                </div>
                                            </div>
                                            {s.content && (
                                                <p className="text-sm text-gray-700 whitespace-pre-wrap">{s.content}</p>
                                            )}
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                <div className="space-y-1">
                                                    <Label htmlFor={`marks-${s.submissionId}`} className="text-xs">
                                                        Marks{trackerFor?.maxMarks ? ` / ${trackerFor.maxMarks}` : ''}
                                                    </Label>
                                                    <Input
                                                        id={`marks-${s.submissionId}`}
                                                        name="marks"
                                                        type="number"
                                                        min={0}
                                                        step={1}
                                                        defaultValue={s.marks ?? ''}
                                                    />
                                                </div>
                                                <div className="space-y-1 md:col-span-2">
                                                    <Label htmlFor={`feedback-${s.submissionId}`} className="text-xs">
                                                        Feedback
                                                    </Label>
                                                    <Input
                                                        id={`feedback-${s.submissionId}`}
                                                        name="feedback"
                                                        defaultValue={s.feedback ?? ''}
                                                        placeholder="Optional comment for the student"
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-gray-500">
                                                    {s.gradedAt
                                                        ? `Marked ${formatDateTime(s.gradedAt)}${s.gradedByName ? ` by ${s.gradedByName}` : ''}`
                                                        : 'Not marked yet'}
                                                </span>
                                                <Button type="submit" size="sm" disabled={gradingId === s.submissionId}>
                                                    {gradingId === s.submissionId ? 'Saving…' : 'Save marks'}
                                                </Button>
                                            </div>
                                        </form>
                                    ))
                                )}
                            </section>

                            <section className="space-y-2">
                                <h3 className="text-sm font-semibold text-gray-900">
                                    Still outstanding {rosterKnown ? `(${pending.length})` : ''}
                                </h3>
                                {!rosterKnown ? (
                                    <p className="text-sm text-gray-500">
                                        This assignment is not tied to a class, so there is no roster to compare against.
                                    </p>
                                ) : pending.length === 0 ? (
                                    <p className="text-sm text-gray-500">Every student in this class has handed in.</p>
                                ) : (
                                    <ul className="text-sm text-gray-700 grid grid-cols-1 md:grid-cols-2 gap-1">
                                        {pending.map((p) => (
                                            <li key={p.studentId} className="border rounded px-3 py-2">
                                                {p.studentName ?? 'Unknown student'}
                                                {p.rollNumber !== null && (
                                                    <span className="text-gray-500"> · Roll {p.rollNumber}</span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
