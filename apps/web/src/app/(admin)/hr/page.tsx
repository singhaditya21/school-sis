import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { requireAuth } from '@/lib/auth/middleware';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import {
    getDepartments,
    getDesignations,
    getHRStats,
    getStaffList,
} from '@/lib/actions/hr';
import AddStaffDialog from './add-staff-dialog';
import {
    employmentTypeLabel,
    formatDate,
    staffStatusClass,
    staffStatusLabel,
} from './labels';

export const dynamic = 'force-dynamic';

interface PageProps {
    searchParams: Promise<{ dept?: string }>;
}

export default async function HROverviewPage({ searchParams }: PageProps) {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    try {
        await requireAuth('hr:read');
    } catch {
        redirect('/unauthorized');
    }

    const { dept = 'ALL' } = await searchParams;

    const [stats, staff, departments, designations] = await Promise.all([
        getHRStats(),
        getStaffList(dept),
        getDepartments(),
        getDesignations(),
    ]);

    // Only departments that actually have staff show a headcount; the rest read 0.
    const headcountByDept = new Map(
        stats.departments.map(d => [d.departmentName, d.count] as const)
    );
    const unassignedCount = headcountByDept.get(null) ?? 0;

    const activeShare = stats.totalStaff > 0
        ? Math.round((stats.activeStaff / stats.totalStaff) * 100)
        : 0;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold">Staff &amp; HR</h1>
                    <p className="mt-1 text-muted-foreground">
                        Headcount, payroll commitment and leave approvals for your school.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        href="/hr/leave"
                        className="inline-flex h-9 items-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent"
                    >
                        Leave requests
                        {stats.pendingLeaves > 0 && (
                            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                                {stats.pendingLeaves}
                            </span>
                        )}
                    </Link>
                    <AddStaffDialog departments={departments} designations={designations} />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-muted-foreground">Total staff</div>
                        <div className="text-2xl font-bold text-blue-600">{stats.totalStaff}</div>
                        <div className="mt-1 text-xs text-muted-foreground">All employment records</div>
                    </CardContent>
                </Card>
                <Card className="border-2 border-green-200">
                    <CardContent className="pt-4">
                        <div className="text-sm text-muted-foreground">Active</div>
                        <div className="text-2xl font-bold text-green-600">{stats.activeStaff}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                            {stats.totalStaff > 0 ? `${activeShare}% of headcount` : 'No staff yet'}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-muted-foreground">Pending leave</div>
                        <div className="text-2xl font-bold text-amber-600">{stats.pendingLeaves}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                            {stats.pendingLeaves > 0 ? (
                                <Link href="/hr/leave?status=PENDING" className="text-primary hover:underline">
                                    Review now
                                </Link>
                            ) : (
                                'Nothing awaiting approval'
                            )}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-muted-foreground">Monthly payroll</div>
                        <div className="text-2xl font-bold text-indigo-600">
                            {formatCurrency(stats.monthlyPayroll)}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">Net pay, active staff</div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Headcount by department</CardTitle>
                </CardHeader>
                <CardContent>
                    {stats.totalStaff === 0 ? (
                        <p className="py-4 text-sm text-muted-foreground">
                            No staff records yet, so there is nothing to break down.
                        </p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {departments.map(d => {
                                const count = headcountByDept.get(d.name) ?? 0;
                                return (
                                    <Link
                                        key={d.id}
                                        href={`/hr?dept=${encodeURIComponent(d.name)}`}
                                        className={`rounded-lg border px-3 py-2 text-sm hover:bg-muted ${dept === d.name ? 'border-blue-400 bg-blue-50' : ''}`}
                                    >
                                        <span className="font-medium">{d.name}</span>
                                        <span className="ml-2 text-muted-foreground">{count}</span>
                                    </Link>
                                );
                            })}
                            {unassignedCount > 0 && (
                                <div className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
                                    <span className="font-medium">Unassigned</span>
                                    <span className="ml-2 text-muted-foreground">{unassignedCount}</span>
                                </div>
                            )}
                            {departments.length === 0 && (
                                <p className="py-2 text-sm text-muted-foreground">
                                    No departments have been set up yet.
                                </p>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
                    <CardTitle className="text-base">
                        Staff directory
                        {dept !== 'ALL' && <span className="ml-2 font-normal text-muted-foreground">· {dept}</span>}
                    </CardTitle>
                    {dept !== 'ALL' && (
                        <Link href="/hr" className="text-sm text-primary hover:underline">
                            Clear filter
                        </Link>
                    )}
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="border-b bg-muted">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Employee</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Department</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Designation</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Type</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Joined</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-muted-foreground">Net pay</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {staff.map(s => (
                                    <tr key={s.id} className="hover:bg-muted">
                                        <td className="px-4 py-3">
                                            <Link href={`/hr/staff/${s.id}`} className="font-medium text-primary hover:underline">
                                                {s.firstName} {s.lastName}
                                            </Link>
                                            <div className="text-xs text-muted-foreground">
                                                {s.employeeId} · {s.email}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-sm">{s.departmentName || '—'}</td>
                                        <td className="px-4 py-3 text-sm">{s.designationName || '—'}</td>
                                        <td className="px-4 py-3 text-sm">{employmentTypeLabel(s.employmentType)}</td>
                                        <td className="px-4 py-3 text-sm">{formatDate(s.joiningDate)}</td>
                                        <td className="px-4 py-3 text-right text-sm">
                                            {formatCurrency(Number(s.salaryNet ?? 0))}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${staffStatusClass(s.status)}`}>
                                                {staffStatusLabel(s.status)}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {staff.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                                            {dept === 'ALL'
                                                ? 'No staff records yet. Use “Add staff member” to create the first one.'
                                                : `No staff in ${dept}.`}
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
