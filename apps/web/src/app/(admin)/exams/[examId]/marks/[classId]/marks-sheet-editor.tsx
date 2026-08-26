'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import { saveScheduleMarks } from '../../../_actions/exam-marks';
import type {
    MarkRecord,
    MarksSheetStudent,
    MarksSheetSubject,
} from '../../../_actions/exam-marks';

interface Props {
    examId: string;
    gradeName: string;
    subjects: MarksSheetSubject[];
    students: MarksSheetStudent[];
    marks: Record<string, Record<string, MarkRecord>>;
}

interface FieldState {
    value: string;
    isAbsent: boolean;
}

function buildInitialState(
    subjects: MarksSheetSubject[],
    students: MarksSheetStudent[],
    marks: Record<string, Record<string, MarkRecord>>,
): Record<string, Record<string, FieldState>> {
    const state: Record<string, Record<string, FieldState>> = {};
    for (const subject of subjects) {
        state[subject.scheduleId] = {};
        for (const student of students) {
            const saved = marks[subject.scheduleId]?.[student.studentId];
            state[subject.scheduleId][student.studentId] = {
                value: saved && saved.marksObtained !== null ? String(saved.marksObtained) : '',
                isAbsent: saved?.isAbsent ?? false,
            };
        }
    }
    return state;
}

