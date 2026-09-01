'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
    createMyLessonPlan,
    submitMyLessonPlan,
    type LessonPlanTarget,
    type TeacherLessonPlan,
} from '../_actions/lesson-plans';

const STATUS_STYLES: Record<string, string> = {
    DRAFT: 'bg-muted text-foreground border-border',
    SUBMITTED: 'bg-blue-50 text-blue-700 border-blue-200',
    APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    COMPLETED: 'bg-purple-50 text-purple-700 border-purple-200',
};

const EMPTY_FORM = {
    targetIndex: '0',
    topic: '',
    objectives: '',
    activities: '',
    resources: '',
    assessmentPlan: '',
    weekNumber: '',
    duration: '',
};

export function LessonPlanBoard({
    plans,
    targets,
}: {
    plans: TeacherLessonPlan[];
    targets: LessonPlanTarget[];
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [pending, startTransition] = useTransition();

    function set(key: keyof typeof EMPTY_FORM, value: string) {
        setForm((prev) => ({ ...prev, [key]: value }));
    }

    function create() {
        const target = targets[Number(form.targetIndex)];
        if (!target) {
            toast.error('Pick a grade and subject.');
            return;
        }
        startTransition(async () => {
            const result = await createMyLessonPlan({
                gradeId: target.gradeId,
                subjectId: target.subjectId,
                topic: form.topic,
                objectives: form.objectives,
                activities: form.activities,
                resources: form.resources,
                assessmentPlan: form.assessmentPlan,
                weekNumber: form.weekNumber,
                duration: form.duration,
            });
            if (result.success) {
                toast.success('Lesson plan saved as a draft.');
                setForm(EMPTY_FORM);
                setOpen(false);
                router.refresh();
            } else {
                toast.error(result.error || 'Could not save the lesson plan.');
            }
        });
    }

    function submitPlan(planId: string) {
        startTransition(async () => {
            const result = await submitMyLessonPlan(planId);
            if (result.success) {
                toast.success('Lesson plan submitted for approval.');
                router.refresh();
            } else {
                toast.error(result.error || 'Could not submit the lesson plan.');
            }
        });
    }

    return (
        <div className="space-y-6">
            {targets.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border p-5 text-sm text-muted-foreground">
                    A lesson plan is filed against a grade and subject from your timetable. You have no
                    timetabled periods, so there is nothing to plan against yet.
                </div>
            ) : !open ? (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                >
                    New lesson plan
                </button>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border p-5 space-y-4">
                    <h2 className="font-semibold text-foreground">New lesson plan</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="text-sm">
                            <span className="block mb-1 text-muted-foreground">Grade and subject</span>
                            <select
                                value={form.targetIndex}
                                onChange={(e) => set('targetIndex', e.target.value)}
                                className="w-full border border-border rounded-lg px-3 py-2"
                            >
                                {targets.map((target, index) => (
                                    <option key={`${target.gradeId}-${target.subjectId}`} value={String(index)}>
                                        {target.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="text-sm">
                            <span className="block mb-1 text-muted-foreground">Topic</span>
                            <input
                                type="text"
                                value={form.topic}
                                onChange={(e) => set('topic', e.target.value)}
                                className="w-full border border-border rounded-lg px-3 py-2"
                            />
                        </label>
                        <label className="text-sm">
                            <span className="block mb-1 text-muted-foreground">Week number (optional)</span>
                            <input
                                type="number"
                                min={1}
                                step={1}
                                value={form.weekNumber}
                                onChange={(e) => set('weekNumber', e.target.value)}
                                className="w-full border border-border rounded-lg px-3 py-2"
                            />
                        </label>
                        <label className="text-sm">
                            <span className="block mb-1 text-muted-foreground">Duration in minutes (optional)</span>
                            <input
                                type="number"
                                min={1}
                                step={1}
                                value={form.duration}
                                onChange={(e) => set('duration', e.target.value)}
                                className="w-full border border-border rounded-lg px-3 py-2"
                            />
                        </label>
                        <TextBlock
                            label="Objectives"
                            value={form.objectives}
                            onChange={(v) => set('objectives', v)}
                        />
                        <TextBlock
                            label="Activities"
                            value={form.activities}
                            onChange={(v) => set('activities', v)}
                        />
                        <TextBlock
                            label="Resources"
                            value={form.resources}
                            onChange={(v) => set('resources', v)}
                        />
                        <TextBlock
                            label="Assessment plan"
                            value={form.assessmentPlan}
                            onChange={(v) => set('assessmentPlan', v)}
                        />
                    </div>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={create}
                            disabled={pending}
                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-5 py-2 rounded-lg text-sm font-medium"
                        >
                            {pending ? 'Saving…' : 'Save draft'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            disabled={pending}
                            className="border border-border text-foreground px-5 py-2 rounded-lg text-sm font-medium hover:bg-muted"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {plans.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
                    <p className="font-medium text-foreground">You have no lesson plans yet.</p>
                    <p className="text-sm text-muted-foreground mt-2">Only plans filed by you appear here.</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border divide-y" data-testid="lesson-plan-list">
                    {plans.map((plan) => (
                        <div key={plan.id} className="p-4 space-y-2">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                    <p className="font-medium text-foreground">{plan.topic}</p>
                                    <p className="text-sm text-muted-foreground">
                                        {plan.gradeName ?? 'No grade'} · {plan.subjectName ?? 'No subject'}
                                        {plan.weekNumber !== null ? ` · week ${plan.weekNumber}` : ''}
                                        {plan.duration !== null ? ` · ${plan.duration} min` : ''}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`text-xs px-2 py-1 rounded border ${
                                            STATUS_STYLES[plan.status] ?? 'bg-muted text-foreground border-border'
                                        }`}
                                    >
                                        {plan.status}
                                    </span>
                                    {plan.status === 'DRAFT' && (
                                        <button
                                            type="button"
                                            onClick={() => submitPlan(plan.id)}
                                            disabled={pending}
                                            className="text-xs border border-blue-300 text-blue-700 px-3 py-1.5 rounded hover:bg-blue-50 disabled:opacity-60"
                                        >
                                            Submit for approval
                                        </button>
                                    )}
                                </div>
                            </div>

                            <PlanField label="Objectives" value={plan.objectives} />
                            <PlanField label="Activities" value={plan.activities} />
                            <PlanField label="Resources" value={plan.resources} />
                            <PlanField label="Assessment" value={plan.assessmentPlan} />

                            {plan.approverName && (
                                <p className="text-xs text-emerald-700">
                                    Approved by {plan.approverName}
                                    {plan.approvedAt ? ` on ${plan.approvedAt.slice(0, 10)}` : ''}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function TextBlock({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
}) {
    return (
        <label className="text-sm md:col-span-1">
            <span className="block mb-1 text-muted-foreground">{label} (optional)</span>
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                rows={3}
                className="w-full border border-border rounded-lg px-3 py-2"
            />
        </label>
    );
}

function PlanField({ label, value }: { label: string; value: string | null }) {
    if (!value) return null;
    return (
        <p className="text-sm text-foreground">
            <span className="text-muted-foreground">{label}: </span>
            <span className="whitespace-pre-wrap">{value}</span>
        </p>
    );
}
