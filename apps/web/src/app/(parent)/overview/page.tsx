import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { formatCurrency } from '@/lib/utils';

export default async function ParentOverviewPage() {
    const session = await getSession();

    if (!session.isLoggedIn) {
        redirect('/login');
    }

    // Placeholder data - will be fetched from Java API once parent endpoints are implemented
    const studentInfo = {
        name: 'Student Name',
        class: 'Grade 8 - Section A',
        attendanceRate: 95,
    };

    const pendingFees = {
        amount: 12500,
        dueDate: '2026-02-15',
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Welcome, Parent</h1>
                <p className="text-muted-foreground mt-1">
                    Here&apos;s an overview of your child&apos;s information
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h3 className="font-semibold text-gray-900 mb-2">Student Info</h3>
                    <p className="text-xl font-bold">{studentInfo.name}</p>
                    <p className="text-sm text-gray-500">{studentInfo.class}</p>
                </div>

                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h3 className="font-semibold text-gray-900 mb-2">Attendance</h3>
                    <p className="text-3xl font-bold text-green-600">{studentInfo.attendanceRate}%</p>
                    <p className="text-sm text-gray-500">This month</p>
                </div>

                <div className="bg-amber-50 rounded-xl border border-amber-200 p-6">
                    <h3 className="font-semibold text-amber-900 mb-2">Pending Fees</h3>
                    <p className="text-3xl font-bold text-amber-700">{formatCurrency(pendingFees.amount)}</p>
                    <p className="text-sm text-amber-600">Due by {pendingFees.dueDate}</p>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <a href="/my-fees" className="bg-white rounded-xl shadow-sm border p-4 hover:shadow-md transition-shadow text-center">
                    <div className="text-2xl mb-2">💰</div>
                    <p className="font-medium">My Fees</p>
                </a>
                <a href="/my-transport" className="bg-white rounded-xl shadow-sm border p-4 hover:shadow-md transition-shadow text-center">
                    <div className="text-2xl mb-2">🚌</div>
                    <p className="font-medium">Transport</p>
                </a>
                <a href="/my-attendance" className="bg-white rounded-xl shadow-sm border p-4 hover:shadow-md transition-shadow text-center">
                    <div className="text-2xl mb-2">📊</div>
                    <p className="font-medium">Attendance</p>
                </a>
                <a href="/my-report-cards" className="bg-white rounded-xl shadow-sm border p-4 hover:shadow-md transition-shadow text-center">
                    <div className="text-2xl mb-2">📄</div>
                    <p className="font-medium">Report Cards</p>
                </a>
            </div>
        </div>
    );
}
