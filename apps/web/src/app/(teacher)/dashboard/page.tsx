import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getDashboardStats } from '@/lib/actions/dashboard';

export default async function TeacherDashboardPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    let stats = { totalStudents: 0, totalTeachers: 0, totalClasses: 0, totalGrades: 0, attendanceToday: 0, feeCollected: 0, feesPending: 0, admissionLeads: 0, collectionRate: 0, overdueAmount: 0 };
    try {
        stats = await getDashboardStats();
    } catch { /* Handled gracefully */ }

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">{greeting}, {session.email?.split('@')[0] || 'Teacher'}</h1>
                <p className="text-gray-600">Teacher Dashboard</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <p className="text-sm text-gray-500">My Students</p>
                    <p className="text-2xl font-bold">{stats.totalStudents}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <p className="text-sm text-gray-500">Attendance Rate</p>
                    <p className="text-2xl font-bold text-green-600">{stats.attendanceToday}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <p className="text-sm text-gray-500">Quick Actions</p>
                    <div className="flex flex-col gap-1 mt-1">
                        <a href="/attendance" className="text-blue-600 hover:underline text-sm">Mark Attendance →</a>
                        <a href="/exams" className="text-blue-600 hover:underline text-sm">Enter Marks →</a>
                    </div>
                </div>
            </div>
        </div>
    );
}
