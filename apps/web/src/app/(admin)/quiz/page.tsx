import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { getQuizStatusCounts, listQuizzes } from './queries';
import { formatDate } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    PUBLISHED: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    CLOSED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const FILTERS = [
    { value: '', label: 'All' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'PUBLISHED', label: 'Published' },
    { value: 'CLOSED', label: 'Closed' },
];

export default async function QuizPage({
    searchParams,
}: {
    searchParams: Promise<{ status?: string }>;
}) {
    const { status = '' } = await searchParams;

    const [quizzes, stats] = await Promise.all([
        listQuizzes(status),
        getQuizStatusCounts(),
    ]);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold">Online Quizzes</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                        Build question papers, publish them to a class, and review the scores that come back.
                    </p>
                </div>
                <Link
                    href="/quiz/new"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                    New Quiz
                </Link>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Total Quizzes</div><div className="text-2xl font-bold text-blue-600">{stats.total}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Published</div><div className="text-2xl font-bold text-green-600">{stats.published}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Draft</div><div className="text-2xl font-bold text-gray-600 dark:text-gray-300">{stats.draft}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Closed</div><div className="text-2xl font-bold text-red-600">{stats.closed}</div></CardContent></Card>
            </div>

            <div className="flex flex-wrap gap-2">
                {FILTERS.map((f) => {
                    const active = status === f.value;
                    return (
                        <Link
                            key={f.label}
                            href={f.value ? `/quiz?status=${f.value}` : '/quiz'}
                            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                                active
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                            }`}
                        >
                            {f.label}
                        </Link>
                    );
                })}
            </div>

            <Card>
                <CardContent className="p-0 overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-900 border-b dark:border-gray-800">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subject / Class</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Questions</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Duration</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Marks</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Attempts</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y dark:divide-gray-800">
                            {quizzes.map((q) => (
                                <tr key={q.id} className="hover:bg-gray-50 dark:hover:bg-gray-900">
                                    <td className="px-4 py-3 font-medium">
                                        <Link href={`/quiz/${q.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                                            {q.title}
                                        </Link>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                        {q.subjectName ?? 'No subject'}
                                        {q.gradeName ? ` · ${q.gradeName}${q.sectionName ? `-${q.sectionName}` : ''}` : ''}
                                    </td>
                                    <td className="px-4 py-3 text-center">{q.questionCount}</td>
                                    <td className="px-4 py-3 text-center">{q.duration} min</td>
                                    <td className="px-4 py-3 text-center">{q.totalMarks}</td>
                                    <td className="px-4 py-3 text-center">
                                        {q.attemptCount > 0 ? (
                                            <Link href={`/quiz/${q.id}/results`} className="text-blue-600 dark:text-blue-400 hover:underline">
                                                {q.attemptCount}
                                            </Link>
                                        ) : (
                                            <span className="text-gray-400">0</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[q.status] ?? 'bg-gray-100'}`}>
                                            {q.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(q.createdAt)}</td>
                                </tr>
                            ))}
                            {quizzes.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                                        {status
                                            ? `No ${status.toLowerCase()} quizzes.`
                                            : 'No quizzes yet. Create one to get started.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
}
