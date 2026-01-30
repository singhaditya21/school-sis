'use client';

import { useState } from 'react';

interface Student {
    id: string;
    name: string;
    rollNo: string;
    photo?: string;
    status: 'present' | 'absent' | 'late' | null;
}

interface ClassOption {
    id: string;
    name: string;
    period: number;
    time: string;
}

// Mock data
const mockClasses: ClassOption[] = [
    { id: '1', name: 'Class 10-A - Mathematics', period: 1, time: '8:00 - 8:45' },
    { id: '2', name: 'Class 10-B - Mathematics', period: 2, time: '8:45 - 9:30' },
    { id: '3', name: 'Class 9-A - Mathematics', period: 3, time: '9:45 - 10:30' },
    { id: '4', name: 'Class 11-A - Mathematics', period: 5, time: '11:15 - 12:00' },
];

const mockStudents: Student[] = [
    { id: '1', name: 'Aarav Sharma', rollNo: '01', status: null },
    { id: '2', name: 'Aditi Patel', rollNo: '02', status: null },
    { id: '3', name: 'Arjun Singh', rollNo: '03', status: null },
    { id: '4', name: 'Diya Gupta', rollNo: '04', status: null },
    { id: '5', name: 'Ishaan Kumar', rollNo: '05', status: null },
    { id: '6', name: 'Kavya Reddy', rollNo: '06', status: null },
    { id: '7', name: 'Lakshmi Nair', rollNo: '07', status: null },
    { id: '8', name: 'Manav Joshi', rollNo: '08', status: null },
    { id: '9', name: 'Nisha Verma', rollNo: '09', status: null },
    { id: '10', name: 'Om Prakash', rollNo: '10', status: null },
    { id: '11', name: 'Priya Desai', rollNo: '11', status: null },
    { id: '12', name: 'Rahul Mehta', rollNo: '12', status: null },
];

export default function TeacherAttendancePage() {
    const [selectedClass, setSelectedClass] = useState<string>('');
    const [students, setStudents] = useState<Student[]>(mockStudents);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const today = new Date().toLocaleDateString('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    const handleStatusChange = (studentId: string, status: 'present' | 'absent' | 'late') => {
        setStudents(prev =>
            prev.map(s =>
                s.id === studentId ? { ...s, status } : s
            )
        );
    };

    const handleMarkAllPresent = () => {
        setStudents(prev => prev.map(s => ({ ...s, status: 'present' })));
    };

    const handleSubmit = async () => {
        const unmarked = students.filter(s => s.status === null);
        if (unmarked.length > 0) {
            alert(`Please mark all students. ${unmarked.length} students unmarked.`);
            return;
        }

        setIsSubmitting(true);
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1000));
        setIsSubmitting(false);
        setSubmitted(true);
    };

    const presentCount = students.filter(s => s.status === 'present').length;
    const absentCount = students.filter(s => s.status === 'absent').length;
    const lateCount = students.filter(s => s.status === 'late').length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Mark Attendance</h1>
                <p className="text-gray-600 mt-1">{today}</p>
            </div>

            {/* Class Selector */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Class & Period
                </label>
                <select
                    value={selectedClass}
                    onChange={(e) => setSelectedClass(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                    <option value="">Choose a class...</option>
                    {mockClasses.map((cls) => (
                        <option key={cls.id} value={cls.id}>
                            Period {cls.period}: {cls.name} ({cls.time})
                        </option>
                    ))}
                </select>
            </div>

            {selectedClass && !submitted && (
                <>
                    {/* Quick Actions */}
                    <div className="flex gap-3">
                        <button
                            onClick={handleMarkAllPresent}
                            className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 font-medium"
                        >
                            ✅ Mark All Present
                        </button>
                        <button
                            onClick={() => setStudents(mockStudents)}
                            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
                        >
                            🔄 Reset
                        </button>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-4 gap-3">
                        <div className="bg-gray-100 rounded-lg p-3 text-center">
                            <p className="text-xl font-bold text-gray-700">{students.length}</p>
                            <p className="text-xs text-gray-500">Total</p>
                        </div>
                        <div className="bg-emerald-100 rounded-lg p-3 text-center">
                            <p className="text-xl font-bold text-emerald-700">{presentCount}</p>
                            <p className="text-xs text-emerald-600">Present</p>
                        </div>
                        <div className="bg-red-100 rounded-lg p-3 text-center">
                            <p className="text-xl font-bold text-red-700">{absentCount}</p>
                            <p className="text-xs text-red-600">Absent</p>
                        </div>
                        <div className="bg-amber-100 rounded-lg p-3 text-center">
                            <p className="text-xl font-bold text-amber-700">{lateCount}</p>
                            <p className="text-xs text-amber-600">Late</p>
                        </div>
                    </div>

                    {/* Student List */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
                        <div className="p-4 border-b border-gray-100">
                            <h2 className="font-semibold text-gray-900">
                                👥 Students ({students.length})
                            </h2>
                        </div>
                        <div className="divide-y divide-gray-100">
                            {students.map((student) => (
                                <div
                                    key={student.id}
                                    className="p-4 flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold">
                                            {student.name.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900">{student.name}</p>
                                            <p className="text-sm text-gray-500">Roll No: {student.rollNo}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleStatusChange(student.id, 'present')}
                                            className={`w-10 h-10 rounded-full flex items-center justify-center text-xl transition-all ${student.status === 'present'
                                                    ? 'bg-emerald-500 text-white scale-110'
                                                    : 'bg-gray-100 text-gray-400 hover:bg-emerald-100'
                                                }`}
                                        >
                                            ✓
                                        </button>
                                        <button
                                            onClick={() => handleStatusChange(student.id, 'absent')}
                                            className={`w-10 h-10 rounded-full flex items-center justify-center text-xl transition-all ${student.status === 'absent'
                                                    ? 'bg-red-500 text-white scale-110'
                                                    : 'bg-gray-100 text-gray-400 hover:bg-red-100'
                                                }`}
                                        >
                                            ✗
                                        </button>
                                        <button
                                            onClick={() => handleStatusChange(student.id, 'late')}
                                            className={`w-10 h-10 rounded-full flex items-center justify-center text-xl transition-all ${student.status === 'late'
                                                    ? 'bg-amber-500 text-white scale-110'
                                                    : 'bg-gray-100 text-gray-400 hover:bg-amber-100'
                                                }`}
                                        >
                                            ⏰
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Submit Button */}
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all disabled:opacity-50"
                    >
                        {isSubmitting ? 'Submitting...' : '📤 Submit Attendance'}
                    </button>
                </>
            )}

            {submitted && (
                <div className="bg-emerald-50 rounded-xl p-8 text-center">
                    <div className="text-6xl mb-4">✅</div>
                    <h2 className="text-xl font-bold text-emerald-800">Attendance Submitted!</h2>
                    <p className="text-emerald-600 mt-2">
                        {presentCount} present, {absentCount} absent, {lateCount} late
                    </p>
                    <button
                        onClick={() => {
                            setSubmitted(false);
                            setSelectedClass('');
                            setStudents(mockStudents);
                        }}
                        className="mt-4 px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                    >
                        Mark Another Class
                    </button>
                </div>
            )}
        </div>
    );
}
