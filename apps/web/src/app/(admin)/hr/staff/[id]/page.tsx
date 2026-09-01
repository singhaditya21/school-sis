import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { requireAuth } from '@/lib/auth/middleware';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { getLeaveBalance, getLeaveRequests, getStaffById } from '@/lib/actions/hr';
import {
    employmentTypeLabel,
    formatDate,
    leaveStatusClass,
    leaveTypeLabel,
    staffStatusClass,
    staffStatusLabel,
} from '../../labels';

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ id: string }>;
}

function rupees(value: string | null | undefined): string {
    return formatCurrency(Number(value ?? 0));
}

export default async function StaffDetailPage({ params }: PageProps) {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    try {
        await requireAuth('hr:read');
    } catch {
        redirect('/unauthorized');
    }

    const { id } = await params;

    const [staff, balances, history] = await Promise.all([
        getStaffById(id),
        getLeaveBalance(id),
        getLeaveRequests({ staffId: id, status: 'ALL', limit: 50 }),
    ]);

    if (!staff) notFound();

    const earnings = [
        { label: 'Basic', value: staff.salaryBasic },
        { label: 'HRA', value: staff.salaryHra },
        { label: 'DA', value: staff.salaryDa },
    ];
    const deductions = [
        { label: 'PF', value: staff.salaryPf },
        { label: 'Tax', value: staff.salaryTax },
    ];

    return (
        <div className="space-y-6">
            <div>
                <Link href="/hr" className="text-sm text-primary hover:underline">
                    ← Staff &amp; HR
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                    <h1 className="text-3xl font-bold">
                        {staff.firstName} {staff.lastName}
                    </h1>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${staffStatusClass(staff.status)}`}>
                        {staffStatusLabel(staff.status)}
                    </span>
                </div>
                <p className="mt-1 text-muted-foreground">
                    {staff.employeeId}
                    {staff.designationName ? ` · ${staff.designationName}` : ''}
                    {staff.departmentName ? ` · ${staff.departmentName}` : ''}
                </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Employment</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm md:grid-cols-3">
                            <Field label="Email" value={staff.email} />
                            <Field label="Phone" value={staff.phone} />
                            <Field label="Employment type" value={employmentTypeLabel(staff.employmentType)} />
                            <Field label="Joined" value={formatDate(staff.joiningDate)} />
                            <Field label="Confirmed" value={formatDate(staff.confirmationDate)} />
                            <Field label="Date of birth" value={formatDate(staff.dateOfBirth)} />
                            <Field label="Qualification" value={staff.qualification} />
                            <Field
                                label="Experience"
                                value={
                                    staff.experienceYears === null || staff.experienceYears === undefined
                                        ? null
                                        : `${staff.experienceYears} ${Number(staff.experienceYears) === 1 ? 'year' : 'years'}`
                                }
                            />
                            <Field label="Specialization" value={staff.specialization} />
                            <Field label="PAN" value={staff.panNumber} />
                            <Field label="Bank" value={staff.bankName} />
                            <Field label="Bank account" value={staff.bankAccount} />
                            <Field
                                label="Emergency contact"
                                value={
                                    staff.emergencyContactName || staff.emergencyContact
                                        ? `${staff.emergencyContactName ?? ''}${staff.emergencyContactName && staff.emergencyContact ? ' · ' : ''}${staff.emergencyContact ?? ''}`
                                        : null
                                }
                            />
                            <div className="col-span-2 md:col-span-3">
                                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Address</dt>
                                <dd className="mt-0.5 whitespace-pre-line">{staff.address || '—'}</dd>
                            </div>
                        </dl>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Monthly salary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        {earnings.map(row => (
                            <div key={row.label} className="flex justify-between">
                                <span className="text-muted-foreground">{row.label}</span>
                                <span>{rupees(row.value)}</span>
                            </div>
                        ))}
                        <div className="flex justify-between border-t pt-3 font-medium">
                            <span>Gross</span>
                            <span>{rupees(staff.salaryGross)}</span>
                        </div>
                        {deductions.map(row => (
                            <div key={row.label} className="flex justify-between text-muted-foreground">
                                <span>{row.label}</span>
                                <span>− {rupees(row.value)}</span>
                            </div>
                        ))}
                        <div className="flex justify-between border-t pt-3 text-base font-bold">
                            <span>Net</span>
                            <span className="text-indigo-600">{rupees(staff.salaryNet)}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                        Leave balance <span className="font-normal text-muted-foreground">· {new Date().getFullYear()}</span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="border-b bg-muted">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Policy</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-muted-foreground">Entitled</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-muted-foreground">Used</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-muted-foreground">Remaining</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {balances.map(b => (
                                    <tr key={b.leaveType}>
                                        <td className="px-4 py-3 text-sm">
                                            <span className="font-medium">{b.name}</span>
                                            <span className="ml-2 text-xs text-muted-foreground">{leaveTypeLabel(b.leaveType)}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right text-sm">{b.total}</td>
                                        <td className="px-4 py-3 text-right text-sm">{b.used}</td>
                                        <td className={`px-4 py-3 text-right text-sm font-medium ${b.remaining < 0 ? 'text-red-600' : ''}`}>
                                            {b.remaining}
                                        </td>
                                    </tr>
                                ))}
                                {balances.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                                            No active leave policies are configured, so no balance can be shown.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
                    <CardTitle className="text-base">Leave history</CardTitle>
                    <Link href="/hr/leave" className="text-sm text-primary hover:underline">
                        All requests
                    </Link>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="border-b bg-muted">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Type</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Dates</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-muted-foreground">Days</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Reason</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {history.map(r => (
                                    <tr key={r.id}>
                                        <td className="px-4 py-3 text-sm">{leaveTypeLabel(r.leaveType)}</td>
                                        <td className="px-4 py-3 text-sm">
                                            {formatDate(r.fromDate)} → {formatDate(r.toDate)}
                                        </td>
                                        <td className="px-4 py-3 text-right text-sm">{r.totalDays}</td>
                                        <td className="max-w-xs px-4 py-3 text-sm">
                                            <div className="truncate" title={r.reason}>{r.reason}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${leaveStatusClass(r.status)}`}>
                                                {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {history.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                                            No leave requests on record for this staff member.
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

function Field({ label, value }: { label: string; value: string | null | undefined }) {
    return (
        <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="mt-0.5">{value || '—'}</dd>
        </div>
    );
}
