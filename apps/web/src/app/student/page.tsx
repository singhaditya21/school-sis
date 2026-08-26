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
            <div className="border-b border-gray-200 pb-4">
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                    Hello, {student.fullName.split(' ')[0]}
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                    {student.gradeName} · Section {student.sectionName} · Admission no. {student.admissionNumber}
                    {student.rollNumber !== null && <> · Roll no. {student.rollNumber}</>}
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border shadow-sm p-6">
                    <h2 className="text-sm font-medium text-gray-500">Attendance to date</h2>
                    {attendanceToDate.rate === null ? (
                        <p className="mt-2 text-sm text-gray-500">No attendance marked yet</p>
                    ) : (
                        <>
                            <p className="mt-2 text-3xl font-bold text-gray-900">{attendanceToDate.rate}%</p>
                            <p className="text-sm text-gray-500">
                                {attendanceToDate.present} of {attendanceToDate.marked} marked days
                            </p>
                        </>
                    )}
                </div>

                <div className="bg-white rounded-xl border shadow-sm p-6">
                    <h2 className="text-sm font-medium text-gray-500">Published results</h2>
                    <p className="mt-2 text-3xl font-bold text-gray-900">{publishedResultCount}</p>
                    <p className="text-sm text-gray-500">subject marks released</p>
                </div>

                <div className="bg-white rounded-xl border shadow-sm p-6">
                    <h2 className="text-sm font-medium text-gray-500">Homework</h2>
                    <p className="mt-2 text-3xl font-bold text-gray-900">{homeworkDueSoon}</p>
                    <p className="text-sm text-gray-500">
                        due in the next 7 days
                        {homeworkOverdueUnsubmitted > 0 && (
                            <span className="text-red-600"> · {homeworkOverdueUnsubmitted} overdue</span>
                        )}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Link href="/student/attendance" className="bg-white rounded-xl border shadow-sm p-4 text-center hover:shadow-md transition-shadow">
                    <div className="text-2xl mb-1">🗓️</div>
                    <p className="font-medium text-gray-900">My attendance</p>
                </Link>
                <Link href="/student/results" className="bg-white rounded-xl border shadow-sm p-4 text-center hover:shadow-md transition-shadow">
                    <div className="text-2xl mb-1">📄</div>
                    <p className="font-medium text-gray-900">My results</p>
                </Link>
                <Link href="/student/homework" className="bg-white rounded-xl border shadow-sm p-4 text-center hover:shadow-md transition-shadow">
                    <div className="text-2xl mb-1">📝</div>
                    <p className="font-medium text-gray-900">My homework</p>
                </Link>
            </div>

            <p className="text-xs text-gray-400">
                Fees, transport and report-card downloads are handled through the parent portal;
                a student login cannot read them.
            </p>
        </div>
    );
}
