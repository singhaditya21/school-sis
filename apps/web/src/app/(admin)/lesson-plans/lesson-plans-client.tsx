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
import { deleteLessonPlan, saveLessonPlan, setLessonPlanStatus } from './actions';
import {
    LESSON_PLAN_STATUSES,
    type LessonPlanOptions,
    type LessonPlanRow,
    type LessonPlanStats,
    type LessonPlanStatus,
} from './types';

interface Props {
    plans: LessonPlanRow[];
    stats: LessonPlanStats;
    options: LessonPlanOptions;
    filters: { status: string; teacherId: string; gradeId: string; subjectId: string };
}

const STATUS_STYLES: Record<LessonPlanStatus, string> = {
    DRAFT: 'bg-muted text-foreground hover:bg-muted',
    SUBMITTED: 'bg-blue-100 text-blue-700 hover:bg-blue-100',
    APPROVED: 'bg-green-100 text-green-700 hover:bg-green-100',
    COMPLETED: 'bg-purple-100 text-purple-700 hover:bg-purple-100',
};

const NEXT_ACTIONS: Record<LessonPlanStatus, { to: LessonPlanStatus; label: string }[]> = {
    DRAFT: [{ to: 'SUBMITTED', label: 'Submit for review' }],
    SUBMITTED: [
        { to: 'APPROVED', label: 'Approve' },
        { to: 'DRAFT', label: 'Send back' },
    ],
    APPROVED: [
        { to: 'COMPLETED', label: 'Mark taught' },
        { to: 'DRAFT', label: 'Reopen' },
    ],
    COMPLETED: [{ to: 'APPROVED', label: 'Reopen' }],
};

