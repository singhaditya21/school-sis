'use client';

import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { QuizService } from '@/lib/services/quiz/quiz.service';

export default function QuizResultsPage() {
    const params = useParams();
    const router = useRouter();
    const quiz = QuizService.getQuizById(params.id as string);
    const attempts = QuizService.getQuizAttempts(params.id as string);
    const analytics = QuizService.getQuizAnalytics(params.id as string);

    if (!quiz) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Card className="p-8 text-center">
                    <h2 className="text-xl font-semibold mb-2">Quiz Not Found</h2>
                    <Button onClick={() => router.push('/quiz')}>Back to Quizzes</Button>
                </Card>
            </div>
        );
    }

    const getScoreColor = (percentage: number) => {
        if (percentage >= 80) return 'text-green-600 bg-green-50';
        if (percentage >= 60) return 'text-blue-600 bg-blue-50';
        if (percentage >= 40) return 'text-yellow-600 bg-yellow-50';
        return 'text-red-600 bg-red-50';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{quiz.title}</h1>
                    <p className="text-muted-foreground">
                        {quiz.subject} | {quiz.class} | {quiz.questions.length} Questions | {quiz.totalMarks} Marks
                    </p>
                </div>
                <Button variant="outline" onClick={() => router.push('/quiz')}>
                    ← Back to Quizzes
                </Button>
            </div>

            {/* Analytics Cards */}
            {analytics && (
                <div className="grid grid-cols-6 gap-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Total Attempts</CardDescription>
                            <CardTitle className="text-3xl">{analytics.totalAttempts}</CardTitle>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Average Score</CardDescription>
                            <CardTitle className="text-3xl text-blue-600">{analytics.averageScore}%</CardTitle>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Highest Score</CardDescription>
                            <CardTitle className="text-3xl text-green-600">{analytics.highestScore}%</CardTitle>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Lowest Score</CardDescription>
                            <CardTitle className="text-3xl text-red-600">{analytics.lowestScore}%</CardTitle>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Passed</CardDescription>
                            <CardTitle className="text-3xl text-green-600">{analytics.passed}</CardTitle>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Failed</CardDescription>
                            <CardTitle className="text-3xl text-red-600">{analytics.failed}</CardTitle>
                        </CardHeader>
                    </Card>
                </div>
            )}

            {/* Score Distribution */}
            <Card>
                <CardHeader>
                    <CardTitle>Score Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-end gap-2 h-40">
                        {[
                            { range: '0-20%', count: attempts.filter((a) => a.percentage < 20).length, color: 'bg-red-500' },
                            { range: '20-40%', count: attempts.filter((a) => a.percentage >= 20 && a.percentage < 40).length, color: 'bg-orange-500' },
                            { range: '40-60%', count: attempts.filter((a) => a.percentage >= 40 && a.percentage < 60).length, color: 'bg-yellow-500' },
                            { range: '60-80%', count: attempts.filter((a) => a.percentage >= 60 && a.percentage < 80).length, color: 'bg-blue-500' },
                            { range: '80-100%', count: attempts.filter((a) => a.percentage >= 80).length, color: 'bg-green-500' },
                        ].map((bucket) => (
                            <div key={bucket.range} className="flex-1 flex flex-col items-center">
                                <div
                                    className={`w-full ${bucket.color} rounded-t transition-all`}
                                    style={{ height: `${Math.max(bucket.count * 40, 8)}px` }}
                                />
                                <span className="text-xs mt-2 text-muted-foreground">{bucket.range}</span>
                                <span className="text-sm font-medium">{bucket.count}</span>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Student Results Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Student Results</CardTitle>
                    <CardDescription>Individual performance breakdown</CardDescription>
                </CardHeader>
                <CardContent>
                    {attempts.length === 0 ? (
                        <p className="text-center py-8 text-muted-foreground">No attempts yet</p>
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr className="border-b">
                                    <th className="text-left py-3 px-4">Rank</th>
                                    <th className="text-left py-3 px-4">Student</th>
                                    <th className="text-left py-3 px-4">Student ID</th>
                                    <th className="text-left py-3 px-4">Score</th>
                                    <th className="text-left py-3 px-4">Percentage</th>
                                    <th className="text-left py-3 px-4">Status</th>
                                    <th className="text-left py-3 px-4">Submitted At</th>
                                </tr>
                            </thead>
                            <tbody>
                                {attempts
                                    .sort((a, b) => b.percentage - a.percentage)
                                    .map((attempt, index) => (
                                        <tr key={attempt.id} className="border-b hover:bg-gray-50">
                                            <td className="py-3 px-4">
                                                {index === 0 && '🥇'}
                                                {index === 1 && '🥈'}
                                                {index === 2 && '🥉'}
                                                {index > 2 && index + 1}
                                            </td>
                                            <td className="py-3 px-4 font-medium">{attempt.studentName}</td>
                                            <td className="py-3 px-4 text-muted-foreground">{attempt.studentId}</td>
                                            <td className="py-3 px-4">
                                                {attempt.score}/{attempt.totalMarks}
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getScoreColor(attempt.percentage)}`}>
                                                    {attempt.percentage}%
                                                </span>
                                            </td>
                                            <td className="py-3 px-4">
                                                <Badge className={attempt.percentage >= 40 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                                                    {attempt.percentage >= 40 ? 'Passed' : 'Failed'}
                                                </Badge>
                                            </td>
                                            <td className="py-3 px-4 text-muted-foreground">
                                                {attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString() : '-'}
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    )}
                </CardContent>
            </Card>

            {/* Question Analysis */}
            <Card>
                <CardHeader>
                    <CardTitle>Question-wise Analysis</CardTitle>
                    <CardDescription>Performance breakdown by question</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {quiz.questions.map((q, i) => {
                            const correctCount = attempts.filter((a) => {
                                const ans = a.answers[q.id];
                                if (q.type === 'short_answer') {
                                    return String(ans).toLowerCase().trim() === String(q.correctAnswer).toLowerCase();
                                }
                                return ans === q.correctAnswer;
                            }).length;
                            const accuracy = attempts.length > 0 ? Math.round((correctCount / attempts.length) * 100) : 0;

                            return (
                                <div key={q.id} className="flex items-center gap-4 p-3 border rounded-lg">
                                    <Badge variant="outline">Q{i + 1}</Badge>
                                    <div className="flex-1">
                                        <p className="font-medium truncate">{q.text}</p>
                                        <p className="text-sm text-muted-foreground">
                                            {q.type.replace('_', ' ').toUpperCase()} | {q.marks} marks
                                        </p>
                                    </div>
                                    <div className="w-32">
                                        <div className="flex justify-between text-sm mb-1">
                                            <span>Accuracy</span>
                                            <span>{accuracy}%</span>
                                        </div>
                                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${accuracy >= 70 ? 'bg-green-500' : accuracy >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                                style={{ width: `${accuracy}%` }}
                                            />
                                        </div>
                                    </div>
                                    <span className="text-sm text-muted-foreground">
                                        {correctCount}/{attempts.length} correct
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
