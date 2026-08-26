import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getQuizAttempts, getQuizDetail, type QuizAttemptRow, type QuizQuestionRow } from '../../queries';

const BUCKETS = [
    { label: '0-19%', min: 0, max: 20, color: 'bg-red-500' },
    { label: '20-39%', min: 20, max: 40, color: 'bg-orange-500' },
    { label: '40-59%', min: 40, max: 60, color: 'bg-yellow-500' },
    { label: '60-79%', min: 60, max: 80, color: 'bg-blue-500' },
    { label: '80-100%', min: 80, max: 101, color: 'bg-green-500' },
];

/**
 * Mirrors the grading rule used when an attempt is scored: short answers are
 * compared case-insensitively after trimming, everything else exactly.
 */
function isAnswerCorrect(question: QuizQuestionRow, answer: string | number | undefined) {
    if (answer === undefined || answer === null || answer === '') return false;
    if (question.type === 'SHORT_ANSWER') {
        return String(answer).toLowerCase().trim() === question.correctAnswer.toLowerCase().trim();
    }
    return String(answer) === question.correctAnswer;
}

function median(values: number[]) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
        : sorted[mid];
}

function scoreColor(percentage: number) {
    if (percentage >= 80) return 'text-green-700 bg-green-50 dark:text-green-300 dark:bg-green-900/40';
    if (percentage >= 60) return 'text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-900/40';
    if (percentage >= 40) return 'text-yellow-700 bg-yellow-50 dark:text-yellow-300 dark:bg-yellow-900/40';
    return 'text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-900/40';
}

export default async function QuizResultsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const quiz = await getQuizDetail(id);
    if (!quiz) notFound();

    const attempts = await getQuizAttempts(id);
    const scored = attempts.filter(
        (a): a is QuizAttemptRow & { percentage: number } => a.percentage !== null
    );
    const inProgress = attempts.length - scored.length;

    const percentages = scored.map((a) => Number(a.percentage));
    const average = percentages.length
        ? Math.round(percentages.reduce((sum, p) => sum + p, 0) / percentages.length)
        : 0;
    const highest = percentages.length ? Math.max(...percentages) : 0;
    const lowest = percentages.length ? Math.min(...percentages) : 0;
    const maxBucketCount = Math.max(
        1,
        ...BUCKETS.map((b) => percentages.filter((p) => p >= b.min && p < b.max).length)
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">{quiz.title}</h1>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                        Results · {quiz.questions.length} question{quiz.questions.length === 1 ? '' : 's'} · {quiz.totalMarks} marks
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Link href={`/quiz/${quiz.id}`} className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                        Quiz setup
                    </Link>
                    <Link href="/quiz" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">← All quizzes</Link>
                </div>
            </div>

            {attempts.length === 0 ? (
                <Card>
                    <CardContent className="py-14 text-center space-y-2">
                        <p className="font-medium">No attempts recorded for this quiz.</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
                            Scores appear here once students submit the quiz. Student-facing quiz taking is not
                            part of this release, so attempts can only arrive from an external submission today.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Attempts</div><div className="text-2xl font-bold">{attempts.length}</div></CardContent></Card>
                        <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Average</div><div className="text-2xl font-bold text-blue-600">{average}%</div></CardContent></Card>
                        <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Median</div><div className="text-2xl font-bold">{median(percentages)}%</div></CardContent></Card>
                        <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Highest</div><div className="text-2xl font-bold text-green-600">{highest}%</div></CardContent></Card>
                        <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Lowest</div><div className="text-2xl font-bold text-red-600">{lowest}%</div></CardContent></Card>
                    </div>

                    {inProgress > 0 && (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {inProgress} attempt{inProgress === 1 ? ' is' : 's are'} still unscored and excluded from the figures above.
                        </p>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle>Score distribution</CardTitle>
                            <CardDescription>Scored attempts grouped by percentage.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-end gap-2 h-40">
                                {BUCKETS.map((bucket) => {
                                    const count = percentages.filter((p) => p >= bucket.min && p < bucket.max).length;
                                    return (
                                        <div key={bucket.label} className="flex-1 flex flex-col items-center justify-end h-full">
                                            <span className="text-sm font-medium">{count}</span>
                                            <div
                                                className={`w-full ${bucket.color} rounded-t`}
                                                style={{ height: `${Math.round((count / maxBucketCount) * 100)}%`, minHeight: count > 0 ? '8px' : '2px' }}
                                            />
                                            <span className="text-xs mt-2 text-gray-500">{bucket.label}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Student results</CardTitle>
                            <CardDescription>Ranked by percentage.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0 overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 dark:bg-gray-900 border-b dark:border-gray-800">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rank</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Score</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Percentage</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Submitted</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y dark:divide-gray-800">
                                    {attempts.map((attempt, index) => (
                                        <tr key={attempt.id} className="hover:bg-gray-50 dark:hover:bg-gray-900">
                                            <td className="px-4 py-3 text-sm">
                                                {attempt.percentage === null ? '—' : index + 1}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="font-medium">{attempt.studentName ?? 'Unknown student'}</div>
                                                {attempt.admissionNumber && (
                                                    <div className="text-xs text-gray-500">{attempt.admissionNumber}</div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {attempt.score === null ? '—' : `${attempt.score}/${attempt.totalMarks ?? quiz.totalMarks}`}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {attempt.percentage === null ? (
                                                    <span className="text-gray-400">—</span>
                                                ) : (
                                                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${scoreColor(attempt.percentage)}`}>
                                                        {attempt.percentage}%
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge variant="outline">{attempt.status.replace('_', ' ')}</Badge>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-500">
                                                {attempt.submittedAt
                                                    ? new Date(attempt.submittedAt).toLocaleString('en-IN')
                                                    : 'Not submitted'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Question-wise accuracy</CardTitle>
                            <CardDescription>
                                Based on the answers stored with each scored attempt.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {quiz.questions.map((q, i) => {
                                const correctCount = scored.filter((a) =>
                                    isAnswerCorrect(q, (a.answers ?? {})[q.id])
                                ).length;
                                const accuracy = scored.length
                                    ? Math.round((correctCount / scored.length) * 100)
                                    : 0;

                                return (
                                    <div key={q.id} className="flex flex-wrap items-center gap-4 p-3 border dark:border-gray-800 rounded-lg">
                                        <Badge variant="outline">Q{i + 1}</Badge>
                                        <div className="flex-1 min-w-[12rem]">
                                            <p className="font-medium truncate">{q.text}</p>
                                            <p className="text-xs text-gray-500">
                                                {q.type.replace('_', ' ')} · {q.marks} mark{q.marks === 1 ? '' : 's'}
                                                {q.negativeMarks > 0 ? ` · −${q.negativeMarks}` : ''}
                                                {q.section ? ` · ${q.section}` : ''}
                                            </p>
                                        </div>
                                        <div className="w-32">
                                            <div className="flex justify-between text-xs mb-1">
                                                <span>Accuracy</span><span>{accuracy}%</span>
                                            </div>
                                            <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full ${accuracy >= 70 ? 'bg-green-500' : accuracy >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                                    style={{ width: `${accuracy}%` }}
                                                />
                                            </div>
                                        </div>
                                        <span className="text-sm text-gray-500">{correctCount}/{scored.length} correct</span>
                                    </div>
                                );
                            })}
                            {quiz.questions.length === 0 && (
                                <p className="text-center py-6 text-gray-400">This quiz has no questions.</p>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}
