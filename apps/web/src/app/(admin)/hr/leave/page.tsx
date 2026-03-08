import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getPendingLeaves, approveLeave, rejectLeave } from '@/lib/actions/hr';
import { revalidatePath } from 'next/cache';

export default async function LeavePage() {
    const leaves = await getPendingLeaves();

    async function handleApprove(formData: FormData) {
        'use server';
        const leaveId = formData.get('leaveId') as string;
        await approveLeave(leaveId);
        revalidatePath('/hr/leave');
    }

    async function handleReject(formData: FormData) {
        'use server';
        const leaveId = formData.get('leaveId') as string;
        await rejectLeave(leaveId, 'Rejected by admin');
        revalidatePath('/hr/leave');
    }

    const getTypeBadge = (type: string) => {
        const colors: Record<string, string> = {
            CL: 'bg-blue-100 text-blue-700',
            SL: 'bg-orange-100 text-orange-700',
            EL: 'bg-purple-100 text-purple-700',
            ML: 'bg-pink-100 text-pink-700',
            PL: 'bg-indigo-100 text-indigo-700',
            COMP_OFF: 'bg-teal-100 text-teal-700',
            LWP: 'bg-gray-100 text-gray-700',
        };
        const labels: Record<string, string> = {
            CL: 'Casual', SL: 'Sick', EL: 'Earned', ML: 'Maternity', PL: 'Paternity', COMP_OFF: 'Comp Off', LWP: 'LWP',
        };
        return (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[type] || 'bg-gray-100 text-gray-700'}`}>
                {labels[type] || type}
            </span>
        );
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Leave Management</h1>
                    <p className="text-gray-600 mt-1">Approve and track leave requests</p>
                </div>
                <Link href="/hr" className="px-4 py-2 border rounded-lg hover:bg-gray-50">
                    ← Back to HR
                </Link>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Card className="border-2 border-yellow-200">
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Pending Approval</div>
                        <div className="text-2xl font-bold text-yellow-600">{leaves.length}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Leave Requests Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Pending Leave Requests</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">From</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">To</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Days</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {leaves.map(leave => (
                                <tr key={leave.id} className="hover:bg-yellow-50">
                                    <td className="px-4 py-3">
                                        <div className="font-medium">{leave.staffFirstName} {leave.staffLastName}</div>
                                        <div className="text-xs text-gray-500">{leave.staffEmployeeId}</div>
                                    </td>
                                    <td className="px-4 py-3">{getTypeBadge(leave.leaveType)}</td>
                                    <td className="px-4 py-3 text-sm">{leave.fromDate}</td>
                                    <td className="px-4 py-3 text-sm">{leave.toDate}</td>
                                    <td className="px-4 py-3 text-center font-semibold">{leave.totalDays}</td>
                                    <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{leave.reason}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-2">
                                            <form action={handleApprove}>
                                                <input type="hidden" name="leaveId" value={leave.id} />
                                                <button
                                                    type="submit"
                                                    className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                                                >
                                                    ✓ Approve
                                                </button>
                                            </form>
                                            <form action={handleReject}>
                                                <input type="hidden" name="leaveId" value={leave.id} />
                                                <button
                                                    type="submit"
                                                    className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                                                >
                                                    ✗ Reject
                                                </button>
                                            </form>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {leaves.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                                        🎉 No pending leave requests. All caught up!
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
