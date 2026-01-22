import { getSession } from '@/lib/auth/session';
import { getDefaulters } from '@/lib/services/fees/defaulter.service';
import { formatCurrency } from '@/lib/utils';

export default async function DefaultersPage() {
    const session = await getSession();

    // Get defaulters from Java API
    const defaulters = await getDefaulters(session.token || '');

    const totalOverdue = defaulters.length;
    const totalAmount = defaulters.reduce((sum, d) => sum + (d.overdueAmount || 0), 0);

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Fee Defaulters</h1>
                    <p className="text-gray-600 mt-1">
                        Track overdue payments and send reminders
                    </p>
                </div>
                <a
                    href="/fees/reminders"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                    Send Reminders
                </a>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-lg p-6 text-white">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-red-100 text-sm font-medium">Total Overdue</p>
                            <p className="text-4xl font-bold mt-2">{totalOverdue}</p>
                            <p className="text-red-100 text-sm mt-1">students</p>
                        </div>
                        <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                            <span className="text-3xl">⚠️</span>
                        </div>
                    </div>
                </div>

                <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg p-6 text-white">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-orange-100 text-sm font-medium">Total Amount Due</p>
                            <p className="text-4xl font-bold mt-2">{formatCurrency(totalAmount)}</p>
                            <p className="text-orange-100 text-sm mt-1">outstanding</p>
                        </div>
                        <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                            <span className="text-3xl">💰</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Defaulters List */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <div className="p-6 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900">Defaulter List</h2>
                </div>
                <div className="overflow-x-auto">
                    {defaulters.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            <p className="text-4xl mb-2">🎉</p>
                            <p>No defaulters found!</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Class</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Days Overdue</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount Due</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {defaulters.map((defaulter) => (
                                    <tr key={defaulter.studentId} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <p className="font-medium text-gray-900">{defaulter.studentName}</p>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {defaulter.className}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                                                {defaulter.daysPastDue} days
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-red-600">
                                            {formatCurrency(defaulter.overdueAmount)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <a
                                                href={`/students/${defaulter.studentId}`}
                                                className="text-blue-600 hover:underline text-sm"
                                            >
                                                View Student
                                            </a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