function formatDate(value: string | null): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function LessonPlansClient({ plans, stats, options, filters }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [editorOpen, setEditorOpen] = useState(false);
    const [editing, setEditing] = useState<LessonPlanRow | null>(null);
    const [viewing, setViewing] = useState<LessonPlanRow | null>(null);
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    const applyFilter = useCallback(
        (key: 'status' | 'teacherId' | 'gradeId' | 'subjectId', value: string) => {
            const merged = { ...filters, [key]: value };
            const next = new URLSearchParams();
            for (const [k, v] of Object.entries(merged)) {
                if (v) next.set(k, v);
            }
            const qs = next.toString();
            startTransition(() => router.push(qs ? `/lesson-plans?${qs}` : '/lesson-plans'));
        },
        [filters, router]
    );

    function openEditor(plan: LessonPlanRow | null) {
        setEditing(plan);
        setEditorOpen(true);
    }

    async function handleSave(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setSaving(true);
        try {
            const result = await saveLessonPlan({
                planId: editing?.id,
                topic: String(form.get('topic') ?? ''),
                subjectId: String(form.get('subjectId') ?? '') || undefined,
                gradeId: String(form.get('gradeId') ?? '') || undefined,
                teacherId: String(form.get('teacherId') ?? '') || undefined,
                objectives: String(form.get('objectives') ?? '') || undefined,
                activities: String(form.get('activities') ?? '') || undefined,
                resources: String(form.get('resources') ?? '') || undefined,
                assessmentPlan: String(form.get('assessmentPlan') ?? '') || undefined,
                duration: String(form.get('duration') ?? ''),
                weekNumber: String(form.get('weekNumber') ?? ''),
            });
            if (!result.success) {
                toast.error(result.error ?? 'Could not save the lesson plan.');
                return;
            }
            toast.success(editing ? 'Lesson plan updated.' : 'Lesson plan created.');
            setEditorOpen(false);
            setEditing(null);
            router.refresh();
        } catch {
            toast.error('Could not save the lesson plan.');
        } finally {
            setSaving(false);
        }
    }

    async function handleTransition(plan: LessonPlanRow, to: LessonPlanStatus) {
        setBusyId(plan.id);
        try {
            const result = await setLessonPlanStatus(plan.id, to);
            if (!result.success) {
                toast.error(result.error ?? 'Could not update the status.');
                return;
            }
            toast.success('Status updated.');
            router.refresh();
        } catch {
            toast.error('Could not update the status.');
        } finally {
            setBusyId(null);
        }
    }

    async function handleDelete(plan: LessonPlanRow) {
        setBusyId(plan.id);
        try {
            const result = await deleteLessonPlan(plan.id);
            if (!result.success) {
                toast.error(result.error ?? 'Could not delete the lesson plan.');
                return;
            }
            toast.success('Lesson plan deleted.');
            router.refresh();
        } catch {
            toast.error('Could not delete the lesson plan.');
        } finally {
            setBusyId(null);
        }
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Lesson plans</h1>
                    <p className="text-muted-foreground mt-1">
                        Draft a plan, send it for review, and mark it once the lesson has been taught.
                    </p>
                </div>
                <Button onClick={() => openEditor(null)} className="bg-primary hover:bg-primary/90">
                    New lesson plan
                </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card><CardContent className="pt-4"><div className="text-sm text-muted-foreground">Total</div><div className="text-2xl font-bold text-foreground">{stats.total}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-muted-foreground">Draft</div><div className="text-2xl font-bold text-muted-foreground">{stats.draft}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-muted-foreground">Awaiting review</div><div className="text-2xl font-bold text-blue-600">{stats.submitted}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-muted-foreground">Approved</div><div className="text-2xl font-bold text-green-600">{stats.approved}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-muted-foreground">Taught</div><div className="text-2xl font-bold text-purple-600">{stats.completed}</div></CardContent></Card>
            </div>

            <Card>
                <CardContent className="pt-4 flex flex-col md:flex-row md:items-end gap-3">
                    <div className="space-y-1">
                        <Label htmlFor="filter-status" className="text-xs text-muted-foreground">Status</Label>
                        <select
                            id="filter-status"
                            className="h-10 w-full md:w-44 px-3 bg-card border border-border rounded-md text-sm"
                            value={filters.status}
                            onChange={(e) => applyFilter('status', e.target.value)}
                        >
                            <option value="">All statuses</option>
                            {LESSON_PLAN_STATUSES.map((s) => (
                                <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="filter-grade" className="text-xs text-muted-foreground">Class</Label>
                        <select
                            id="filter-grade"
                            className="h-10 w-full md:w-44 px-3 bg-card border border-border rounded-md text-sm"
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
                        <Label htmlFor="filter-subject" className="text-xs text-muted-foreground">Subject</Label>
                        <select
                            id="filter-subject"
                            className="h-10 w-full md:w-44 px-3 bg-card border border-border rounded-md text-sm"
                            value={filters.subjectId}
                            onChange={(e) => applyFilter('subjectId', e.target.value)}
                        >
                            <option value="">All subjects</option>
                            {options.subjects.map((s) => (
                                <option key={s.subjectId} value={s.subjectId}>{s.subjectName}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="filter-teacher" className="text-xs text-muted-foreground">Teacher</Label>
                        <select
                            id="filter-teacher"
                            className="h-10 w-full md:w-48 px-3 bg-card border border-border rounded-md text-sm"
                            value={filters.teacherId}
                            onChange={(e) => applyFilter('teacherId', e.target.value)}
                        >
                            <option value="">All teachers</option>
                            {options.teachers.map((t) => (
                                <option key={t.teacherId} value={t.teacherId}>{t.teacherName}</option>
                            ))}
                        </select>
                    </div>
                </CardContent>
            </Card>

            {isPending && <p className="text-xs text-muted-foreground">Updating…</p>}

            <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted border-b text-xs text-muted-foreground uppercase font-semibold">
                            <tr>
                                <th className="px-4 py-3">Topic</th>
                                <th className="px-4 py-3">Class / subject</th>
                                <th className="px-4 py-3">Teacher</th>
                                <th className="px-4 py-3 text-center">Week</th>
                                <th className="px-4 py-3 text-center">Duration</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {plans.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                                        <p className="font-medium">No lesson plans match these filters</p>
                                        <p className="text-sm mt-1">Create a plan to start the review workflow.</p>
                                    </td>
                                </tr>
                            ) : (
                                plans.map((plan) => (
                                    <tr key={plan.id} className="hover:bg-muted/80 align-top">
                                        <td className="px-4 py-4">
                                            <button
                                                type="button"
                                                className="font-semibold text-foreground hover:text-primary text-left"
                                                onClick={() => setViewing(plan)}
                                            >
                                                {plan.topic}
                                            </button>
                                            {plan.objectives && (
                                                <div className="text-xs text-muted-foreground truncate max-w-xs">{plan.objectives}</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-4 text-foreground">
                                            {plan.gradeName ?? '—'}
                                            {plan.subjectName && <span className="text-muted-foreground"> · {plan.subjectName}</span>}
                                        </td>
                                        <td className="px-4 py-4 text-foreground">{plan.teacherName ?? '—'}</td>
                                        <td className="px-4 py-4 text-center text-foreground">{plan.weekNumber ?? '—'}</td>
                                        <td className="px-4 py-4 text-center text-foreground">
                                            {plan.duration ? `${plan.duration} min` : '—'}
                                        </td>
                                        <td className="px-4 py-4">
                                            <Badge variant="secondary" className={STATUS_STYLES[plan.status]}>
                                                {plan.status.charAt(0) + plan.status.slice(1).toLowerCase()}
                                            </Badge>
                                            {plan.status === 'APPROVED' && plan.approvedByName && (
                                                <div className="text-xs text-muted-foreground mt-1">
                                                    by {plan.approvedByName} · {formatDate(plan.approvedAt)}
                                                </div>
                                            )}
                                            {plan.status === 'COMPLETED' && plan.completedAt && (
                                                <div className="text-xs text-muted-foreground mt-1">
                                                    taught {formatDate(plan.completedAt)}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-4 text-right whitespace-nowrap">
                                            {NEXT_ACTIONS[plan.status].map((action) => (
                                                <Button
                                                    key={action.to}
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-blue-600 hover:text-primary hover:bg-accent"
                                                    disabled={busyId === plan.id}
                                                    onClick={() => handleTransition(plan, action.to)}
                                                >
                                                    {action.label}
                                                </Button>
                                            ))}
                                            <Button variant="ghost" size="sm" onClick={() => openEditor(plan)}>
                                                Edit
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                disabled={busyId === plan.id}
                                                onClick={() => handleDelete(plan)}
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

            <Dialog open={editorOpen} onOpenChange={(open) => { setEditorOpen(open); if (!open) setEditing(null); }}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Edit lesson plan' : 'New lesson plan'}</DialogTitle>
                        <DialogDescription>
                            New plans start as a draft. Status changes happen from the table.
                        </DialogDescription>
                    </DialogHeader>
                    <form className="space-y-4" onSubmit={handleSave}>
                        <div className="space-y-2">
                            <Label htmlFor="topic">Topic</Label>
                            <Input id="topic" name="topic" required maxLength={255} defaultValue={editing?.topic ?? ''} placeholder="Photosynthesis — light reactions" />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="gradeId">Class</Label>
                                <select id="gradeId" name="gradeId" defaultValue={editing?.gradeId ?? ''} className="w-full h-10 px-3 bg-card border border-border rounded-md text-sm">
                                    <option value="">Not set</option>
                                    {options.grades.map((g) => (
                                        <option key={g.gradeId} value={g.gradeId}>{g.gradeName}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="subjectId">Subject</Label>
                                <select id="subjectId" name="subjectId" defaultValue={editing?.subjectId ?? ''} className="w-full h-10 px-3 bg-card border border-border rounded-md text-sm">
                                    <option value="">Not set</option>
                                    {options.subjects.map((s) => (
                                        <option key={s.subjectId} value={s.subjectId}>{s.subjectName}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="teacherId">Teacher</Label>
                                <select id="teacherId" name="teacherId" defaultValue={editing?.teacherId ?? ''} className="w-full h-10 px-3 bg-card border border-border rounded-md text-sm">
                                    <option value="">Me</option>
                                    {options.teachers.map((t) => (
                                        <option key={t.teacherId} value={t.teacherId}>{t.teacherName}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="weekNumber">Week number</Label>
                                <Input id="weekNumber" name="weekNumber" type="number" min={1} max={53} step={1} defaultValue={editing?.weekNumber ?? ''} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="duration">Duration (minutes)</Label>
                                <Input id="duration" name="duration" type="number" min={1} max={600} step={1} defaultValue={editing?.duration ?? ''} />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="objectives">Learning objectives</Label>
                            <Textarea id="objectives" name="objectives" className="h-24 resize-none" defaultValue={editing?.objectives ?? ''} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="activities">Activities</Label>
                            <Textarea id="activities" name="activities" className="h-24 resize-none" defaultValue={editing?.activities ?? ''} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="resources">Resources</Label>
                            <Textarea id="resources" name="resources" className="h-20 resize-none" defaultValue={editing?.resources ?? ''} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="assessmentPlan">Assessment plan</Label>
                            <Textarea id="assessmentPlan" name="assessmentPlan" className="h-20 resize-none" defaultValue={editing?.assessmentPlan ?? ''} />
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => { setEditorOpen(false); setEditing(null); }}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90">
                                {saving ? 'Saving…' : editing ? 'Save changes' : 'Create plan'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{viewing?.topic ?? ''}</DialogTitle>
                        <DialogDescription>
                            {viewing
                                ? [viewing.gradeName, viewing.subjectName, viewing.teacherName]
                                      .filter(Boolean)
                                      .join(' · ') || 'No class, subject or teacher recorded'
                                : ''}
                        </DialogDescription>
                    </DialogHeader>
                    {viewing && (
                        <div className="space-y-4 text-sm">
                            {([
                                ['Learning objectives', viewing.objectives],
                                ['Activities', viewing.activities],
                                ['Resources', viewing.resources],
                                ['Assessment plan', viewing.assessmentPlan],
                            ] as const).map(([label, value]) => (
                                <div key={label}>
                                    <div className="font-semibold text-foreground">{label}</div>
                                    <p className="text-foreground whitespace-pre-wrap">
                                        {value?.trim() ? value : <span className="text-muted-foreground">Not filled in</span>}
                                    </p>
                                </div>
                            ))}
                            <div className="text-xs text-muted-foreground border-t pt-3">
                                Created {formatDate(viewing.createdAt)} · last updated {formatDate(viewing.updatedAt)}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
