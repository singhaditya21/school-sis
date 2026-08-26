import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';
import { ParentTopBar } from '@/components/parent/parent-top-bar';
import { getChildOverview, getMyChildren } from '../actions';

export const dynamic = 'force-dynamic';

const QUICK_LINKS = [
    { href: '/my-attendance', icon: '📅', label: 'Attendance' },
    { href: '/my-results', icon: '📊', label: 'Results' },
    { href: '/my-fees', icon: '💰', label: 'Fees' },
    { href: '/my-transport', icon: '🚌', label: 'Transport' },
    { href: '/alerts', icon: '🔔', label: 'Alerts' },
    { href: '/parent-consent', icon: '🛡️', label: 'Consent forms' },
] as const;

function withChild(href: string, studentId: string | null): string {
    return studentId ? `${href}?child=${studentId}` : href;
}

export default async function ParentOverviewPage({
    searchParams,
}: {
    searchParams: Promise<{ child?: string }>;
}) {
    const { child: requestedChild } = await searchParams;
    const students = await getMyChildren();
    const overview = await getChildOverview(requestedChild);

    if (!overview) {
        return (
            <div className="mx-auto max-w-4xl space-y-6">
                <ParentTopBar students={students} selectedId={null} />
                <div className="rounded-xl border border-dashed bg-white p-12 text-center">
                    <p className="text-lg font-medium text-slate-700">No child linked to your account</p>
                    <p className="mt-2 text-sm text-slate-500">
                        Your account is not yet connected to a student record. Please ask the school
                        office to link you as a guardian — attendance, results, fees and transport will
                        appear here once they do.
                    </p>
                </div>
            </div>
        );
    }

    const { child, attendance, fees, latestExam, unreadAlerts, pendingConsents, transportRoute } = overview;

    return (
        <div className="mx-auto max-w-5xl space-y-6">
            <ParentTopBar students={students} selectedId={child.id} />

            <div>
                <h1 className="text-2xl font-bold text-slate-900">{child.name}</h1>
                <p className="mt-1 text-sm text-slate-500">
                    {child.gradeName} · Section {child.sectionName} · Admission {child.admissionNumber}
                    {child.rollNumber !== null ? ` · Roll ${child.rollNumber}` : ''}
                    {child.status !== 'ACTIVE' ? ` · ${child.status}` : ''}
                </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-xl border bg-white p-6 shadow-sm">
                    <h2 className="mb-2 font-semibold text-slate-900">Attendance this month</h2>
                    {attendance.rate === null ? (
                        <>
                            <p className="text-xl font-semibold text-slate-400">Not marked yet</p>
                            <p className="text-sm text-slate-500">No register entries for this month</p>
                        </>
                    ) : (
                        <>
                            <p
                                className={`text-3xl font-bold ${
                                    attendance.rate >= 85
                                        ? 'text-emerald-600'
                                        : attendance.rate >= 75
                                          ? 'text-amber-600'
                                          : 'text-red-600'
                                }`}
                            >
                                {attendance.rate}%
                            </p>
                            <p className="text-sm text-slate-500">
                                {attendance.present} present · {attendance.late} late · {attendance.absent} absent
                                {' '}of {attendance.marked} days
                            </p>
                        </>
                    )}
                </div>

                <div
                    className={`rounded-xl border p-6 shadow-sm ${
                        fees.outstanding > 0 ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'
                    }`}
                >
                    <h2 className={`mb-2 font-semibold ${fees.outstanding > 0 ? 'text-amber-900' : 'text-slate-900'}`}>
                        Outstanding fees
                    </h2>
                    <p className={`text-3xl font-bold ${fees.outstanding > 0 ? 'text-amber-700' : 'text-emerald-600'}`}>
                        {formatCurrency(fees.outstanding)}
                    </p>
                    <p className={`text-sm ${fees.outstanding > 0 ? 'text-amber-700' : 'text-slate-500'}`}>
                        {fees.outstanding <= 0
                            ? 'Nothing due'
                            : fees.overdueCount > 0
                              ? `${fees.overdueCount} invoice${fees.overdueCount === 1 ? '' : 's'} overdue`
                              : fees.nearestDueDate
                                ? `Next due ${fees.nearestDueDate}`
                                : 'No due date set'}
                    </p>
                </div>

                <div className="rounded-xl border bg-white p-6 shadow-sm">
                    <h2 className="mb-2 font-semibold text-slate-900">Latest published result</h2>
                    {latestExam ? (
                        <>
                            <p className="text-3xl font-bold text-slate-900">{latestExam.average}%</p>
                            <p className="text-sm text-slate-500">
                                {latestExam.examName} · {latestExam.subjectCount} subject
                                {latestExam.subjectCount === 1 ? '' : 's'}
                            </p>
                        </>
                    ) : (
                        <>
                            <p className="text-xl font-semibold text-slate-400">Nothing published</p>
                            <p className="text-sm text-slate-500">
                                Results appear once the school publishes the exam
                            </p>
                        </>
                    )}
                </div>
            </div>

            {(unreadAlerts > 0 || pendingConsents > 0) && (
                <div className="flex flex-col gap-3 sm:flex-row">
                    {unreadAlerts > 0 && (
                        <Link
                            href={withChild('/alerts', child.id)}
                            className="flex-1 rounded-xl border border-rose-200 bg-rose-50 p-4 transition-colors hover:bg-rose-100"
                        >
                            <p className="font-semibold text-rose-900">
                                {unreadAlerts} unread alert{unreadAlerts === 1 ? '' : 's'}
                            </p>
                            <p className="text-sm text-rose-700">Tap to read messages from the school</p>
                        </Link>
                    )}
                    {pendingConsents > 0 && (
                        <Link
                            href={withChild('/parent-consent', child.id)}
                            className="flex-1 rounded-xl border border-teal-200 bg-teal-50 p-4 transition-colors hover:bg-teal-100"
                        >
                            <p className="font-semibold text-teal-900">
                                {pendingConsents} consent form{pendingConsents === 1 ? '' : 's'} awaiting your answer
                            </p>
                            <p className="text-sm text-teal-700">For {child.name}</p>
                        </Link>
                    )}
                </div>
            )}

            <div>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
                    Go to
                </h2>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                    {QUICK_LINKS.map((link) => (
                        <Link
                            key={link.href}
                            href={withChild(link.href, child.id)}
                            className="rounded-xl border bg-white p-4 text-center shadow-sm transition-shadow hover:shadow-md"
                        >
                            <div className="mb-2 text-2xl">{link.icon}</div>
                            <p className="font-medium text-slate-800">{link.label}</p>
                            {link.href === '/my-transport' && transportRoute && (
                                <p className="mt-1 truncate text-xs text-slate-500">{transportRoute}</p>
                            )}
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}
