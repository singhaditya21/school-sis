import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Award, Bell, Bus, CalendarCheck, IndianRupee, QrCode, ShieldCheck } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { ParentTopBar } from '@/components/parent/parent-top-bar';
import { getChildOverview, getMyChildren } from '../actions';

export const dynamic = 'force-dynamic';

const QUICK_LINKS: { href: string; icon: LucideIcon; label: string; subtitle: string }[] = [
    { href: '/my-attendance', icon: CalendarCheck, label: 'Attendance', subtitle: 'Monthly register & summary' },
    { href: '/my-results', icon: Award, label: 'Report Cards', subtitle: 'Board grades & verified PDF' },
    { href: '/my-fees', icon: IndianRupee, label: 'Fees & Receipts', subtitle: 'UPI checkout & receipts' },
    { href: '/my-transport', icon: Bus, label: 'Transport & Gate Pass', subtitle: 'Bus route & pickup QR pass' },
    { href: '/alerts', icon: Bell, label: 'School Alerts', subtitle: 'Broadcasts & notices' },
    { href: '/parent-consent', icon: ShieldCheck, label: 'Consent Forms', subtitle: 'DPDP guardian approvals' },
];

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
                <div className="rounded-xl border border-dashed bg-card p-12 text-center">
                    <p className="text-lg font-medium text-foreground">No child linked to your account</p>
                    <p className="mt-2 text-sm text-muted-foreground">
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

            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">{child.name}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {child.gradeName} · Section {child.sectionName} · Admission {child.admissionNumber}
                        {child.rollNumber !== null ? ` · Roll ${child.rollNumber}` : ''}
                        {child.status !== 'ACTIVE' ? ` · ${child.status}` : ''}
                    </p>
                </div>
                <Link
                    href={withChild('/my-transport', child.id)}
                    className="inline-flex items-center gap-2 rounded-xl border border-brass/40 bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent/80"
                >
                    <QrCode className="h-4 w-4 text-brass" />
                    Digital Dismissal Gate Pass
                </Link>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                    <h2 className="mb-2 font-semibold text-foreground">Attendance this month</h2>
                    {attendance.rate === null ? (
                        <>
                            <p className="text-xl font-semibold text-muted-foreground">Not marked yet</p>
                            <p className="text-sm text-muted-foreground">No register entries for this month</p>
                        </>
                    ) : (
                        <>
                            <p
                                className={`text-3xl font-bold tabular-nums ${
                                    attendance.rate >= 85
                                        ? 'text-success'
                                        : attendance.rate >= 75
                                          ? 'text-warning'
                                          : 'text-destructive'
                                }`}
                            >
                                {attendance.rate}%
                            </p>
                            <p className="text-sm text-muted-foreground">
                                {attendance.present} present · {attendance.late} late · {attendance.absent} absent
                                {' '}of {attendance.marked} days
                            </p>
                        </>
                    )}
                </div>

                <div
                    className={`rounded-xl border p-6 shadow-sm ${
                        fees.outstanding > 0 ? 'border-warning/35 bg-warning-subtle' : 'border-border bg-card'
                    }`}
                >
                    <h2
                        className={`mb-2 font-semibold ${
                            fees.outstanding > 0 ? 'text-warning-subtle-foreground' : 'text-foreground'
                        }`}
                    >
                        Outstanding fees
                    </h2>
                    <p
                        className={`text-3xl font-bold tabular-nums ${
                            fees.outstanding > 0 ? 'text-warning-subtle-foreground' : 'text-success'
                        }`}
                    >
                        {formatCurrency(fees.outstanding)}
                    </p>
                    <p
                        className={`text-sm ${
                            fees.outstanding > 0 ? 'text-warning-subtle-foreground' : 'text-muted-foreground'
                        }`}
                    >
                        {fees.outstanding <= 0
                            ? 'Nothing due'
                            : fees.overdueCount > 0
                              ? `${fees.overdueCount} invoice${fees.overdueCount === 1 ? '' : 's'} overdue`
                              : fees.nearestDueDate
                                ? `Next due ${fees.nearestDueDate}`
                                : 'No due date set'}
                    </p>
                </div>

                <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                    <h2 className="mb-2 font-semibold text-foreground">Latest published result</h2>
                    {latestExam ? (
                        <>
                            <p className="text-3xl font-bold tabular-nums text-foreground">{latestExam.average}%</p>
                            <p className="text-sm text-muted-foreground">
                                {latestExam.examName} · {latestExam.subjectCount} subject
                                {latestExam.subjectCount === 1 ? '' : 's'}
                            </p>
                        </>
                    ) : (
                        <>
                            <p className="text-xl font-semibold text-muted-foreground">Nothing published</p>
                            <p className="text-sm text-muted-foreground">
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
                            className="flex-1 rounded-xl border border-destructive/30 bg-destructive-subtle p-4 transition-opacity hover:opacity-90"
                        >
                            <p className="font-semibold text-destructive-subtle-foreground">
                                {unreadAlerts} unread alert{unreadAlerts === 1 ? '' : 's'}
                            </p>
                            <p className="text-sm text-destructive-subtle-foreground/85">
                                Tap to read messages from the school
                            </p>
                        </Link>
                    )}
                    {pendingConsents > 0 && (
                        <Link
                            href={withChild('/parent-consent', child.id)}
                            className="flex-1 rounded-xl border border-brass/35 bg-accent p-4 transition-opacity hover:opacity-90"
                        >
                            <p className="font-semibold text-accent-foreground">
                                {pendingConsents} consent form{pendingConsents === 1 ? '' : 's'} awaiting your answer
                            </p>
                            <p className="text-sm text-muted-foreground">For {child.name}</p>
                        </Link>
                    )}
                </div>
            )}

            <div>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Parent Services
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                    {QUICK_LINKS.map((link) => {
                        const Icon = link.icon;
                        return (
                            <Link
                                key={link.href}
                                href={withChild(link.href, child.id)}
                                className="group flex items-start gap-3.5 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-all hover:border-brass/40 hover:shadow-md"
                            >
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-brass/30 bg-accent text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                                    <Icon className="h-5 w-5" />
                                </div>
                                <div className="min-w-0">
                                    <p className="font-semibold text-foreground">{link.label}</p>
                                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                        {link.href === '/my-transport' && transportRoute
                                            ? transportRoute
                                            : link.subtitle}
                                    </p>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
