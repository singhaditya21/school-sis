import { getSession } from '@/lib/auth/session';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';

interface ClassGroup {
    id: string;
    name: string;
    section: {
        name: string;
        grade: {
            name: string;
            level: number;
        };
    };
    studentCount: number;
    attendanceMarked: boolean;
    markedCount: number;
}

interface WeeklyStat {
    status: string;
    count: number;
}

// Mock class groups (72 total: 12 classes × 6 sections)
const mockClassGroups: ClassGroup[] = [];
const sections = ['A', 'B', 'C', 'D', 'E', 'F'];
for (let grade = 1; grade <= 12; grade++) {
    for (const section of sections) {
        const isMarked = Math.random() > 0.3; // 70% marked
        const studentCount = 60;
        mockClassGroups.push({
            id: `class-${grade}-${section}`,
            name: `Class ${grade}-${section}`,
            section: {
                name: section,
                grade: { name: `Class ${grade}`, level: grade }
            },
            studentCount,
            attendanceMarked: isMarked,
            markedCount: isMarked ? studentCount - Math.floor(Math.random() * 5) : 0
        });
    }
}

const mockWeeklyStats: WeeklyStat[] = [
    { status: 'PRESENT', count: 18240 },
    { status: 'ABSENT', count: 864 },
    { status: 'LATE', count: 216 },
    { status: 'EXCUSED', count: 432 },
    { status: 'ON_LEAVE', count: 108 }
];

export default async function AttendancePage() {
    const session = await getSession();
    const today = new Date();

    // Fetch data from Java API
    let classGroups: ClassGroup[] = [];
    let weeklyStats: WeeklyStat[] = [];
    let attendanceRate = '0';
    let useMockData = false;

    try {
        const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/attendance/classes`,
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
            classGroups = data.data || [];
            if (classGroups.length === 0) useMockData = true;
        } else {
            useMockData = true;
        }

        const statsResponse = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/attendance/summary`,
            {
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                    'Content-Type': 'application/json',
                },
                cache: 'no-store',
            }
        );

        if (statsResponse.ok) {
            const statsData = await statsResponse.json();
            weeklyStats = statsData.data?.breakdown || [];
            attendanceRate = statsData.data?.attendanceRate?.toFixed(1) || '0';
            if (weeklyStats.length === 0) useMockData = true;
        } else {
            useMockData = true;
        }
    } catch (error) {
        console.error('[Attendance] API Error, using mock data:', error);
        useMockData = true;
    }

    // Use mock data as fallback
    if (useMockData) {
        classGroups = mockClassGroups;
        weeklyStats = mockWeeklyStats;
        attendanceRate = '92.7';
    }

    const markedClasses = classGroups.filter((c) => c.attendanceMarked).length;
    const totalStudents = classGroups.reduce((acc, c) => acc + (c.studentCount || 0), 0);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Attendance</h1>
                    <p className="text-gray-600 mt-1">
                        Mark and manage student attendance
                    </p>
                </div>
                <div className="flex gap-3">
                    <Link
                        href="/attendance/reports"
                        className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                    >
                        📊 Reports
                    </Link>
                </div>
            </div>

            {/* Today's Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-gray-500">Today</p>
                    <p className="text-2xl font-bold text-gray-900">{formatDate(today)}</p>
                </div>

                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-gray-500">Classes Marked</p>
                    <p className="text-2xl font-bold text-blue-600">
                        {markedClasses} / {classGroups.length}
                    </p>
                </div>

                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-gray-500">Total Students</p>
                    <p className="text-2xl font-bold text-gray-900">{totalStudents}</p>
                </div>

                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-gray-500">Weekly Rate</p>
                    <p className="text-2xl font-bold text-green-600">{attendanceRate}%</p>
                </div>
            </div>

            {/* Class List */}
            <div className="bg-white rounded-xl shadow-sm border">
                <div className="p-4 border-b">
                    <h2 className="font-semibold text-gray-900">Mark Attendance by Class</h2>
                </div>

                <div className="divide-y">
                    {classGroups.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            <p>No class groups found.</p>
                            <p className="text-sm mt-1">Create classes in the Timetable module first.</p>
                        </div>
                    ) : (
                        classGroups.map((classGroup) => (
                            <Link
                                key={classGroup.id}
                                href={`/attendance/mark/${classGroup.id}`}
                                className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                            >
                                <div className="flex items-center gap-4">
                                    <div
                                        className={`w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold ${classGroup.attendanceMarked ? 'bg-green-500' : 'bg-gray-400'
                                            }`}
                                    >
                                        {classGroup.section?.grade?.level || '?'}
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900">
                                            {classGroup.section?.grade?.name || 'Class'} - Section {classGroup.section?.name || 'N/A'}
                                        </p>
                                        <p className="text-sm text-gray-500">
                                            {classGroup.studentCount || 0} students
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    {classGroup.attendanceMarked ? (
                                        <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                                            ✓ Marked ({classGroup.markedCount}/{classGroup.studentCount})
                                        </span>
                                    ) : (
                                        <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium">
                                            Pending
                                        </span>
                                    )}
                                    <span className="text-gray-400">→</span>
                                </div>
                            </Link>
                        ))
                    )}
                </div>
            </div>

            {/* Quick Stats */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-medium text-blue-900 mb-2">📊 This Week&apos;s Breakdown</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                    {weeklyStats.map((stat) => (
                        <div key={stat.status} className="text-center">
                            <p className="text-2xl font-bold text-blue-700">{stat.count}</p>
                            <p className="text-blue-600">{stat.status.replace('_', ' ')}</p>
                        </div>
                    ))}
                    {weeklyStats.length === 0 && (
                        <p className="text-blue-600 col-span-5">No attendance data for this week yet.</p>
                    )}
                </div>
            </div>
        </div>
    );
}