export function MarksSheetEditor({ examId, gradeName, subjects, students, marks }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [activeSchedule, setActiveSchedule] = useState<string>(subjects[0].scheduleId);
    const [fields, setFields] = useState(() => buildInitialState(subjects, students, marks));
    const [dirty, setDirty] = useState(false);

    const subject = useMemo(
        () => subjects.find((s) => s.scheduleId === activeSchedule) ?? subjects[0],
        [subjects, activeSchedule],
    );

    const isLocked = (studentId: string) =>
        marks[activeSchedule]?.[studentId]?.locked === true;

    const setField = (studentId: string, next: FieldState) => {
        setDirty(true);
        setFields((prev) => ({
            ...prev,
            [activeSchedule]: { ...prev[activeSchedule], [studentId]: next },
        }));
    };

    const current = useMemo(
        () => fields[activeSchedule] ?? {},
        [fields, activeSchedule],
    );

    // Section dividers, resolved up front so nothing is mutated during render.
    const sectionStarts = useMemo(() => {
        const starts = new Map<string, string>();
        let last: string | null = null;
        for (const student of students) {
            if (student.sectionName && student.sectionName !== last) {
                starts.set(student.studentId, student.sectionName);
            }
            last = student.sectionName ?? last;
        }
        return starts;
    }, [students]);

    const stats = useMemo(() => {
        let entered = 0;
        let absent = 0;
        let passed = 0;
        let invalid = 0;
        let sum = 0;
        for (const student of students) {
            const field = current[student.studentId];
            if (!field) continue;
            if (field.isAbsent) {
                absent += 1;
                entered += 1;
                continue;
            }
            if (field.value.trim() === '') continue;
            const numeric = Number(field.value);
            if (!Number.isFinite(numeric) || numeric < 0 || numeric > subject.maxMarks) {
                invalid += 1;
                continue;
            }
            entered += 1;
            sum += numeric;
            if (numeric >= subject.passingMarks) passed += 1;
        }
        const scored = entered - absent;
        return {
            entered,
            absent,
            invalid,
            passed,
            average: scored > 0 ? Math.round((sum / scored) * 10) / 10 : null,
        };
    }, [current, students, subject]);

    const lockedCount = students.filter((s) => isLocked(s.studentId)).length;

    const handleSave = () => {
        if (stats.invalid > 0) {
            toast.error(`${stats.invalid} entry(ies) are outside 0–${subject.maxMarks}. Fix them first.`);
            return;
        }

        const entries = students
            .filter((student) => !isLocked(student.studentId))
            .map((student) => {
                const field = current[student.studentId];
                const trimmed = field?.value.trim() ?? '';
                return {
                    studentId: student.studentId,
                    isAbsent: field?.isAbsent ?? false,
                    marksObtained: field?.isAbsent || trimmed === '' ? null : Number(trimmed),
                };
            });

        if (entries.length === 0) {
            toast.error('Every result for this subject is locked by verification.');
            return;
        }

        startTransition(async () => {
            const result = await saveScheduleMarks(activeSchedule, entries);
            if (!result.success) {
                toast.error(result.error || 'Failed to save marks');
                return;
            }
            const parts = [`${result.saved} saved`];
            if (result.cleared > 0) parts.push(`${result.cleared} cleared`);
            if (result.skippedLocked > 0) parts.push(`${result.skippedLocked} locked and skipped`);
            toast.success(`${subject.subjectCode}: ${parts.join(', ')}`);
            setDirty(false);
            router.refresh();
        });
    };

    return (
        <div className="space-y-4">
            {/* Subject tabs — one per scheduled paper for this class */}
            <div className="bg-white rounded-xl shadow-sm border p-2">
                <div className="flex gap-2 overflow-x-auto">
                    {subjects.map((s) => {
                        const savedForSubject = marks[s.scheduleId]
                            ? Object.keys(marks[s.scheduleId]).length
                            : 0;
                        const active = s.scheduleId === activeSchedule;
                        return (
                            <button
                                key={s.scheduleId}
                                type="button"
                                onClick={() => setActiveSchedule(s.scheduleId)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                                    active
                                        ? 'bg-blue-600 text-white'
                                        : savedForSubject > 0
                                          ? 'bg-green-50 text-green-700 hover:bg-green-100'
                                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                                title={`${s.subjectName} • ${savedForSubject} of ${students.length} saved`}
                            >
                                {s.subjectCode}
                                <span className={`ml-2 text-xs ${active ? 'text-blue-100' : 'text-gray-500'}`}>
                                    {savedForSubject}/{students.length}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Live tally for the open subject */}
            <div className="bg-white rounded-xl shadow-sm border p-4 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h2 className="font-semibold text-gray-900">
                        {subject.subjectName} — {gradeName}
                    </h2>
                    <p className="text-sm text-gray-500">
                        Max {subject.maxMarks} · Pass {subject.passingMarks}
                    </p>
                </div>
                <div className="flex gap-6 text-sm">
                    <div>
                        <p className="text-gray-500">Filled</p>
                        <p className="font-semibold text-gray-900">
                            {stats.entered}/{students.length}
                        </p>
                    </div>
                    <div>
                        <p className="text-gray-500">Absent</p>
                        <p className="font-semibold text-gray-900">{stats.absent}</p>
                    </div>
                    <div>
                        <p className="text-gray-500">At/above pass</p>
                        <p className="font-semibold text-gray-900">{stats.passed}</p>
                    </div>
                    <div>
                        <p className="text-gray-500">Average</p>
                        <p className="font-semibold text-gray-900">
                            {stats.average === null ? '—' : stats.average}
                        </p>
                    </div>
                </div>
            </div>

            {lockedCount > 0 && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    {lockedCount} result(s) for this subject were locked by verification and are read-only.
                </div>
            )}

            {/* Entry table */}
            <div className="bg-white rounded-xl shadow-sm border divide-y">
                {students.map((student, index) => {
                    const field = current[student.studentId] ?? { value: '', isAbsent: false };
                    const locked = isLocked(student.studentId);
                    const numeric = Number(field.value);
                    const invalid =
                        field.value.trim() !== '' &&
                        (!Number.isFinite(numeric) || numeric < 0 || numeric > subject.maxMarks);
                    const savedRecord = marks[activeSchedule]?.[student.studentId];
                    const unchanged =
                        savedRecord &&
                        savedRecord.isAbsent === field.isAbsent &&
                        String(savedRecord.marksObtained ?? '') === field.value.trim();

                    const sectionHeader = sectionStarts.get(student.studentId) ?? null;

                    return (
                        <div key={student.studentId}>
                            {sectionHeader && (
                                <div className="px-4 py-2 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    Section {sectionHeader}
                                </div>
                            )}
                            <div
                                className={`p-3 flex items-center gap-3 ${
                                    field.isAbsent ? 'bg-red-50/60' : ''
                                }`}
                            >
                                <div className="w-9 h-9 shrink-0 bg-gray-100 rounded-full flex items-center justify-center text-sm font-medium text-gray-600">
                                    {student.rollNumber ?? index + 1}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-gray-900 truncate">
                                        {student.firstName} {student.lastName}
                                    </p>
                                    <p className="text-xs text-gray-500">{student.admissionNumber}</p>
                                </div>

                                {unchanged && savedRecord?.grade && (
                                    <span className="hidden sm:inline px-2 py-1 rounded bg-gray-100 text-xs font-medium text-gray-600">
                                        {savedRecord.grade}
                                    </span>
                                )}

                                {locked ? (
                                    <span className="flex items-center gap-1 text-xs text-gray-500">
                                        <Lock className="h-3 w-3" />
                                        Locked
                                    </span>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setField(student.studentId, {
                                                value: '',
                                                isAbsent: !field.isAbsent,
                                            })
                                        }
                                        className={`px-3 py-1 rounded-lg text-xs font-medium ${
                                            field.isAbsent
                                                ? 'bg-red-500 text-white'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                    >
                                        Absent
                                    </button>
                                )}

                                <div className="w-24">
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        step="0.5"
                                        min={0}
                                        max={subject.maxMarks}
                                        value={field.value}
                                        disabled={locked || field.isAbsent}
                                        onChange={(e) =>
                                            setField(student.studentId, {
                                                value: e.target.value,
                                                isAbsent: false,
                                            })
                                        }
                                        placeholder="—"
                                        aria-label={`Marks for ${student.firstName} ${student.lastName}`}
                                        className={`w-full px-3 py-2 border rounded-lg text-center font-medium ${
                                            locked || field.isAbsent
                                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200'
                                                : invalid
                                                  ? 'border-red-300 bg-red-50 text-red-700'
                                                  : 'border-gray-300'
                                        }`}
                                    />
                                </div>
                                <span className="text-xs text-gray-400 w-12">/ {subject.maxMarks}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="flex flex-wrap items-center gap-3 sticky bottom-0 bg-white/95 backdrop-blur py-4 border-t">
                <Link
                    href={`/exams/${examId}`}
                    className="px-5 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                    Back to exam
                </Link>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={isPending}
                    className="flex-1 min-w-[12rem] px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                    {isPending ? 'Saving…' : `Save ${subject.subjectCode} marks`}
                </button>
                <p className="text-xs text-gray-500 w-full">
                    Blank fields clear any previously saved mark for that student. Grades are
                    recalculated from the marks on save.
                    {dirty && <span className="ml-1 font-medium text-amber-600">Unsaved changes.</span>}
                </p>
            </div>
        </div>
    );
}
