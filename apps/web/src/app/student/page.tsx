import Link from 'next/link';
import { Award, BookOpen, CalendarCheck } from 'lucide-react';
import { getMyOverview } from './_lib/queries';
import { AccountNotLinked } from './_components/AccountNotLinked';

export const dynamic = 'force-dynamic';

export default async function StudentOverviewPage() {
    const overview = await getMyOverview();

    if (!overview) {
        return <AccountNotLinked what="school record" />;
    }

    const { student, attendanceToDate, publishedResultCount, homeworkDueSoon, homeworkOverdueUnsubmitted } = overview;

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-6">
            <div className="border-b border-border pb-4">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                    Hello, {student.fullName.split(' ')[0]}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    {student.gradeName} · Section {student.sectionName} · Admission no. {student.admissionNumber}
                    {student.rollNumber !== null && <> · Roll no. {student.rollNumber}</>}
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-card rounded-xl border border-border shadow-sm p-6">
                    <h2 className="text-sm font-medium text-muted-foreground">Attendance to date</h2>
                    {attendanceToDate.rate === null ? (
                        <p className="mt-2 text-sm text-muted-foreground">No attendance marked yet</p>
                    ) : (
                        <>
                            <p className="mt-2 text-3xl font-bold text-foreground">{attendanceToDate.rate}%</p>
                            <p className="text-sm text-muted-foreground">
                                {attendanceToDate.present} of {attendanceToDate.marked} marked days
                            </p>
                        </>
                    )}
                </div>

                <div className="bg-card rounded-xl border border-border shadow-sm p-6">
                    <h2 className="text-sm font-medium text-muted-foreground">Published results</h2>
                    <p className="mt-2 text-3xl font-bold text-foreground">{publishedResultCount}</p>
                    <p className="text-sm text-muted-foreground">subject marks released</p>
                </div>

                <div className="bg-card rounded-xl border border-border shadow-sm p-6">
                    <h2 className="text-sm font-medium text-muted-foreground">Homework</h2>
                    <p className="mt-2 text-3xl font-bold text-foreground">{homeworkDueSoon}</p>
                    <p className="text-sm text-muted-foreground">
                        due in the next 7 days
                        {homeworkOverdueUnsubmitted > 0 && (
                            <span className="text-destructive"> · {homeworkOverdueUnsubmitted} overdue</span>
                        )}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Link
                    href="/student/attendance"
                    className="group bg-card rounded-xl border border-border shadow-sm p-5 flex items-center gap-3.5 hover:border-brass/40 hover:shadow-md transition-all"
                >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent border border-brass/30 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        <CalendarCheck className="h-5 w-5" />
                    </div>
                    <div className="text-left">
                        <p className="font-semibold text-foreground">My attendance</p>
                        <p className="text-xs text-muted-foreground">Daily &amp; monthly register</p>
                    </div>
                </Link>
                <Link
                    href="/student/results"
                    className="group bg-card rounded-xl border border-border shadow-sm p-5 flex items-center gap-3.5 hover:border-brass/40 hover:shadow-md transition-all"
                >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent border border-brass/30 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        <Award className="h-5 w-5" />
                    </div>
                    <div className="text-left">
                        <p className="font-semibold text-foreground">My results</p>
                        <p className="text-xs text-muted-foreground">Published exam marks</p>
                    </div>
                </Link>
                <Link
                    href="/student/homework"
                    className="group bg-card rounded-xl border border-border shadow-sm p-5 flex items-center gap-3.5 hover:border-brass/40 hover:shadow-md transition-all"
                >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent border border-brass/30 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        <BookOpen className="h-5 w-5" />
                    </div>
                    <div className="text-left">
                        <p className="font-semibold text-foreground">My homework</p>
                        <p className="text-xs text-muted-foreground">Upcoming &amp; submitted work</p>
                    </div>
                </Link>
            </div>

            <p className="text-xs text-muted-foreground">
                Fees, transport and report-card downloads are handled through the parent portal;
                a student login cannot read them.
            </p>
        </div>
    );
}
