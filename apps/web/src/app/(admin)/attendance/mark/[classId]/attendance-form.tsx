'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { markClassAttendance, AttendanceStatus } from '@/lib/actions/attendance';
import Link from 'next/link';

interface Student {
    id: string;
    firstName: string;
    lastName: string;
    admissionNumber: string;
}

interface AttendanceFormProps {
    classGroupId: string;
    students: Student[];
    existingAttendance: Record<string, string>;
    date: string;
}

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; color: string }[] = [
    { value: 'PRESENT', label: 'Present', color: 'bg-green-500' },
    { value: 'ABSENT', label: 'Absent', color: 'bg-red-500' },
    { value: 'LATE', label: 'Late', color: 'bg-yellow-500' },
    { value: 'LEAVE', label: 'Leave', color: 'bg-blue-500' },
    { value: 'HALF_DAY', label: 'Half Day', color: 'bg-orange-500' },
    { value: 'EXCUSED', label: 'Excused', color: 'bg-purple-500' },
];

export function AttendanceForm({
    classGroupId,
    students,
    existingAttendance,
    date,
}: AttendanceFormProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    // Initialize attendance state
    const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>(() => {
        const initial: Record<string, AttendanceStatus> = {};
        students.forEach((student) => {
            initial[student.id] = (existingAttendance[student.id] as AttendanceStatus) || 'PRESENT';
        });
        return initial;
    });

    const [remarks, setRemarks] = useState<Record<string, string>>({});

    // Quick actions
    const markAllPresent = () => {
        const newAttendance: Record<string, AttendanceStatus> = {};
        students.forEach((student) => {
            newAttendance[student.id] = 'PRESENT';
        });
        setAttendance(newAttendance);
    };

    const markAllAbsent = () => {
        const newAttendance: Record<string, AttendanceStatus> = {};
        students.forEach((student) => {
            newAttendance[student.id] = 'ABSENT';
        });
        setAttendance(newAttendance);
    };

    // Handle submit
    const handleSubmit = async () => {
        const attendanceData = Object.entries(attendance).map(([studentId, status]) => ({
            studentId,
            status,
            remarks: remarks[studentId],
        }));

        startTransition(async () => {
            const result = await markClassAttendance(
                classGroupId,
                new Date(date),
                attendanceData
            );

            if (result.success) {
                router.push('/attendance');
            } else {
                alert(result.error || 'Failed to save attendance');
            }
        });
    };

    // Stats
    const presentCount = Object.values(attendance).filter((s) => s === 'PRESENT').length;
    const absentCount = Object.values(attendance).filter((s) => s === 'ABSENT').length;

    return (
        <div className="space-y-4">
            {/* Quick Actions */}
            <div className="flex gap-3 flex-wrap">
                <button
                    onClick={markAllPresent}
                    className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200"
                >
                    ✓ Mark All Present
                </button>
                <button
                    onClick={markAllAbsent}
                    className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
                >
                    ✗ Mark All Absent
                </button>
                <div className="flex-1" />
                <span className="px-4 py-2 bg-gray-100 rounded-lg text-sm">
                    <span className="text-green-600 font-medium">{presentCount}</span> Present
                    {' • '}
                    <span className="text-red-600 font-medium">{absentCount}</span> Absent
                </span>
            </div>

            {/* Student List */}
            <div className="bg-white rounded-xl shadow-sm border divide-y">
                {students.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        No students in this class.
                    </div>
                ) : (
                    students.map((student, index) => (
                        <div key={student.id} className="p-4 flex items-center gap-4">
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

                            {/* Status Buttons */}
                            <div className="flex gap-1 flex-wrap">
                                {STATUS_OPTIONS.map((option) => (
                                    <button
                                        key={option.value}
                                        onClick={() =>
                                            setAttendance((prev) => ({
                                                ...prev,
                                                [student.id]: option.value,
                                            }))
                                        }
                                        className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${attendance[student.id] === option.value
                                                ? `${option.color} text-white`
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Submit */}
            <div className="flex gap-4 sticky bottom-0 bg-white py-4 border-t">
                <Link
                    href="/attendance"
                    className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                    Cancel
                </Link>
                <button
                    onClick={handleSubmit}
                    disabled={isPending || students.length === 0}
                    className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isPending ? 'Saving...' : '✓ Save Attendance'}
                </button>
            </div>
        </div>
    );
}
