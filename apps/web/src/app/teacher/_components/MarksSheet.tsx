'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { saveMyMarks, type MarksSheetRow } from '../_actions/marks';

interface Draft {
    marks: string;
    isAbsent: boolean;
}

export function MarksSheet({
    scheduleId,
    maxMarks,
    passingMarks,
    rows,
}: {
    scheduleId: string;
    maxMarks: number;
    passingMarks: number;
    rows: MarksSheetRow[];
}) {
    const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
        Object.fromEntries(
            rows.map((r) => [
                r.studentId,
                { marks: r.marksObtained ?? '', isAbsent: r.isAbsent },
            ])
        )
    );
    const [pending, startTransition] = useTransition();

    const editable = rows.filter((r) => !r.isLocked);
    const lockedCount = rows.length - editable.length;

    function update(studentId: string, patch: Partial<Draft>) {
        setDrafts((prev) => ({ ...prev, [studentId]: { ...prev[studentId], ...patch } }));
    }

    function submit() {
        const entries: { studentId: string; marksObtained: number | null; isAbsent: boolean }[] = [];

        for (const row of editable) {
            const draft = drafts[row.studentId];
            if (!draft) continue;
            const raw = draft.marks.trim();

            if (draft.isAbsent) {
                entries.push({ studentId: row.studentId, marksObtained: null, isAbsent: true });
                continue;
            }
            // Blank means "not marked yet" and is left alone rather than stored as zero.
            if (raw === '') continue;

            const value = Number(raw);
            if (!Number.isFinite(value) || value < 0 || value > maxMarks) {
                toast.error(
                    `${row.firstName} ${row.lastName}: marks must be a number between 0 and ${maxMarks}.`
                );
                return;
            }
            entries.push({ studentId: row.studentId, marksObtained: value, isAbsent: false });
        }

        if (entries.length === 0) {
            toast.error('Enter a mark or tick absent for at least one student.');
            return;
        }

        startTransition(async () => {
            const result = await saveMyMarks({ scheduleId, entries });
            if (result.success) {
                toast.success(`Saved marks for ${result.saved} student(s).`);
            } else {
                toast.error(result.error || 'Could not save marks.');
            }
        });
    }

    if (rows.length === 0) {
        return (
            <div className="bg-white rounded-xl shadow-sm border p-8 text-center text-muted-foreground">
                No active students sit this paper in the sections you teach.
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border">
            {lockedCount > 0 && (
                <div className="p-3 bg-amber-50 border-b border-amber-200 text-sm text-amber-800">
                    {lockedCount} result(s) have been locked by the verification workflow and can no longer be
                    edited here.
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="teacher-marks-sheet">
                    <thead className="bg-muted border-b">
                        <tr>
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Roll</th>
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Student</th>
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Section</th>
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Marks / {maxMarks}</th>
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Absent</th>
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Saved grade</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {rows.map((row) => {
                            const draft = drafts[row.studentId];
                            const value = draft?.marks ?? '';
                            const numeric = value === '' ? null : Number(value);
                            const failing =
                                numeric !== null && Number.isFinite(numeric) && numeric < passingMarks;
                            return (
                                <tr key={row.studentId} className={row.isLocked ? 'bg-muted' : ''}>
                                    <td className="px-4 py-2 text-muted-foreground">{row.rollNumber ?? '—'}</td>
                                    <td className="px-4 py-2">
                                        <div className="font-medium text-foreground">
                                            {row.firstName} {row.lastName}
                                        </div>
                                        <div className="text-xs text-muted-foreground font-mono">
                                            {row.admissionNumber}
                                        </div>
                                    </td>
                                    <td className="px-4 py-2 text-muted-foreground">{row.sectionName}</td>
                                    <td className="px-4 py-2">
                                        <input
                                            type="number"
                                            min={0}
                                            max={maxMarks}
                                            step="0.01"
                                            inputMode="decimal"
                                            value={draft?.isAbsent ? '' : value}
                                            disabled={row.isLocked || pending || draft?.isAbsent}
                                            onChange={(e) => update(row.studentId, { marks: e.target.value })}
                                            className={`w-24 border rounded px-2 py-1 disabled:bg-muted disabled:text-muted-foreground ${
                                                failing && !draft?.isAbsent
                                                    ? 'border-rose-400 text-rose-700'
                                                    : 'border-border'
                                            }`}
                                            aria-label={`Marks for ${row.firstName} ${row.lastName}`}
                                        />
                                    </td>
                                    <td className="px-4 py-2">
                                        <input
                                            type="checkbox"
                                            checked={draft?.isAbsent ?? false}
                                            disabled={row.isLocked || pending}
                                            onChange={(e) =>
                                                update(row.studentId, { isAbsent: e.target.checked })
                                            }
                                            className="w-4 h-4"
                                            aria-label={`Mark ${row.firstName} ${row.lastName} absent`}
                                        />
                                    </td>
                                    <td className="px-4 py-2 text-muted-foreground">
                                        {row.grade ?? <span className="text-muted-foreground">not entered</span>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="p-4 border-t flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                    Pass mark {passingMarks} of {maxMarks}. Blank fields are skipped, not stored as zero.
                </p>
                <button
                    type="button"
                    onClick={submit}
                    disabled={pending || editable.length === 0}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-5 py-2 rounded-lg text-sm font-medium"
                >
                    {pending ? 'Saving…' : 'Save marks'}
                </button>
            </div>
        </div>
    );
}
