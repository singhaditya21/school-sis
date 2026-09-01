'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { markMyAttendance, type AttendanceRollRow } from '../_actions/attendance';

const STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const;

const STATUS_STYLES: Record<string, string> = {
    PRESENT: 'bg-emerald-600 text-white border-emerald-600',
    ABSENT: 'bg-rose-600 text-white border-rose-600',
    LATE: 'bg-amber-500 text-white border-amber-500',
    EXCUSED: 'bg-slate-600 text-white border-slate-600',
};

export function AttendanceSheet({
    sectionId,
    date,
    roll,
}: {
    sectionId: string;
    date: string;
    roll: AttendanceRollRow[];
}) {
    // A pupil with no record yet starts unset: defaulting everyone to PRESENT is
    // how a sheet nobody looked at becomes a full day of "present".
    const [statuses, setStatuses] = useState<Record<string, string>>(() =>
        Object.fromEntries(roll.filter((r) => r.status).map((r) => [r.studentId, r.status as string]))
    );
    const [pending, startTransition] = useTransition();

    const unmarked = roll.filter((r) => !statuses[r.studentId]).length;

    function setAll(status: string) {
        setStatuses(Object.fromEntries(roll.map((r) => [r.studentId, status])));
    }

    function submit() {
        const entries = roll
            .filter((r) => statuses[r.studentId])
            .map((r) => ({ studentId: r.studentId, status: statuses[r.studentId] }));

        if (entries.length === 0) {
            toast.error('Mark at least one student before saving.');
            return;
        }

        startTransition(async () => {
            const result = await markMyAttendance({ sectionId, date, entries });
            if (result.success) {
                toast.success(`Attendance saved for ${result.saved} student(s).`);
            } else {
                toast.error(result.error || 'Could not save attendance.');
            }
        });
    }

    if (roll.length === 0) {
        return (
            <div className="bg-white rounded-xl shadow-sm border p-8 text-center text-muted-foreground">
                No active students are enrolled in this section.
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border">
            <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                    {roll.length} students · {unmarked} not yet marked
                </p>
                <div className="flex gap-2">
                    {STATUSES.map((status) => (
                        <button
                            key={status}
                            type="button"
                            onClick={() => setAll(status)}
                            className="text-xs px-2.5 py-1.5 rounded border border-border text-foreground hover:bg-muted"
                        >
                            All {status.toLowerCase()}
                        </button>
                    ))}
                </div>
            </div>

            <div className="divide-y" data-testid="teacher-attendance-roll">
                {roll.map((student) => (
                    <div
                        key={student.studentId}
                        className="p-4 flex flex-wrap items-center justify-between gap-3"
                        data-testid={`attendance-row-${student.studentId}`}
                    >
                        <div>
                            <p className="font-medium text-foreground">
                                {student.rollNumber !== null ? `${student.rollNumber}. ` : ''}
                                {student.firstName} {student.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono">{student.admissionNumber}</p>
                        </div>
                        <div className="flex gap-2">
                            {STATUSES.map((status) => {
                                const active = statuses[student.studentId] === status;
                                return (
                                    <button
                                        key={status}
                                        type="button"
                                        disabled={pending}
                                        onClick={() =>
                                            setStatuses((prev) => ({ ...prev, [student.studentId]: status }))
                                        }
                                        className={`text-xs px-3 py-1.5 rounded border font-medium transition-colors disabled:opacity-50 ${
                                            active
                                                ? STATUS_STYLES[status]
                                                : 'bg-white text-muted-foreground border-border hover:bg-muted'
                                        }`}
                                    >
                                        {status.charAt(0) + status.slice(1).toLowerCase()}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            <div className="p-4 border-t flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                    Students left unmarked are not saved and keep whatever was recorded before.
                </p>
                <button
                    type="button"
                    onClick={submit}
                    disabled={pending}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-5 py-2 rounded-lg text-sm font-medium"
                >
                    {pending ? 'Saving…' : 'Save attendance'}
                </button>
            </div>
        </div>
    );
}
