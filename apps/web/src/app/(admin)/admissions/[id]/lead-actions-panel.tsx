'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import {
    assignLead,
    enrolLead,
    notifyParentOfStage,
    type GradeWithSections,
    type LeadOwnerOption,
} from '../actions';
import { NOTIFIABLE_STAGES, STAGE_LABELS } from '../constants';

interface Props {
    leadId: string;
    stage: string;
    assignedToId: string | null;
    owners: LeadOwnerOption[];
    grades: GradeWithSections[];
    emailConfigured: boolean;
    applyingForGrade: string;
}

const selectClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-blue-500 disabled:opacity-50';

export default function LeadActionsPanel({
    leadId,
    stage,
    assignedToId,
    owners,
    grades,
    emailConfigured,
    applyingForGrade,
}: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [owner, setOwner] = useState(assignedToId ?? '');

    const guessedGrade = grades.find(
        (g) => g.name.toLowerCase() === applyingForGrade.trim().toLowerCase(),
    );
    const [gradeId, setGradeId] = useState(guessedGrade?.id ?? '');
    const [sectionId, setSectionId] = useState('');

    const sections = grades.find((g) => g.id === gradeId)?.sections ?? [];
    const alreadyEnrolled = stage === 'ENROLLED';
    const canNotify = emailConfigured && NOTIFIABLE_STAGES.includes(stage);

    function handleAssign(next: string) {
        setOwner(next);
        startTransition(async () => {
            const result = await assignLead(leadId, next === '' ? null : next);
            if (result.success) {
                toast.success(next ? 'Lead assigned.' : 'Lead unassigned.');
                router.refresh();
            } else {
                setOwner(assignedToId ?? '');
                toast.error(result.error || 'Could not update the assignment.');
            }
        });
    }

    function handleNotify() {
        startTransition(async () => {
            const result = await notifyParentOfStage(leadId);
            if (result.success) {
                toast.success(result.message || 'Parent notified.');
            } else {
                toast.error(result.error || 'The parent could not be notified.');
            }
        });
    }

    function handleEnrol() {
        if (!gradeId || !sectionId) {
            toast.error('Pick a grade and a section first.');
            return;
        }
        startTransition(async () => {
            const result = await enrolLead(leadId, gradeId, sectionId);
            if (result.success) {
                toast.success('Student record created and the lead marked enrolled.');
                router.refresh();
            } else {
                toast.error(result.error || 'Enrolment failed.');
            }
        });
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Ownership &amp; Follow-up</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div>
                        <label htmlFor="lead-owner" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Assigned counsellor
                        </label>
                        <select
                            id="lead-owner"
                            value={owner}
                            disabled={isPending || owners.length === 0}
                            onChange={(e) => handleAssign(e.target.value)}
                            className={selectClass}
                        >
                            <option value="">Unassigned</option>
                            {owners.map((o) => (
                                <option key={o.id} value={o.id}>
                                    {o.name} — {o.role.replace(/_/g, ' ').toLowerCase()}
                                </option>
                            ))}
                        </select>
                        {owners.length === 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                                No active admissions staff accounts exist for this school yet.
                            </p>
                        )}
                    </div>

                    <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Parent email</p>
                        <button
                            type="button"
                            onClick={handleNotify}
                            disabled={isPending || !canNotify}
                            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                        >
                            Email parent about &ldquo;{STAGE_LABELS[stage] || stage}&rdquo;
                        </button>
                        {!emailConfigured ? (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                                No email provider is configured for this deployment, so stage emails cannot be
                                delivered.
                            </p>
                        ) : !NOTIFIABLE_STAGES.includes(stage) ? (
                            <p className="text-xs text-muted-foreground mt-2">
                                There is no parent template for this stage. Templates exist for contacted, form
                                submitted, interview scheduled, offered and rejected.
                            </p>
                        ) : null}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Enrolment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {alreadyEnrolled ? (
                        <p className="text-sm text-muted-foreground">
                            This lead has already been converted into a student record.
                        </p>
                    ) : grades.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No grades have been set up for this school yet, so a place cannot be allocated.
                        </p>
                    ) : (
                        <>
                            <p className="text-sm text-muted-foreground">
                                Creates a student record and a primary guardian from this lead, then marks the
                                lead enrolled.
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label htmlFor="enrol-grade" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Grade
                                    </label>
                                    <select
                                        id="enrol-grade"
                                        value={gradeId}
                                        disabled={isPending}
                                        onChange={(e) => {
                                            setGradeId(e.target.value);
                                            setSectionId('');
                                        }}
                                        className={selectClass}
                                    >
                                        <option value="">Select grade</option>
                                        {grades.map((g) => (
                                            <option key={g.id} value={g.id}>
                                                {g.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="enrol-section" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Section
                                    </label>
                                    <select
                                        id="enrol-section"
                                        value={sectionId}
                                        disabled={isPending || !gradeId}
                                        onChange={(e) => setSectionId(e.target.value)}
                                        className={selectClass}
                                    >
                                        <option value="">Select section</option>
                                        {sections.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.name}
                                            </option>
                                        ))}
                                    </select>
                                    {gradeId && sections.length === 0 && (
                                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                            This grade has no sections yet.
                                        </p>
                                    )}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handleEnrol}
                                disabled={isPending || !gradeId || !sectionId}
                                className="w-full px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium"
                            >
                                Enrol as student
                            </button>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
