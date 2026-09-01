import Link from 'next/link';
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
                <div className="bg-card rounded-xl border shadow-sm p-6">
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

                <div className="bg-card rounded-xl border shadow-sm p-6">
                    <h2 className="text-sm font-medium text-muted-foreground">Published results</h2>
                    <p className="mt-2 text-3xl font-bold text-foreground">{publishedResultCount}</p>
                    <p className="text-sm text-muted-foreground">subject marks released</p>
                </div>

                <div className="bg-card rounded-xl border shadow-sm p-6">
                    <h2 className="text-sm font-medium text-muted-foreground">Homework</h2>
                    <p className="mt-2 text-3xl font-bold text-foreground">{homeworkDueSoon}</p>
                    <p className="text-sm text-muted-foreground">
                        due in the next 7 days
                        {homeworkOverdueUnsubmitted > 0 && (
                            <span className="text-red-600"> · {homeworkOverdueUnsubmitted} overdue</span>
                        )}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Link href="/student/attendance" className="bg-card rounded-xl border shadow-sm p-4 text-center hover:shadow-md transition-shadow">
                    <div className="text-2xl mb-1">🗓️</div>
                    <p className="font-medium text-foreground">My attendance</p>
                </Link>
                <Link href="/student/results" className="bg-card rounded-xl border shadow-sm p-4 text-center hover:shadow-md transition-shadow">
                    <div className="text-2xl mb-1">📄</div>
                    <p className="font-medium text-foreground">My results</p>
                </Link>
                <Link href="/student/homework" className="bg-card rounded-xl border shadow-sm p-4 text-center hover:shadow-md transition-shadow">
                    <div className="text-2xl mb-1">📝</div>
                    <p className="font-medium text-foreground">My homework</p>
                </Link>
            </div>

            <p className="text-xs text-muted-foreground">
                Fees, transport and report-card downloads are handled through the parent portal;
                a student login cannot read them.
            </p>
        </div>
    );
}
