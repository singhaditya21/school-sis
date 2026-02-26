import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';
import { getExams } from '@/lib/actions/exams';

export default async function ExamsPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const exams = await getExams();

    const examTypeColors: Record<string, string> = {
        UNIT_TEST: 'bg-blue-100 text-blue-700',
        TERM_EXAM: 'bg-purple-100 text-purple-700',
        MID_TERM: 'bg-orange-100 text-orange-700',
        FINAL: 'bg-red-100 text-red-700',
        PRACTICAL: 'bg-green-100 text-green-700',
        PROJECT: 'bg-yellow-100 text-yellow-700',
        INTERNAL: 'bg-gray-100 text-gray-700',
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Exams & Gradebook</h1>
                    <p className="text-gray-600 mt-1">
                        Manage examinations, marks entry, and report cards
                    </p>
                </div>
                <Link href="/exams/create" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    + Create Exam
                </Link>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-gray-500">Total Exams</p>
                    <p className="text-2xl font-bold text-gray-900">{exams.length}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-gray-500">Total Schedules</p>
                    <p className="text-2xl font-bold text-blue-600">
                        {exams.reduce((sum, e) => sum + e.scheduleCount, 0)}
                    </p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-gray-500">Quick Actions</p>
                    <Link href="/exams/report-cards" className="text-blue-600 hover:underline text-sm">
                        📄 Report Cards →
                    </Link>
                </div>
            </div>

            {/* Exams List */}
            <div className="bg-white rounded-xl shadow-sm border">
                <div className="p-4 border-b">
                    <h2 className="font-semibold text-gray-900">All Exams</h2>
                </div>

                {exams.length === 0 ? (
                    <div className="p-8 text-center">
                        <div className="text-4xl mb-3">📝</div>
                        <p className="text-gray-500 mb-4">No exams created yet</p>
                        <Link href="/exams/create" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                            Create Your First Exam
                        </Link>
                    </div>
                ) : (
                    <div className="divide-y">
                        {exams.map((exam) => (
                            <Link
                                key={exam.id}
                                href={`/exams/${exam.id}`}
                                className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                                        <span className="text-xl">📝</span>
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900">{exam.name}</p>
                                        <p className="text-sm text-gray-500">
                                            {exam.academicYearName}
                                            {' • '}
                                            {formatDate(exam.startDate)} - {formatDate(exam.endDate)}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${examTypeColors[exam.type] || 'bg-gray-100 text-gray-700'}`}>
                                        {exam.type?.replace(/_/g, ' ') || 'EXAM'}
                                    </span>
                                    <div className="text-right text-sm">
                                        <p className="text-gray-500">{exam.scheduleCount} schedules</p>
                                    </div>
                                    <span className="text-gray-400">→</span>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
