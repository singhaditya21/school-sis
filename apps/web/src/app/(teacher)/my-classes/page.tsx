import { getSession } from '@/lib/auth/session';
import Link from 'next/link';

interface ClassGroup {
    id: string;
    name: string;
    grade: string;
    section: string;
    subject: string;
    studentCount: number;
    scheduleDay: string;
    scheduleTime: string;
}

// Mock data
const mockClasses: ClassGroup[] = [
    { id: '1', name: 'Class 10-A', grade: '10', section: 'A', subject: 'Mathematics', studentCount: 42, scheduleDay: 'Mon, Wed, Fri', scheduleTime: '8:00 - 8:45' },
    { id: '2', name: 'Class 10-B', grade: '10', section: 'B', subject: 'Mathematics', studentCount: 40, scheduleDay: 'Mon, Wed, Fri', scheduleTime: '8:45 - 9:30' },
    { id: '3', name: 'Class 9-A', grade: '9', section: 'A', subject: 'Mathematics', studentCount: 45, scheduleDay: 'Tue, Thu', scheduleTime: '9:45 - 10:30' },
    { id: '4', name: 'Class 11-A', grade: '11', section: 'A', subject: 'Mathematics', studentCount: 38, scheduleDay: 'Mon, Wed, Fri', scheduleTime: '11:15 - 12:00' },
    { id: '5', name: 'Class 11-B', grade: '11', section: 'B', subject: 'Mathematics', studentCount: 36, scheduleDay: 'Tue, Thu', scheduleTime: '12:00 - 12:45' },
    { id: '6', name: 'Class 12-A', grade: '12', section: 'A', subject: 'Mathematics', studentCount: 35, scheduleDay: 'Mon, Wed', scheduleTime: '2:00 - 2:45' },
];

export default async function MyClassesPage() {
    const session = await getSession();

    // Fetch classes from backend
    let classes: ClassGroup[] = mockClasses;

    try {
        const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/teacher/classes`,
            {
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                    'Content-Type': 'application/json',
                },
                cache: 'no-store',
            }
        );
        if (response.ok) {
            const data = await response.json();
            if (data.data?.length > 0) {
                classes = data.data;
            }
        }
    } catch (error) {
        console.error('[My Classes] API Error:', error);
    }

    const totalStudents = classes.reduce((sum, c) => sum + c.studentCount, 0);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">My Classes</h1>
                <p className="text-gray-600 mt-1">
                    You are teaching {classes.length} classes with {totalStudents} students
                </p>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
                    <p className="text-3xl font-bold text-emerald-600">{classes.length}</p>
                    <p className="text-sm text-gray-500">Classes</p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
                    <p className="text-3xl font-bold text-blue-600">{totalStudents}</p>
                    <p className="text-sm text-gray-500">Students</p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
                    <p className="text-3xl font-bold text-purple-600">
                        {new Set(classes.map(c => c.subject)).size}
                    </p>
                    <p className="text-sm text-gray-500">Subjects</p>
                </div>
            </div>

            {/* Class List */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100">
                <div className="p-4 border-b border-gray-100">
                    <h2 className="font-semibold text-gray-900">📚 Assigned Classes</h2>
                </div>
                <div className="divide-y divide-gray-100">
                    {classes.map((cls) => (
                        <div
                            key={cls.id}
                            className="p-4 hover:bg-gray-50 transition-colors"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center text-white">
                                        <span className="text-lg font-bold">{cls.grade}-{cls.section}</span>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-gray-900">{cls.name}</h3>
                                        <p className="text-sm text-gray-500">{cls.subject}</p>
                                        <p className="text-xs text-gray-400 mt-1">
                                            {cls.scheduleDay} • {cls.scheduleTime}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-lg font-semibold text-gray-700">{cls.studentCount}</p>
                                    <p className="text-xs text-gray-400">students</p>
                                </div>
                            </div>
                            <div className="mt-3 flex gap-2">
                                <Link
                                    href={`/teacher/my-classes/${cls.id}/students`}
                                    className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                                >
                                    👥 Students
                                </Link>
                                <Link
                                    href={`/teacher/attendance?class=${cls.id}`}
                                    className="px-3 py-1.5 text-sm bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200"
                                >
                                    ✅ Attendance
                                </Link>
                                <Link
                                    href={`/teacher/gradebook?class=${cls.id}`}
                                    className="px-3 py-1.5 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200"
                                >
                                    📝 Gradebook
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
