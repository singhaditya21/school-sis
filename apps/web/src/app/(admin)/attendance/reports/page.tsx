import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAttendanceReport, notifyAbsentParents } from '@/lib/actions/attendance';

export default async function AttendanceReportsPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    // Default: current month
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const endDate = now.toISOString().split('T')[0];

    const report = await getAttendanceReport(startDate, endDate);

    const totalPresent = report.reduce((s, r) => s + r.presentCount, 0);
    const totalAbsent = report.reduce((s, r) => s + r.absentCount, 0);
    const totalLate = report.reduce((s, r) => s + r.lateCount, 0);
    const totalRecords = totalPresent + totalAbsent + totalLate;
    const overallRate = totalRecords > 0 ? Math.round((totalPresent / totalRecords) * 100) : 0;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Attendance Reports</h1>
                    <p className="text-muted-foreground mt-1">
                        {new Date(startDate).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                    </p>
                </div>
                <Link href="/attendance" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">← Back</Link>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 rounded-xl p-5">
                    <p className="text-sm text-muted-foreground">Overall Rate</p>
                    <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-1">{overallRate}%</p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-xl p-5">
                    <p className="text-sm text-muted-foreground">Present</p>
                    <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-1">{totalPresent.toLocaleString()}</p>
                </div>
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl p-5">
                    <p className="text-sm text-muted-foreground">Absent</p>
                    <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-1">{totalAbsent.toLocaleString()}</p>
                </div>
                <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900/50 rounded-xl p-5">
                    <p className="text-sm text-muted-foreground">Late</p>
                    <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-400 mt-1">{totalLate.toLocaleString()}</p>
                </div>
            </div>

            {/* Class-wise Report Table */}
            <div className="bg-white dark:bg-gray-950 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Class</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Students</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Working Days</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Present</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Absent</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Late</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Rate</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                        {report.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                                    No attendance data for this period.
                                </td>
                            </tr>
                        ) : (
                            report.map((row, i) => (
                                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-900/30">
                                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                                        {row.gradeName} - {row.sectionName}
                                    </td>
                                    <td className="px-4 py-3 text-right text-muted-foreground">{row.totalStudents}</td>
                                    <td className="px-4 py-3 text-right text-muted-foreground">{row.workingDays}</td>
                                    <td className="px-4 py-3 text-right text-green-600 dark:text-green-400 font-medium">{row.presentCount}</td>
                                    <td className="px-4 py-3 text-right text-red-600 dark:text-red-400">{row.absentCount}</td>
                                    <td className="px-4 py-3 text-right text-yellow-600 dark:text-yellow-400">{row.lateCount}</td>
                                    <td className="px-4 py-3 text-right font-medium">
                                        <span className={row.attendanceRate >= 90 ? 'text-green-600 dark:text-green-400' :
                                            row.attendanceRate >= 75 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}>
                                            {row.attendanceRate}%
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
