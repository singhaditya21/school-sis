import { redirect } from 'next/navigation';
import { formatCurrency } from '@/lib/utils';
import { getParentOverview } from '@/lib/services/parent/parent.service';

export default async function ParentOverviewPage() {
    let data;
    try {
        data = await getParentOverview();
    } catch {
        redirect('/login');
    }

    const studentDisplay = data.students.length > 0
        ? data.students[0]
        : { name: 'No student linked', class: '' };

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
                    <p className="text-xl font-bold">{studentDisplay.name}</p>
                    <p className="text-sm text-gray-500">{studentDisplay.class}</p>
                    {data.students.length > 1 && (
                        <p className="text-xs text-blue-600 mt-2">+{data.students.length - 1} more</p>
                    )}
                </div>

                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h3 className="font-semibold text-gray-900 mb-2">Attendance</h3>
                    <p className="text-3xl font-bold text-green-600">{data.attendanceRate}%</p>
                    <p className="text-sm text-gray-500">This month</p>
                </div>

                <div className="bg-amber-50 rounded-xl border border-amber-200 p-6">
                    <h3 className="font-semibold text-amber-900 mb-2">Pending Fees</h3>
                    <p className="text-3xl font-bold text-amber-700">{formatCurrency(data.pendingFees.totalAmount)}</p>
                    <p className="text-sm text-amber-600">
                        {data.pendingFees.nearestDueDate
                            ? `Due by ${data.pendingFees.nearestDueDate}`
                            : 'No pending fees'}
                    </p>
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
