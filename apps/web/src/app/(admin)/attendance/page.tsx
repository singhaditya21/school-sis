import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getClassAttendanceSummary, getAttendanceWeeklyStats } from '@/lib/actions/attendance';

export default async function AttendancePage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const today = new Date().toISOString().split('T')[0];
    const classSummary = await getClassAttendanceSummary(today);
    const weeklyStats = await getAttendanceWeeklyStats();

    // Group sections by grade
    const gradeGroups = classSummary.reduce((acc, sec) => {
        if (!acc[sec.gradeName]) acc[sec.gradeName] = [];
        acc[sec.gradeName].push(sec);
        return acc;
    }, {} as Record<string, typeof classSummary>);

    const totalStudents = classSummary.reduce((sum, s) => sum + s.studentCount, 0);
    const totalPresent = classSummary.reduce((sum, s) => sum + s.presentToday, 0);
    const totalAbsent = classSummary.reduce((sum, s) => sum + s.absentToday, 0);
    const totalLate = classSummary.reduce((sum, s) => sum + s.lateToday, 0);
    const sectionsMarked = classSummary.filter(s => s.attendanceMarked).length;

    const statusColors: Record<string, string> = {
        PRESENT: 'bg-green-100 text-green-700',
        ABSENT: 'bg-red-100 text-red-700',
        LATE: 'bg-yellow-100 text-yellow-700',
        HALF_DAY: 'bg-orange-100 text-orange-700',
        EXCUSED: 'bg-blue-100 text-blue-700',
        HOLIDAY: 'bg-purple-100 text-purple-700',
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Attendance</h1>
                    <p className="text-gray-600 mt-1">
                        {new Date(today).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-gray-500">Total Students</p>
                    <p className="text-2xl font-bold">{totalStudents}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-gray-500">Present Today</p>
                    <p className="text-2xl font-bold text-green-600">{totalPresent}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-gray-500">Absent Today</p>
                    <p className="text-2xl font-bold text-red-600">{totalAbsent}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-gray-500">Late Today</p>
                    <p className="text-2xl font-bold text-yellow-600">{totalLate}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-gray-500">Sections Marked</p>
                    <p className="text-2xl font-bold text-blue-600">{sectionsMarked}/{classSummary.length}</p>
                </div>
            </div>

            {/* Weekly Stats */}
            {weeklyStats.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h2 className="text-lg font-semibold mb-3">Last 7 Days</h2>
                    <div className="flex flex-wrap gap-3">
                        {weeklyStats.map(stat => (
                            <span key={stat.status} className={`px-3 py-1.5 rounded-full text-sm font-medium ${statusColors[stat.status] || 'bg-gray-100 text-gray-700'}`}>
                                {stat.status}: {stat.count}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Class-wise Attendance Grid */}
            <div className="bg-white rounded-xl shadow-sm border">
                <div className="p-6">
                    <h2 className="text-lg font-semibold mb-4">Class-wise Attendance</h2>
                    <div className="space-y-6">
                        {Object.entries(gradeGroups).map(([gradeName, secs]) => (
                            <div key={gradeName}>
                                <h3 className="text-sm font-semibold text-gray-700 mb-2">{gradeName}</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    {secs.map(sec => (
                                        <div key={sec.sectionId} className={`p-4 rounded-lg border ${sec.attendanceMarked ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="font-medium">{gradeName}-{sec.sectionName}</span>
                                                <span className={`text-xs px-2 py-0.5 rounded ${sec.attendanceMarked ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                                                    {sec.attendanceMarked ? '✓ Marked' : 'Pending'}
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-500">{sec.studentCount} students</p>
                                            {sec.attendanceMarked && (
                                                <div className="flex gap-2 mt-2 text-xs">
                                                    <span className="text-green-600">{sec.presentToday}P</span>
                                                    <span className="text-red-600">{sec.absentToday}A</span>
                                                    <span className="text-yellow-600">{sec.lateToday}L</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}

                        {classSummary.length === 0 && (
                            <p className="text-center text-gray-500 py-8">
                                No classes found. Add grades and sections first.
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
