'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { enterMarks } from '@/lib/actions/exams';
import Link from 'next/link';

interface Student {
    id: string;
    firstName: string;
    lastName: string;
    admissionNumber: string;
}

interface Subject {
    id: string;
    name: string;
    code: string;
}

interface MarksEntryFormProps {
    examId: string;
    maxMarks: number;
    students: Student[];
    subjects: Subject[];
    existingMarks: Record<string, Record<string, { marksObtained: number; isAbsent: boolean }>>;
}

export function MarksEntryForm({
    examId,
    maxMarks,
    students,
    subjects,
    existingMarks,
}: MarksEntryFormProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [selectedSubject, setSelectedSubject] = useState<string>(subjects[0]?.id || '');

    // Initialize marks state
    const [marks, setMarks] = useState<Record<string, Record<string, { value: string; isAbsent: boolean }>>>(() => {
        const initial: Record<string, Record<string, { value: string; isAbsent: boolean }>> = {};
        students.forEach((student) => {
            initial[student.id] = {};
            subjects.forEach((subject) => {
                const existing = existingMarks[student.id]?.[subject.id];
                initial[student.id][subject.id] = {
                    value: existing ? existing.marksObtained.toString() : '',
                    isAbsent: existing?.isAbsent || false,
                };
            });
        });
        return initial;
    });

    const updateMark = (studentId: string, subjectId: string, value: string) => {
        setMarks((prev) => ({
            ...prev,
            [studentId]: {
                ...prev[studentId],
                [subjectId]: {
                    ...prev[studentId][subjectId],
                    value,
                    isAbsent: false,
                },
            },
        }));
    };

    const toggleAbsent = (studentId: string, subjectId: string) => {
        setMarks((prev) => ({
            ...prev,
            [studentId]: {
                ...prev[studentId],
                [subjectId]: {
                    value: '',
                    isAbsent: !prev[studentId][subjectId].isAbsent,
                },
            },
        }));
    };

    const handleSubmit = async () => {
        // Only submit marks for selected subject
        const marksData = students
            .map((student) => {
                const studentMark = marks[student.id][selectedSubject];
                if (!studentMark.value && !studentMark.isAbsent) return null;

                return {
                    studentId: student.id,
                    subjectId: selectedSubject,
                    marksObtained: studentMark.isAbsent ? 0 : parseFloat(studentMark.value) || 0,
                    isAbsent: studentMark.isAbsent,
                };
            })
            .filter((m): m is NonNullable<typeof m> => m !== null);

        if (marksData.length === 0) {
            alert('Please enter at least one mark');
            return;
        }

        startTransition(async () => {
            const result = await enterMarks(examId, marksData);
            if (result.success) {
                alert('Marks saved successfully!');
                router.refresh();
            } else {
                alert(result.error || 'Failed to save marks');
            }
        });
    };

    // Calculate stats for selected subject
    const subjectStats = {
        entered: students.filter((s) => marks[s.id][selectedSubject]?.value || marks[s.id][selectedSubject]?.isAbsent).length,
        total: students.length,
    };

    const currentSubject = subjects.find((s) => s.id === selectedSubject);

    return (
        <div className="space-y-4">
            {/* Subject Tabs */}
            <div className="bg-white rounded-xl shadow-sm border p-2">
                <div className="flex gap-2 overflow-x-auto">
                    {subjects.map((subject) => {
                        const hasMarks = students.some(
                            (s) => marks[s.id][subject.id]?.value || marks[s.id][subject.id]?.isAbsent
                        );

                        return (
                            <button
                                key={subject.id}
                                onClick={() => setSelectedSubject(subject.id)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${selectedSubject === subject.id
                                        ? 'bg-blue-600 text-white'
                                        : hasMarks
                                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                            >
                                {subject.code}
                                {hasMarks && selectedSubject !== subject.id && ' ✓'}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Current Subject Header */}
            <div className="bg-white rounded-xl shadow-sm border p-4 flex justify-between items-center">
                <div>
                    <h3 className="font-semibold text-gray-900">
                        {currentSubject?.name || 'Select Subject'}
                    </h3>
                    <p className="text-sm text-gray-500">
                        {subjectStats.entered} of {subjectStats.total} students marked
                    </p>
                </div>
                <div className="text-sm text-gray-500">
                    Max: <span className="font-bold text-blue-600">{maxMarks}</span>
                </div>
            </div>

            {/* Marks Entry Table */}
            <div className="bg-white rounded-xl shadow-sm border divide-y">
                {students.map((student, index) => {
                    const studentMark = marks[student.id][selectedSubject];
                    const isAbsent = studentMark?.isAbsent;
                    const markValue = studentMark?.value || '';
                    const numericValue = parseFloat(markValue) || 0;
                    const isInvalid = markValue && (numericValue < 0 || numericValue > maxMarks);

                    return (
                        <div
                            key={student.id}
                            className={`p-4 flex items-center gap-4 ${isAbsent ? 'bg-red-50' : ''
                                }`}
                        >
                            {/* Roll Number */}
                            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center font-medium text-gray-600">
                                {index + 1}
                            </div>

                            {/* Student Info */}
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900">
                                    {student.firstName} {student.lastName}
                                </p>
                                <p className="text-sm text-gray-500">{student.admissionNumber}</p>
                            </div>

                            {/* Absent Toggle */}
                            <button
                                onClick={() => toggleAbsent(student.id, selectedSubject)}
                                className={`px-3 py-1 rounded-lg text-sm font-medium ${isAbsent
                                        ? 'bg-red-500 text-white'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                            >
                                Absent
                            </button>

                            {/* Marks Input */}
                            <div className="w-24">
                                <input
                                    type="number"
                                    value={markValue}
                                    onChange={(e) => updateMark(student.id, selectedSubject, e.target.value)}
                                    disabled={isAbsent}
                                    min={0}
                                    max={maxMarks}
                                    placeholder="0"
                                    className={`w-full px-3 py-2 border rounded-lg text-center font-medium ${isAbsent
                                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                            : isInvalid
                                                ? 'border-red-300 bg-red-50 text-red-600'
                                                : 'border-gray-300'
                                        }`}
                                />
                            </div>

                            {/* Max Marks Label */}
                            <span className="text-sm text-gray-400 w-12">/ {maxMarks}</span>
                        </div>
                    );
                })}
            </div>

            {/* Actions */}
            <div className="flex gap-4 sticky bottom-0 bg-white py-4 border-t">
                <Link
                    href={`/exams/${examId}`}
                    className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                    Cancel
                </Link>
                <button
                    onClick={handleSubmit}
                    disabled={isPending}
                    className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                    {isPending ? 'Saving...' : `Save ${currentSubject?.code} Marks`}
                </button>
            </div>
        </div>
    );
}
