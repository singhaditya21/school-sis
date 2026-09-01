'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { gradeMySubmission, type HomeworkRosterRow } from '../_actions/homework';

export function HomeworkRoster({
    rows,
    maxMarks,
}: {
    rows: HomeworkRosterRow[];
    maxMarks: number | null;
}) {
    const router = useRouter();
    const [drafts, setDrafts] = useState<Record<string, { marks: string; feedback: string }>>(() =>
        Object.fromEntries(
            rows
                .filter((r) => r.submissionId)
                .map((r) => [
                    r.submissionId as string,
                    { marks: r.marks !== null ? String(r.marks) : '', feedback: r.feedback ?? '' },
                ])
        )
    );
    const [savingId, setSavingId] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    if (rows.length === 0) {
        return (
            <div className="bg-white rounded-xl shadow-sm border p-8 text-center text-muted-foreground">
                No active students are enrolled in this section.
            </div>
        );
    }

    function save(submissionId: string) {
        const draft = drafts[submissionId];
        if (!draft) return;
        setSavingId(submissionId);
        startTransition(async () => {
            const result = await gradeMySubmission({
                submissionId,
                marks: draft.marks,
                feedback: draft.feedback,
            });
            setSavingId(null);
            if (result.success) {
                toast.success('Grade saved.');
                router.refresh();
            } else {
                toast.error(result.error || 'Could not save the grade.');
            }
        });
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border divide-y" data-testid="homework-roster">
            {rows.map((row) => {
                const submissionId = row.submissionId;
                const draft = submissionId ? drafts[submissionId] : undefined;
                return (
                    <div key={row.studentId} className="p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <p className="font-medium text-foreground">
                                    {row.rollNumber !== null ? `${row.rollNumber}. ` : ''}
                                    {row.firstName} {row.lastName}
                                </p>
                                <p className="text-xs text-muted-foreground font-mono">{row.admissionNumber}</p>
                            </div>
                            {submissionId ? (
                                <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded">
                                    Submitted{row.submittedAt ? ` ${row.submittedAt.slice(0, 10)}` : ''}
                                </span>
                            ) : (
                                <span className="text-xs text-muted-foreground bg-muted border border-border px-2 py-1 rounded">
                                    Nothing submitted
                                </span>
                            )}
                        </div>

                        {submissionId && (
                            <>
                                {row.content && (
                                    <p className="text-sm text-foreground bg-muted border border-border rounded-lg p-3 whitespace-pre-wrap">
                                        {row.content}
                                    </p>
                                )}
                                <div className="flex flex-wrap items-end gap-3">
                                    <label className="text-sm">
                                        <span className="block mb-1 text-muted-foreground">
                                            Marks{maxMarks !== null ? ` / ${maxMarks}` : ''}
                                        </span>
                                        <input
                                            type="number"
                                            min={0}
                                            step={1}
                                            value={draft?.marks ?? ''}
                                            disabled={pending}
                                            onChange={(e) =>
                                                setDrafts((prev) => ({
                                                    ...prev,
                                                    [submissionId]: {
                                                        marks: e.target.value,
                                                        feedback: prev[submissionId]?.feedback ?? '',
                                                    },
                                                }))
                                            }
                                            className="w-24 border border-border rounded px-2 py-1 disabled:bg-muted"
                                            aria-label={`Marks for ${row.firstName} ${row.lastName}`}
                                        />
                                    </label>
                                    <label className="text-sm flex-1 min-w-[200px]">
                                        <span className="block mb-1 text-muted-foreground">Feedback</span>
                                        <input
                                            type="text"
                                            value={draft?.feedback ?? ''}
                                            disabled={pending}
                                            onChange={(e) =>
                                                setDrafts((prev) => ({
                                                    ...prev,
                                                    [submissionId]: {
                                                        marks: prev[submissionId]?.marks ?? '',
                                                        feedback: e.target.value,
                                                    },
                                                }))
                                            }
                                            className="w-full border border-border rounded px-2 py-1 disabled:bg-muted"
                                            aria-label={`Feedback for ${row.firstName} ${row.lastName}`}
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => save(submissionId)}
                                        disabled={pending}
                                        className="bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium"
                                    >
                                        {savingId === submissionId && pending ? 'Saving…' : 'Save'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
