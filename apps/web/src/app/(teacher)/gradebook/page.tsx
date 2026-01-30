'use client';

import { useState } from 'react';

interface Student {
    id: string;
    name: string;
    rollNo: string;
    marks: { [key: string]: number | null };
}

interface Exam {
    id: string;
    name: string;
    maxMarks: number;
    date: string;
}

interface ClassOption {
    id: string;
    name: string;
}

// Mock data
const mockClasses: ClassOption[] = [
    { id: '1', name: 'Class 10-A - Mathematics' },
    { id: '2', name: 'Class 10-B - Mathematics' },
    { id: '3', name: 'Class 11-A - Mathematics' },
];

const mockExams: Exam[] = [
    { id: 'ut1', name: 'Unit Test 1', maxMarks: 25, date: '2026-01-10' },
    { id: 'ut2', name: 'Unit Test 2', maxMarks: 25, date: '2026-01-20' },
    { id: 'midterm', name: 'Mid-Term', maxMarks: 100, date: '2025-12-15' },
    { id: 'assignment1', name: 'Assignment 1', maxMarks: 10, date: '2026-01-05' },
];

const mockStudents: Student[] = [
    { id: '1', name: 'Aarav Sharma', rollNo: '01', marks: { ut1: 22, ut2: null, midterm: 85, assignment1: 9 } },
    { id: '2', name: 'Aditi Patel', rollNo: '02', marks: { ut1: 24, ut2: null, midterm: 92, assignment1: 10 } },
    { id: '3', name: 'Arjun Singh', rollNo: '03', marks: { ut1: 18, ut2: null, midterm: 78, assignment1: 8 } },
    { id: '4', name: 'Diya Gupta', rollNo: '04', marks: { ut1: 20, ut2: null, midterm: 88, assignment1: 9 } },
    { id: '5', name: 'Ishaan Kumar', rollNo: '05', marks: { ut1: 15, ut2: null, midterm: 65, assignment1: 7 } },
    { id: '6', name: 'Kavya Reddy', rollNo: '06', marks: { ut1: 23, ut2: null, midterm: 90, assignment1: 10 } },
    { id: '7', name: 'Lakshmi Nair', rollNo: '07', marks: { ut1: 21, ut2: null, midterm: 82, assignment1: 8 } },
    { id: '8', name: 'Manav Joshi', rollNo: '08', marks: { ut1: 19, ut2: null, midterm: 75, assignment1: 9 } },
];

export default function GradebookPage() {
    const [selectedClass, setSelectedClass] = useState<string>('');
    const [selectedExam, setSelectedExam] = useState<string>('');
    const [students, setStudents] = useState<Student[]>(mockStudents);
    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);

    const currentExam = mockExams.find(e => e.id === selectedExam);

    const handleMarksChange = (studentId: string, marks: string) => {
        const numMarks = marks === '' ? null : parseInt(marks, 10);
        if (numMarks !== null && currentExam && numMarks > currentExam.maxMarks) {
            return; // Don't allow marks > max
        }

        setStudents(prev =>
            prev.map(s =>
                s.id === studentId
                    ? { ...s, marks: { ...s.marks, [selectedExam]: numMarks } }
                    : s
            )
        );
    };

    const handleSave = async () => {
        setIsSaving(true);
        await new Promise(resolve => setTimeout(resolve, 1000));
        setIsSaving(false);
        setLastSaved(new Date());
    };

    const getGrade = (marks: number, maxMarks: number): { grade: string; color: string } => {
        const percentage = (marks / maxMarks) * 100;
        if (percentage >= 90) return { grade: 'A+', color: 'text-emerald-600' };
        if (percentage >= 80) return { grade: 'A', color: 'text-emerald-500' };
        if (percentage >= 70) return { grade: 'B+', color: 'text-blue-600' };
        if (percentage >= 60) return { grade: 'B', color: 'text-blue-500' };
        if (percentage >= 50) return { grade: 'C', color: 'text-amber-600' };
        if (percentage >= 40) return { grade: 'D', color: 'text-orange-600' };
        return { grade: 'F', color: 'text-red-600' };
    };

    const classAverage = currentExam
        ? students.reduce((sum, s) => sum + (s.marks[selectedExam] || 0), 0) / students.filter(s => s.marks[selectedExam] !== null).length
        : 0;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Gradebook</h1>
                <p className="text-gray-600 mt-1">Enter and manage student marks</p>
            </div>

            {/* Selectors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select Class
                    </label>
                    <select
                        value={selectedClass}
                        onChange={(e) => setSelectedClass(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    >
                        <option value="">Choose a class...</option>
                        {mockClasses.map((cls) => (
                            <option key={cls.id} value={cls.id}>
                                {cls.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select Exam/Assignment
                    </label>
                    <select
                        value={selectedExam}
                        onChange={(e) => setSelectedExam(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                        disabled={!selectedClass}
                    >
                        <option value="">Choose an exam...</option>
                        {mockExams.map((exam) => (
                            <option key={exam.id} value={exam.id}>
                                {exam.name} (Max: {exam.maxMarks})
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {selectedClass && selectedExam && currentExam && (
                <>
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
                            <p className="text-3xl font-bold text-purple-600">{currentExam.maxMarks}</p>
                            <p className="text-sm text-gray-500">Max Marks</p>
                        </div>
                        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
                            <p className="text-3xl font-bold text-blue-600">{classAverage.toFixed(1)}</p>
                            <p className="text-sm text-gray-500">Class Average</p>
                        </div>
                        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
                            <p className="text-3xl font-bold text-emerald-600">
                                {students.filter(s => s.marks[selectedExam] !== null).length}/{students.length}
                            </p>
                            <p className="text-sm text-gray-500">Entered</p>
                        </div>
                    </div>

                    {/* Marks Entry Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                            <h2 className="font-semibold text-gray-900">
                                📝 {currentExam.name} - Enter Marks
                            </h2>
                            {lastSaved && (
                                <span className="text-sm text-gray-500">
                                    Last saved: {lastSaved.toLocaleTimeString()}
                                </span>
                            )}
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Roll</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Student Name</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Marks</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">%</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Grade</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {students.map((student) => {
                                        const marks = student.marks[selectedExam];
                                        const gradeInfo = marks !== null ? getGrade(marks, currentExam.maxMarks) : null;
                                        const percentage = marks !== null ? ((marks / currentExam.maxMarks) * 100).toFixed(0) : '-';

                                        return (
                                            <tr key={student.id} className="hover:bg-gray-50">
                                                <td className="px-4 py-3 text-sm text-gray-600">{student.rollNo}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 bg-gradient-to-br from-purple-400 to-pink-500 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                                                            {student.name.charAt(0)}
                                                        </div>
                                                        <span className="font-medium text-gray-900">{student.name}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex justify-center">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max={currentExam.maxMarks}
                                                            value={marks !== null ? marks : ''}
                                                            onChange={(e) => handleMarksChange(student.id, e.target.value)}
                                                            className="w-20 px-3 py-2 text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                                                            placeholder="-"
                                                        />
                                                        <span className="ml-2 text-gray-400 self-center">/ {currentExam.maxMarks}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center text-sm text-gray-600">
                                                    {percentage}%
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    {gradeInfo ? (
                                                        <span className={`font-bold ${gradeInfo.color}`}>
                                                            {gradeInfo.grade}
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-400">-</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Save Button */}
                    <div className="flex gap-4">
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="flex-1 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all disabled:opacity-50"
                        >
                            {isSaving ? '💾 Saving...' : '💾 Save Marks'}
                        </button>
                        <button className="px-6 py-4 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200">
                            📊 View Analytics
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
