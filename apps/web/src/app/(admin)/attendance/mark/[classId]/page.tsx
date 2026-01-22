import { getSession } from '@/lib/auth/session';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';

interface Student {
    id: string;
    name: string;
    admissionNumber: string;
}

interface AttendanceRecord {
    studentId: string;
    status: string;
}

export default async function MarkAttendancePage({ params }: { params: Promise<{ classId: string }> }) {
    const { classId } = await params;
    const session = await getSession();
    const today = new Date().toISOString().split('T')[0];

    let students: Student[] = [];
    let existing: AttendanceRecord[] = [];

    try {
        const studentsResponse = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/students/class/${classId}`,
            {
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (studentsResponse.ok) {
            const data = await studentsResponse.json();
            students = data.data || [];
        }

        const attendanceResponse = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/attendance/class/${classId}?date=${today}`,
            {
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (attendanceResponse.ok) {
            const attendanceData = await attendanceResponse.json();
            existing = attendanceData.data || [];
        }
    } catch (error) {
        console.error('[Attendance] API Error:', error);
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Mark Attendance</h1>
                    <p className="text-gray-600">{formatDate(new Date())}</p>
                </div>
                <Link href="/attendance" className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <form action="/api/attendance" method="POST" className="bg-white rounded-xl shadow-sm border">
                <input type="hidden" name="classId" value={classId} />
                <input type="hidden" name="date" value={today} />

                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Admission No</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Name</th>
                            <th className="px-4 py-3 text-center text-sm font-medium text-gray-500">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {students.map((student) => {
                            const record = existing.find(r => r.studentId === student.id);
                            return (
                                <tr key={student.id}>
                                    <td className="px-4 py-3 text-sm">{student.admissionNumber}</td>
                                    <td className="px-4 py-3 text-sm font-medium">{student.name}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex justify-center gap-2">
                                            {['PRESENT', 'ABSENT', 'LATE'].map((status) => (
                                                <label key={status} className="flex items-center gap-1">
                                                    <input
                                                        type="radio"
                                                        name={`status[${student.id}]`}
                                                        value={status}
                                                        defaultChecked={record?.status === status || (!record && status === 'PRESENT')}
                                                    />
                                                    <span className="text-xs">{status}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                <div className="p-4 border-t">
                    <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                        Save Attendance
                    </button>
                </div>
            </form>
        </div>
    );
}
