'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { assignGridSlot, clearGridSlot } from '../_actions/grid';
import type { GridEntry, GridPeriod } from '../_actions/grid';
import { DAY_LABELS, DAY_OF_WEEK_VALUES, type DayOfWeek } from '../_lib/days';

interface SubjectOption {
    id: string;
    name: string;
    code: string;
}

interface TeacherOption {
    id: string;
    firstName: string;
    lastName: string;
}

interface OpenCell {
    period: GridPeriod;
    day: DayOfWeek;
    entry: GridEntry | null;
}

export default function TimetableGrid({
    sectionId,
    sectionLabel,
    periods,
    entries,
    subjects,
    teachers,
}: {
    sectionId: string;
    sectionLabel: string;
    periods: GridPeriod[];
    entries: GridEntry[];
    subjects: SubjectOption[];
    teachers: TeacherOption[];
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [openCell, setOpenCell] = useState<OpenCell | null>(null);
    const [subjectId, setSubjectId] = useState('');
    const [teacherId, setTeacherId] = useState('');
    const [roomNumber, setRoomNumber] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const cells = useMemo(() => {
        const map = new Map<string, GridEntry>();
        for (const entry of entries) {
            map.set(`${entry.periodId}::${entry.dayOfWeek}`, entry);
        }
        return map;
    }, [entries]);

    const teachingPeriods = periods.filter((period) => !period.isBreak);
    const capacity = teachingPeriods.length * DAY_OF_WEEK_VALUES.length;

    function openSlot(period: GridPeriod, day: DayOfWeek) {
        if (period.isBreak) return;
        const entry = cells.get(`${period.id}::${day}`) ?? null;
        setOpenCell({ period, day, entry });
        setSubjectId(entry?.subjectId ?? '');
        setTeacherId(entry?.teacherId ?? '');
        setRoomNumber(entry?.roomNumber ?? '');
        setError('');
        setMessage('');
    }

    function closeSlot() {
        setOpenCell(null);
        setError('');
    }

    function handleAssign() {
        if (!openCell) return;
        setError('');
        startTransition(async () => {
            const result = await assignGridSlot({
                sectionId,
                periodId: openCell.period.id,
                dayOfWeek: openCell.day,
                subjectId,
                teacherId,
                roomNumber: roomNumber || undefined,
            });
            if (!result.success) {
                setError(result.error ?? 'Could not assign this slot.');
                return;
            }
            setMessage(`Assigned ${DAY_LABELS[openCell.day]} · ${openCell.period.name}.`);
            setOpenCell(null);
            router.refresh();
        });
    }

    function handleClear() {
        if (!openCell?.entry) return;
        const entryId = openCell.entry.id;
        const label = `${DAY_LABELS[openCell.day]} · ${openCell.period.name}`;
        setError('');
        startTransition(async () => {
            const result = await clearGridSlot(entryId);
            if (!result.success) {
                setError(result.error ?? 'Could not clear this slot.');
                return;
            }
            setMessage(`Cleared ${label}.`);
            setOpenCell(null);
            router.refresh();
        });
    }

    return (
        <div className="space-y-4">
            {message && (
                <div data-testid="grid-message" className="p-3 bg-green-50 border border-green-300 text-green-800 rounded-lg text-sm">
                    {message}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span data-testid="grid-filled-count">
                    <strong className="text-foreground">{entries.length}</strong> of {capacity} teaching slots filled
                </span>
                <span>{teachingPeriods.length} teaching periods · {periods.length - teachingPeriods.length} breaks</span>
            </div>

            <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
                <table className="w-full min-w-[900px]" data-testid="timetable-grid">
                    <thead className="bg-muted">
                        <tr>
                            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground w-40">Period</th>
                            {DAY_OF_WEEK_VALUES.map((day) => (
                                <th key={day} className="px-3 py-3 text-left text-sm font-medium text-muted-foreground">
                                    {DAY_LABELS[day]}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {periods.map((period) => (
                            <tr key={period.id} className={period.isBreak ? 'bg-amber-50/60' : undefined}>
                                <td className="px-4 py-3 align-top">
                                    <div className="font-medium text-foreground">{period.name}</div>
                                    <div className="text-xs text-muted-foreground">{period.startTime} – {period.endTime}</div>
                                </td>
                                {period.isBreak ? (
                                    <td className="px-4 py-3 text-sm text-amber-700 italic" colSpan={DAY_OF_WEEK_VALUES.length}>
                                        Break — no classes scheduled
                                    </td>
                                ) : (
                                    DAY_OF_WEEK_VALUES.map((day) => {
                                        const entry = cells.get(`${period.id}::${day}`) ?? null;
                                        return (
                                            <td key={day} className="px-2 py-2 align-top">
                                                <button
                                                    type="button"
                                                    onClick={() => openSlot(period, day)}
                                                    data-testid={`grid-cell-${period.displayOrder}-${day}`}
                                                    className={
                                                        entry
                                                            ? 'w-full text-left p-2 rounded border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors'
                                                            : 'w-full h-16 rounded border-2 border-dashed border-border text-xs text-muted-foreground hover:border-blue-300 hover:text-blue-500 transition-colors'
                                                    }
                                                >
                                                    {entry ? (
                                                        <span className="block text-xs">
                                                            <span className="block font-semibold text-blue-900">{entry.subjectName}</span>
                                                            <span className="block text-muted-foreground">{entry.teacherName}</span>
                                                            {entry.roomNumber && (
                                                                <span className="block text-muted-foreground mt-0.5">Room {entry.roomNumber}</span>
                                                            )}
                                                        </span>
                                                    ) : (
                                                        'Assign'
                                                    )}
                                                </button>
                                            </td>
                                        );
                                    })
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Dialog open={openCell !== null} onOpenChange={(open) => { if (!open) closeSlot(); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {openCell ? `${sectionLabel} · ${DAY_LABELS[openCell.day]} · ${openCell.period.name}` : ''}
                        </DialogTitle>
                    </DialogHeader>

                    {openCell && (
                        <div className="space-y-4 pt-2">
                            {error && (
                                <div data-testid="grid-error" className="p-3 bg-red-50 border border-red-300 text-red-700 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}

                            <p className="text-xs text-muted-foreground">
                                {openCell.period.startTime} – {openCell.period.endTime}
                            </p>

                            {openCell.entry ? (
                                <div className="space-y-4">
                                    <div className="rounded-lg border p-3 text-sm space-y-1">
                                        <div><span className="text-muted-foreground">Subject:</span> <strong>{openCell.entry.subjectName}</strong> ({openCell.entry.subjectCode})</div>
                                        <div><span className="text-muted-foreground">Teacher:</span> {openCell.entry.teacherName}</div>
                                        <div><span className="text-muted-foreground">Room:</span> {openCell.entry.roomNumber || 'Not set'}</div>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Editing in place is not available in this release — clear the slot, then assign it again.
                                    </p>
                                    <div className="flex justify-end gap-3">
                                        <Button type="button" variant="outline" onClick={closeSlot}>Close</Button>
                                        <Button
                                            type="button"
                                            variant="destructive"
                                            data-testid="grid-clear-btn"
                                            disabled={isPending}
                                            onClick={handleClear}
                                        >
                                            {isPending ? 'Clearing…' : 'Clear slot'}
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div>
                                        <Label htmlFor="grid-subject">Subject</Label>
                                        <select
                                            id="grid-subject"
                                            data-testid="grid-subject-select"
                                            value={subjectId}
                                            onChange={(event) => setSubjectId(event.target.value)}
                                            className="w-full px-3 py-2 border rounded-lg bg-white mt-1"
                                        >
                                            <option value="">Select subject…</option>
                                            {subjects.map((subject) => (
                                                <option key={subject.id} value={subject.id}>
                                                    {subject.name} ({subject.code})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <Label htmlFor="grid-teacher">Teacher</Label>
                                        <select
                                            id="grid-teacher"
                                            data-testid="grid-teacher-select"
                                            value={teacherId}
                                            onChange={(event) => setTeacherId(event.target.value)}
                                            className="w-full px-3 py-2 border rounded-lg bg-white mt-1"
                                        >
                                            <option value="">Select teacher…</option>
                                            {teachers.map((teacher) => (
                                                <option key={teacher.id} value={teacher.id}>
                                                    {teacher.firstName} {teacher.lastName}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <Label htmlFor="grid-room">Room (optional)</Label>
                                        <Input
                                            id="grid-room"
                                            data-testid="grid-room-input"
                                            value={roomNumber}
                                            maxLength={20}
                                            onChange={(event) => setRoomNumber(event.target.value)}
                                            placeholder="e.g. 101"
                                            className="mt-1"
                                        />
                                    </div>
                                    <div className="flex justify-end gap-3">
                                        <Button type="button" variant="outline" onClick={closeSlot}>Cancel</Button>
                                        <Button
                                            type="button"
                                            data-testid="grid-assign-btn"
                                            disabled={isPending || !subjectId || !teacherId}
                                            onClick={handleAssign}
                                        >
                                            {isPending ? 'Saving…' : 'Assign'}
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
