import { getSession } from '@/lib/auth/session';
import Link from 'next/link';

export default async function AttendanceReportsPage() {
    const session = await getSession();

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Attendance Reports</h1>
                    <p className="text-gray-600 mt-1">View detailed attendance analytics</p>
                </div>
                <Link href="/attendance" className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h2 className="font-semibold mb-4">Monthly Report</h2>
                    <p className="text-gray-500 text-sm mb-4">Download attendance statistics for the month</p>
                    <a href="/api/reports/attendance/monthly" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        Download Report
                    </a>
                </div>

                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h2 className="font-semibold mb-4">Class-wise Report</h2>
                    <p className="text-gray-500 text-sm mb-4">View attendance breakdown by class</p>
                    <a href="/api/reports/attendance/class" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        Download Report
                    </a>
                </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-medium text-blue-900 mb-2">📊 Quick Stats</h3>
                <p className="text-sm text-blue-700">Reports are generated from the Java API. Configure date ranges in the settings.</p>
            </div>
        </div>
    );
}
