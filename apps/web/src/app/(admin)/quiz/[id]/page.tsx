import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getQuizDetail } from '../queries';
import { addQuestionAction, deleteQuestionAction, deleteQuizAction, setQuizStatusAction } from '../actions';

const STATUS_STYLES: Record<string, string> = {
    DRAFT: 'bg-muted text-foreground dark:bg-gray-800 dark:text-gray-300',
    PUBLISHED: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    CLOSED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const TYPE_LABELS: Record<string, string> = {
    MCQ: 'Multiple choice',
    TRUE_FALSE: 'True / false',
    SHORT_ANSWER: 'Short answer',
};

const inputClass =
    'w-full px-3 py-2 border border-border dark:border-gray-700 rounded-lg bg-card text-sm focus:ring-2 focus:ring-ring';
const labelClass = 'block text-sm font-medium text-foreground dark:text-gray-300 mb-1';

function formatWindow(value: Date | string | null) {
    if (!value) return null;
    return new Date(value).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default async function QuizDetailPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ error?: string }>;
}) {
    const { id } = await params;
    const { error } = await searchParams;

    const quiz = await getQuizDetail(id);
    if (!quiz) notFound();

    const locked = quiz.attemptCount > 0;
    const opensAt = formatWindow(quiz.startTime);
    const closesAt = formatWindow(quiz.endTime);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold">{quiz.title}</h1>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[quiz.status] ?? 'bg-muted'}`}>
                            {quiz.status}
                        </span>
                    </div>
                    <p className="text-muted-foreground dark:text-muted-foreground mt-1 text-sm">
                        {quiz.questions.length} question{quiz.questions.length === 1 ? '' : 's'} · {quiz.totalMarks} marks · {quiz.duration} min
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Link href={`/quiz/${quiz.id}/results`} className="px-3 py-2 text-sm rounded-lg border border-border dark:border-gray-700 hover:bg-muted dark:hover:bg-gray-800">
                        Results
                    </Link>
                    <Link href="/quiz" className="text-primary hover:underline text-sm">← All quizzes</Link>
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                    {error}
                </div>
            )}

            <div className="grid gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Details</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <div className="text-muted-foreground">Subject</div>
                            <div className="font-medium">{quiz.subjectName ?? '—'}</div>
                        </div>
                        <div>
                            <div className="text-muted-foreground">Class</div>
                            <div className="font-medium">
                                {quiz.gradeName
                                    ? `${quiz.gradeName}${quiz.sectionName ? `-${quiz.sectionName}` : ''}`
                                    : 'Not restricted'}
                            </div>
                        </div>
                        <div>
                            <div className="text-muted-foreground">Opens at</div>
                            <div className="font-medium">{opensAt ?? 'Not scheduled'}</div>
                        </div>
                        <div>
                            <div className="text-muted-foreground">Closes at</div>
                            <div className="font-medium">{closesAt ?? 'Not scheduled'}</div>
                        </div>
                        <div>
                            <div className="text-muted-foreground">Created by</div>
                            <div className="font-medium">{quiz.createdByName ?? '—'}</div>
                        </div>
                        <div>
                            <div className="text-muted-foreground">Attempts recorded</div>
                            <div className="font-medium">{quiz.attemptCount}</div>
                        </div>
                        <div className="col-span-2">
                            <div className="text-muted-foreground">Instructions</div>
                            <div className="font-medium whitespace-pre-wrap">
                                {quiz.instructions ?? 'None'}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Status</CardTitle>
                        <CardDescription>Only published quizzes are visible to students.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {quiz.status !== 'PUBLISHED' && (
                            <form action={setQuizStatusAction}>
                                <input type="hidden" name="quizId" value={quiz.id} />
                                <input type="hidden" name="status" value="PUBLISHED" />
                                <button type="submit" className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
                                    {quiz.status === 'CLOSED' ? 'Re-open (publish)' : 'Publish'}
                                </button>
                            </form>
                        )}
                        {quiz.status === 'PUBLISHED' && (
                            <form action={setQuizStatusAction}>
                                <input type="hidden" name="quizId" value={quiz.id} />
                                <input type="hidden" name="status" value="CLOSED" />
                                <button type="submit" className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium">
                                    Close quiz
                                </button>
                            </form>
                        )}
                        {quiz.status !== 'DRAFT' && !locked && (
                            <form action={setQuizStatusAction}>
                                <input type="hidden" name="quizId" value={quiz.id} />
                                <input type="hidden" name="status" value="DRAFT" />
                                <button type="submit" className="w-full px-4 py-2 rounded-lg border border-border dark:border-gray-700 hover:bg-muted dark:hover:bg-gray-800 text-sm font-medium">
                                    Return to draft
                                </button>
                            </form>
                        )}
                        {!locked && (
                            <form action={deleteQuizAction}>
                                <input type="hidden" name="quizId" value={quiz.id} />
                                <button type="submit" className="w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:underline">
                                    Delete quiz
                                </button>
                            </form>
                        )}
                        {locked && (
                            <p className="text-xs text-muted-foreground dark:text-muted-foreground">
                                This quiz has recorded attempts, so it can no longer be edited or deleted.
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Questions</CardTitle>
                    <CardDescription>
                        {quiz.questions.length === 0
                            ? 'No questions yet — add the first one below.'
                            : `${quiz.questions.length} question${quiz.questions.length === 1 ? '' : 's'} worth ${quiz.questionMarksTotal} marks in total.`}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {quiz.questions.map((q, i) => (
                        <div key={q.id} className="border dark:border-gray-800 rounded-lg p-4">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                        <Badge variant="outline">Q{i + 1}</Badge>
                                        <Badge variant="outline">{TYPE_LABELS[q.type] ?? q.type}</Badge>
                                        <span className="text-xs text-muted-foreground">
                                            {q.marks} mark{q.marks === 1 ? '' : 's'}
                                            {q.negativeMarks > 0 ? ` · −${q.negativeMarks} if wrong` : ''}
                                            {q.section ? ` · ${q.section}` : ''}
                                        </span>
                                    </div>
                                    <p className="font-medium whitespace-pre-wrap">{q.text}</p>
                                    {q.options.length > 0 ? (
                                        <ul className="mt-2 space-y-1 text-sm">
                                            {q.options.map((option, oi) => {
                                                const isCorrect = option === q.correctAnswer;
                                                return (
                                                    <li
                                                        key={`${q.id}-${oi}`}
                                                        className={isCorrect
                                                            ? 'text-green-700 dark:text-green-400 font-medium'
                                                            : 'text-muted-foreground dark:text-muted-foreground'}
                                                    >
                                                        {String.fromCharCode(65 + oi)}. {option}
                                                        {isCorrect ? ' ✓' : ''}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    ) : (
                                        <p className="mt-2 text-sm text-muted-foreground dark:text-muted-foreground">
                                            Expected answer: <span className="font-medium text-green-700 dark:text-green-400">{q.correctAnswer}</span>
                                        </p>
                                    )}
                                </div>
                                {!locked && (
                                    <form action={deleteQuestionAction}>
                                        <input type="hidden" name="quizId" value={quiz.id} />
                                        <input type="hidden" name="questionId" value={q.id} />
                                        <button type="submit" className="text-xs text-red-600 dark:text-red-400 hover:underline">
                                            Remove
                                        </button>
                                    </form>
                                )}
                            </div>
                        </div>
                    ))}

                    {quiz.questions.length === 0 && (
                        <p className="text-center py-8 text-muted-foreground">This quiz has no questions yet.</p>
                    )}
                </CardContent>
            </Card>

            {locked ? (
                <Card>
                    <CardContent className="py-8 text-center text-sm text-muted-foreground dark:text-muted-foreground">
                        Questions are locked because {quiz.attemptCount} attempt{quiz.attemptCount === 1 ? ' has' : 's have'} already been recorded.
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle>Add a question</CardTitle>
                        <CardDescription>Questions are appended in the order you add them.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form action={addQuestionAction} className="space-y-4">
                            <input type="hidden" name="quizId" value={quiz.id} />

                            <div>
                                <label className={labelClass} htmlFor="text">Question *</label>
                                <textarea id="text" name="text" rows={2} required className={inputClass} />
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <label className={labelClass} htmlFor="type">Type *</label>
                                    <select id="type" name="type" required className={inputClass} defaultValue="MCQ">
                                        <option value="MCQ">Multiple choice</option>
                                        <option value="TRUE_FALSE">True / false</option>
                                        <option value="SHORT_ANSWER">Short answer</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClass} htmlFor="marks">Marks *</label>
                                    <input id="marks" name="marks" type="number" min={1} required defaultValue={1} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass} htmlFor="negativeMarks">Negative marks</label>
                                    <input id="negativeMarks" name="negativeMarks" type="number" min={0} defaultValue={0} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass} htmlFor="section">Section label</label>
                                    <input id="section" name="section" type="text" placeholder="Optional" className={inputClass} />
                                </div>
                            </div>

                            <div>
                                <label className={labelClass} htmlFor="options">Options — multiple choice only, one per line</label>
                                <textarea id="options" name="options" rows={4} placeholder={'Paris\nLondon\nRome'} className={inputClass} />
                            </div>

                            <div>
                                <label className={labelClass} htmlFor="correctAnswer">Correct answer *</label>
                                <input id="correctAnswer" name="correctAnswer" type="text" required className={inputClass} />
                                <p className="text-xs text-muted-foreground dark:text-muted-foreground mt-1">
                                    Multiple choice: type the correct option exactly as written above. True / false: type True or False.
                                    Short answer: type the expected answer — it is matched case-insensitively when scoring.
                                </p>
                            </div>

                            <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium">
                                Add question
                            </button>
                        </form>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
