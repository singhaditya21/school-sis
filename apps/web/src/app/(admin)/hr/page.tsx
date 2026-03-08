import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { getStaffList, getHRStats } from '@/lib/actions/hr';

export default async function HRPage() {
    const [staffList, stats] = await Promise.all([
        getStaffList(),
        getHRStats(),
    ]);

    const getDeptBadge = (dept: string | null) => {
        const colors: Record<string, string> = {
            Teaching: 'bg-blue-100 text-blue-700',
            Administration: 'bg-purple-100 text-purple-700',
            Accounts: 'bg-green-100 text-green-700',
            Transport: 'bg-orange-100 text-orange-700',
            Support: 'bg-gray-100 text-gray-700',
        };
        return dept ? (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[dept] || 'bg-gray-100 text-gray-700'}`}>
                {dept}
            </span>
        ) : null;
    };

    const getStatusBadge = (status: string) => {
        const colors: Record<string, string> = {
            ACTIVE: 'bg-green-100 text-green-700',
            ON_LEAVE: 'bg-yellow-100 text-yellow-700',
            RESIGNED: 'bg-gray-100 text-gray-700',
            TERMINATED: 'bg-red-100 text-red-700',
            PROBATION: 'bg-blue-100 text-blue-700',
        };
        return (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-700'}`}>
                {status}
            </span>
        );
    };

    const teaching = stats.departments.filter(d => d.departmentName === 'Teaching').reduce((s, d) => s + d.count, 0);
    const nonTeaching = stats.totalStaff - teaching;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">HR Management</h1>
                    <p className="text-gray-600 mt-1">Staff directory and HR operations</p>
                </div>
                <div className="flex gap-3">
                    <Link href="/hr/payroll" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                        💰 Payroll
                    </Link>
                    <Link href="/hr/leave" className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700">
                        📅 Leave ({stats.pendingLeaves})
                    </Link>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Total Staff</div>
                        <div className="text-2xl font-bold text-blue-600">{stats.totalStaff}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Active</div>
                        <div className="text-2xl font-bold text-green-600">{stats.activeStaff}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Teaching</div>
                        <div className="text-2xl font-bold text-purple-600">{teaching}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Non-Teaching</div>
                        <div className="text-2xl font-bold text-orange-600">{nonTeaching}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Monthly Payroll</div>
                        <div className="text-2xl font-bold text-indigo-600">₹{(stats.monthlyPayroll / 100000).toFixed(1)}L</div>
                    </CardContent>
                </Card>
            </div>

            {/* Staff Table */}
            <Card>
                <CardContent className="p-0">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Designation</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Joined</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {staffList.map(staff => (
                                <tr key={staff.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                                                {staff.firstName[0]}{staff.lastName[0]}
                                            </div>
                                            <div>
                                                <div className="font-medium">{staff.firstName} {staff.lastName}</div>
                                                <div className="text-xs text-gray-500">{staff.employeeId} · {staff.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">{getDeptBadge(staff.departmentName)}</td>
                                    <td className="px-4 py-3 text-sm">{staff.designationName || '—'}</td>
                                    <td className="px-4 py-3">
                                        <span className="text-xs px-2 py-0.5 bg-gray-100 rounded">{staff.employmentType}</span>
                                    </td>
                                    <td className="px-4 py-3">{getStatusBadge(staff.status)}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{staff.joiningDate}</td>
                                </tr>
                            ))}
                            {staffList.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                                        No staff members found. Add your first staff member to get started.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
}
