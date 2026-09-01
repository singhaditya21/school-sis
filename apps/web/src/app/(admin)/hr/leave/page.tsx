import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { requireAuth } from '@/lib/auth/middleware';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getLeaveRequests, getLeaveStats, getStaffList } from '@/lib/actions/hr';
import LeaveDecisionButtons from './leave-decision-buttons';
import RecordLeaveDialog from './record-leave-dialog';
import { LEAVE_STATUS_OPTIONS, formatDate, leaveStatusClass, leaveTypeLabel } from '../labels';

export const dynamic = 'force-dynamic';

const FILTERS = ['PENDING', ...LEAVE_STATUS_OPTIONS.filter(s => s !== 'PENDING'), 'ALL'] as const;

const FILTER_LABELS: Record<string, string> = {
    PENDING: 'Pending',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    CANCELLED: 'Cancelled',
    ALL: 'All',
};

interface PageProps {
    searchParams: Promise<{ status?: string }>;
}

export default async function LeaveRequestsPage({ searchParams }: PageProps) {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    try {
        await requireAuth('hr:read');
    } catch {
        redirect('/unauthorized');
    }

    const { status: rawStatus } = await searchParams;
    const status = FILTERS.includes(rawStatus as (typeof FILTERS)[number]) ? rawStatus! : 'PENDING';

    const [requests, stats, staff] = await Promise.all([
        getLeaveRequests({ status }),
        getLeaveStats(),
        getStaffList(),
    ]);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <Link href="/hr" className="text-sm text-primary hover:underline">
                        ← Staff &amp; HR
                    </Link>
                    <h1 className="mt-1 text-3xl font-bold">Leave requests</h1>
                    <p className="mt-1 text-muted-foreground">
                        Approve or reject staff leave, and record requests received off-system.
                    </p>
                </div>
                <RecordLeaveDialog staff={staff} />
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Card className={stats.pending > 0 ? 'border-2 border-amber-200' : undefined}>
                    <CardContent className="pt-4">
                        <div className="text-sm text-muted-foreground">Awaiting decision</div>
                        <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                            {stats.pendingDays} {stats.pendingDays === 1 ? 'day' : 'days'} requested
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-muted-foreground">On leave today</div>
                        <div className="text-2xl font-bold text-blue-600">{stats.onLeaveToday}</div>
                        <div className="mt-1 text-xs text-muted-foreground">Approved and in date range</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-muted-foreground">Approved</div>
                        <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
                        <div className="mt-1 text-xs text-muted-foreground">All time</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-muted-foreground">Rejected</div>
                        <div className="text-2xl font-bold text-muted-foreground">{stats.rejected}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                            {stats.cancelled} cancelled
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Requests</CardTitle>
                    <div className="flex flex-wrap gap-2 pt-2">
                        {FILTERS.map(f => (
                            <Link
                                key={f}
                                href={`/hr/leave?status=${f}`}
                                className={`rounded-md border px-3 py-1.5 text-sm ${status === f ? 'border-blue-400 bg-blue-50 font-medium' : 'hover:bg-muted'}`}
                            >
                                {FILTER_LABELS[f]}
                            </Link>
                        ))}
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="border-b bg-muted">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Staff</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Type</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Dates</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-muted-foreground">Days</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Reason</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Status</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-muted-foreground">Decision</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {requests.map(r => {
                                    const staffName = `${r.staffFirstName} ${r.staffLastName}`;
                                    return (
                                        <tr key={r.id} className={r.status === 'PENDING' ? 'bg-amber-50/40' : undefined}>
                                            <td className="px-4 py-3">
                                                <Link href={`/hr/staff/${r.staffId}`} className="font-medium text-primary hover:underline">
                                                    {staffName}
                                                </Link>
                                                <div className="text-xs text-muted-foreground">
                                                    {r.staffEmployeeId}
                                                    {r.departmentName ? ` · ${r.departmentName}` : ''}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-sm">{leaveTypeLabel(r.leaveType)}</td>
                                            <td className="px-4 py-3 text-sm">
                                                {formatDate(r.fromDate)} → {formatDate(r.toDate)}
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm">{r.totalDays}</td>
                                            <td className="max-w-xs px-4 py-3 text-sm">
                                                <div className="truncate" title={r.reason}>{r.reason}</div>
                                                {r.status === 'REJECTED' && r.rejectionReason && (
                                                    <div className="mt-0.5 truncate text-xs text-red-600" title={r.rejectionReason}>
                                                        Rejected: {r.rejectionReason}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${leaveStatusClass(r.status)}`}>
                                                    {FILTER_LABELS[r.status] ?? r.status}
                                                </span>
                                                {r.approverFirstName && (
                                                    <div className="mt-0.5 text-xs text-muted-foreground">
                                                        by {r.approverFirstName} {r.approverLastName}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {r.status === 'PENDING' ? (
                                                    <LeaveDecisionButtons leaveId={r.id} staffName={staffName} />
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">
                                                        {r.approvedAt ? formatDate(r.approvedAt) : '—'}
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {requests.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                                            {status === 'PENDING'
                                                ? 'Nothing is waiting for a decision.'
                                                : `No ${FILTER_LABELS[status]?.toLowerCase() ?? status} leave requests.`}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
