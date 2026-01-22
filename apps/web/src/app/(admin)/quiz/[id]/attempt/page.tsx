'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { QuizService, QuizQuestion } from '@/lib/services/quiz/quiz.service';

export default function QuizAttemptPage() {
    const params = useParams();
    const router = useRouter();
    const quiz = QuizService.getQuizById(params.id as string);

    const [currentQuestion, setCurrentQuestion] = useState(0);
    const [answers, setAnswers] = useState<Record<string, string | number>>({});
    const [timeLeft, setTimeLeft] = useState((quiz?.duration || 30) * 60);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [score, setScore] = useState(0);

    // Timer
    useEffect(() => {
        if (submitted) return;
        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    handleSubmit();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [submitted]);

    if (!quiz) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Card className="p-8 text-center">
                    <h2 className="text-xl font-semibold mb-2">Quiz Not Found</h2>
                    <p className="text-muted-foreground mb-4">The quiz you're looking for doesn't exist.</p>
                    <Button onClick={() => router.push('/quiz')}>Back to Quizzes</Button>
                </Card>
            </div>
        );
    }

    const question = quiz.questions[currentQuestion];
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handleAnswer = (answer: string | number) => {
        setAnswers({ ...answers, [question.id]: answer });
    };

    const handleSubmit = () => {
        setIsSubmitting(true);
        const calculatedScore = QuizService.calculateScore(quiz, answers);
        setScore(calculatedScore);
        setTimeout(() => {
            setIsSubmitting(false);
            setSubmitted(true);
        }, 1500);
    };

    if (submitted) {
        const percentage = Math.round((score / quiz.totalMarks) * 100);
        return (
            <div className="max-w-2xl mx-auto space-y-6">
                <Card className="text-center p-8">
                    <div className="text-6xl mb-4">
                        {percentage >= 80 ? '🎉' : percentage >= 60 ? '👍' : percentage >= 40 ? '📚' : '😔'}
                    </div>
                    <h1 className="text-3xl font-bold mb-2">Quiz Completed!</h1>
                    <p className="text-muted-foreground mb-6">{quiz.title}</p>
                    <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="p-4 bg-blue-50 rounded-lg">
                            <p className="text-sm text-muted-foreground">Score</p>
                            <p className="text-2xl font-bold">{score}/{quiz.totalMarks}</p>
                        </div>
                        <div className={`p-4 rounded-lg ${percentage >= 40 ? 'bg-green-50' : 'bg-red-50'}`}>
                            <p className="text-sm text-muted-foreground">Percentage</p>
                            <p className="text-2xl font-bold">{percentage}%</p>
                        </div>
                        <div className="p-4 bg-purple-50 rounded-lg">
                            <p className="text-sm text-muted-foreground">Status</p>
                            <p className="text-2xl font-bold">{percentage >= 40 ? 'Passed' : 'Failed'}</p>
                        </div>
                    </div>
                    <div className="flex justify-center gap-4">
                        <Button variant="outline" onClick={() => router.push(`/quiz/${quiz.id}/results`)}>
                            View Detailed Results
                        </Button>
                        <Button onClick={() => router.push('/quiz')}>Back to Quizzes</Button>
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-xl font-bold">{quiz.title}</h1>
                            <p className="text-sm text-muted-foreground">{quiz.subject} | {quiz.class}</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <Badge variant="outline" className="text-lg px-4 py-2">
                                ⏱️ {formatTime(timeLeft)}
                            </Badge>
                            <Badge className={timeLeft < 300 ? 'bg-red-500' : 'bg-green-500'}>
                                {Object.keys(answers).length}/{quiz.questions.length} Answered
                            </Badge>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Question Navigation */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex flex-wrap gap-2">
                        {quiz.questions.map((q, i) => (
                            <Button
                                key={q.id}
                                variant={i === currentQuestion ? 'default' : answers[q.id] !== undefined ? 'outline' : 'ghost'}
                                size="sm"
                                className={`w-10 h-10 ${answers[q.id] !== undefined ? 'border-green-500' : ''}`}
                                onClick={() => setCurrentQuestion(i)}
                            >
                                {i + 1}
                            </Button>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Question */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <Badge variant="outline">Question {currentQuestion + 1} of {quiz.questions.length}</Badge>
                        <Badge>{question.marks} marks</Badge>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    <h2 className="text-xl font-medium">{question.text}</h2>

                    {/* Answer Options */}
                    <div className="space-y-3">
                        {question.type === 'short_answer' ? (
                            <input
                                type="text"
                                className="w-full p-3 border rounded-lg"
                                placeholder="Type your answer here..."
                                value={(answers[question.id] as string) || ''}
                                onChange={(e) => handleAnswer(e.target.value)}
                            />
                        ) : (
                            question.options?.map((option, i) => (
                                <button
                                    key={i}
                                    className={`w-full p-4 text-left rounded-lg border-2 transition-all ${answers[question.id] === i
                                            ? 'border-blue-500 bg-blue-50'
                                            : 'border-gray-200 hover:border-gray-300'
                                        }`}
                                    onClick={() => handleAnswer(i)}
                                >
                                    <span className="font-medium mr-3">
                                        {String.fromCharCode(65 + i)}.
                                    </span>
                                    {option}
                                </button>
                            ))
                        )}
                    </div>

                    {/* Navigation */}
                    <div className="flex justify-between pt-4">
                        <Button
                            variant="outline"
                            disabled={currentQuestion === 0}
                            onClick={() => setCurrentQuestion((c) => c - 1)}
                        >
                            ← Previous
                        </Button>
                        {currentQuestion === quiz.questions.length - 1 ? (
                            <Button
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                className="bg-green-600 hover:bg-green-700"
                            >
                                {isSubmitting ? 'Submitting...' : 'Submit Quiz'}
                            </Button>
                        ) : (
                            <Button onClick={() => setCurrentQuestion((c) => c + 1)}>
                                Next →
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
