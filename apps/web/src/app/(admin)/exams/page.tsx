import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';
import { getExamOverview } from './_actions/exam-marks';

const TYPE_COLORS: Record<string, string> = {
    UNIT_TEST: 'bg-blue-100 text-blue-700',
    MID_TERM: 'bg-orange-100 text-orange-700',
    FINAL: 'bg-red-100 text-red-700',
    PRACTICE: 'bg-green-100 text-green-700',
    BOARD_PREP: 'bg-purple-100 text-purple-700',
};

const STATUS_COLORS: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-700',
    SCHEDULED: 'bg-blue-100 text-blue-700',
    MARKS_ENTRY: 'bg-amber-100 text-amber-800',
    RESULT_REVIEW: 'bg-purple-100 text-purple-700',
    PUBLISHED: 'bg-green-100 text-green-700',
};

export default async function ExamsPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const exams = await getExamOverview();

    const totalSchedules = exams.reduce((sum, e) => sum + e.scheduleCount, 0);
    const totalEntered = exams.reduce((sum, e) => sum + e.resultCount, 0);
    const totalExpected = exams.reduce((sum, e) => sum + e.expectedCount, 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Exams &amp; Gradebook</h1>
                    <p className="text-gray-600 mt-1">
                        Schedule examinations, enter marks, verify and publish results
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link
                        href="/exams/verification"
                        className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                    >
                        Verify marks
                    </Link>
                    <Link
                        href="/exams/report-cards"
                        className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                    >
                        Report cards
                    </Link>
                    <Link
                        href="/exams/create"
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                    >
                        + Create exam
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-gray-500">Exams</p>
                    <p className="text-2xl font-bold text-gray-900">{exams.length}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-gray-500">Papers scheduled</p>
                    <p className="text-2xl font-bold text-blue-600">{totalSchedules}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-gray-500">Marks entered</p>
                    <p className="text-2xl font-bold text-gray-900">
                        {totalEntered}
                        <span className="text-base font-medium text-gray-400"> / {totalExpected}</span>
                    </p>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border">
                <div className="p-4 border-b">
                    <h2 className="font-semibold text-gray-900">All exams</h2>
                </div>

                {exams.length === 0 ? (
                    <div className="p-8 text-center">
                        <p className="font-medium text-gray-900">No exams created yet</p>
                        <p className="text-sm text-gray-500 mt-1 mb-4">
                            Create an exam, then add a paper for each class and subject.
                        </p>
                        <Link
                            href="/exams/create"
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            Create your first exam
                        </Link>
                    </div>
                ) : (
                    <div className="divide-y">
                        {exams.map((exam) => {
                            const progress =
                                exam.expectedCount > 0
                                    ? Math.min(
                                          100,
                                          Math.round((exam.resultCount / exam.expectedCount) * 100),
                                      )
                                    : 0;
                            return (
                                <Link
                                    key={exam.id}
                                    href={`/exams/${exam.id}`}
                                    className="flex flex-wrap items-center justify-between gap-4 p-4 hover:bg-gray-50 transition-colors"
                                >
                                    <div className="min-w-0">
                                        <p className="font-medium text-gray-900">{exam.name}</p>
                                        <p className="text-sm text-gray-500">
                                            {exam.academicYearName} · {formatDate(exam.startDate)} –{' '}
                                            {formatDate(exam.endDate)}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-4">
                                        <span
                                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                                                TYPE_COLORS[exam.type] || 'bg-gray-100 text-gray-700'
                                            }`}
                                        >
                                            {exam.type?.replace(/_/g, ' ') || 'EXAM'}
                                        </span>
                                        <span
                                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                                                STATUS_COLORS[exam.status] || 'bg-gray-100 text-gray-700'
                                            }`}
                                        >
                                            {exam.status?.replace(/_/g, ' ') || 'DRAFT'}
                                        </span>
                                        <div className="text-right text-sm w-40">
                                            <p className="text-gray-500">
                                                {exam.scheduleCount} paper(s) ·{' '}
                                                {exam.expectedCount > 0
                                                    ? `${progress}% marked`
                                                    : 'no students'}
                                            </p>
                                            <div className="h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                                                <div
                                                    className="h-full bg-blue-500 rounded-full"
                                                    style={{ width: `${progress}%` }}
                                                />
                                            </div>
                                        </div>
                                        <span className="text-gray-400">→</span>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
