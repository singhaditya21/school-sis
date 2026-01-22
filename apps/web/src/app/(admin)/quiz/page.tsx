'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { QuizService, Quiz } from '@/lib/services/quiz/quiz.service';
import Link from 'next/link';

export default function QuizPage() {
    const [subjectFilter, setSubjectFilter] = useState('');
    const [classFilter, setClassFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [showCreateDialog, setShowCreateDialog] = useState(false);

    const stats = QuizService.getQuizStats();
    const quizzes = QuizService.getQuizzes({
        subject: subjectFilter || undefined,
        class: classFilter || undefined,
        status: statusFilter || undefined,
    });
    const subjects = QuizService.getSubjects();
    const classes = QuizService.getClasses();

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'published':
                return 'bg-green-100 text-green-800';
            case 'draft':
                return 'bg-yellow-100 text-yellow-800';
            case 'closed':
                return 'bg-gray-100 text-gray-800';
            default:
                return 'bg-blue-100 text-blue-800';
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Online Quiz & Assessment</h1>
                    <p className="text-muted-foreground">Create, manage, and analyze quizzes</p>
                </div>
                <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                    <DialogTrigger asChild>
                        <Button>+ Create Quiz</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>Create New Quiz</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium">Quiz Title</label>
                                    <Input placeholder="e.g., Chapter 5 Weekly Test" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium">Subject</label>
                                    <select className="w-full p-2 border rounded-md">
                                        <option value="">Select Subject</option>
                                        {subjects.map((s) => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm font-medium">Class</label>
                                    <select className="w-full p-2 border rounded-md">
                                        <option value="">Select Class</option>
                                        {classes.map((c) => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm font-medium">Duration (minutes)</label>
                                    <Input type="number" placeholder="30" />
                                </div>
                            </div>
                            <div className="border-t pt-4">
                                <h4 className="font-medium mb-2">Add Questions</h4>
                                <div className="space-y-3">
                                    <div className="p-3 border rounded-lg bg-gray-50">
                                        <div className="flex gap-2 mb-2">
                                            <Input placeholder="Enter question text" className="flex-1" />
                                            <select className="p-2 border rounded-md">
                                                <option value="mcq">Multiple Choice</option>
                                                <option value="true_false">True/False</option>
                                                <option value="short_answer">Short Answer</option>
                                            </select>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Input placeholder="Option A" />
                                            <Input placeholder="Option B" />
                                            <Input placeholder="Option C" />
                                            <Input placeholder="Option D" />
                                        </div>
                                    </div>
                                    <Button variant="outline" className="w-full">+ Add Question</Button>
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-4">
                                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
                                <Button variant="outline">Save as Draft</Button>
                                <Button>Publish Quiz</Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Total Quizzes</CardDescription>
                        <CardTitle className="text-3xl">{stats.total}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Published</CardDescription>
                        <CardTitle className="text-3xl text-green-600">{stats.published}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Drafts</CardDescription>
                        <CardTitle className="text-3xl text-yellow-600">{stats.draft}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Closed</CardDescription>
                        <CardTitle className="text-3xl text-gray-600">{stats.closed}</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle>Filters</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-4">
                        <select
                            className="p-2 border rounded-md"
                            value={subjectFilter}
                            onChange={(e) => setSubjectFilter(e.target.value)}
                        >
                            <option value="">All Subjects</option>
                            {subjects.map((s) => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                        <select
                            className="p-2 border rounded-md"
                            value={classFilter}
                            onChange={(e) => setClassFilter(e.target.value)}
                        >
                            <option value="">All Classes</option>
                            {classes.map((c) => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                        <select
                            className="p-2 border rounded-md"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <option value="">All Status</option>
                            <option value="published">Published</option>
                            <option value="draft">Draft</option>
                            <option value="closed">Closed</option>
                        </select>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setSubjectFilter('');
                                setClassFilter('');
                                setStatusFilter('');
                            }}
                        >
                            Clear Filters
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Quiz List */}
            <div className="grid gap-4">
                {quizzes.map((quiz) => (
                    <Card key={quiz.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-6">
                            <div className="flex items-start justify-between">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-3">
                                        <h3 className="text-xl font-semibold">{quiz.title}</h3>
                                        <Badge className={getStatusColor(quiz.status)}>{quiz.status}</Badge>
                                    </div>
                                    <div className="flex gap-4 text-sm text-muted-foreground">
                                        <span>📚 {quiz.subject}</span>
                                        <span>🎓 {quiz.class}{quiz.section ? ` - ${quiz.section}` : ''}</span>
                                        <span>⏱️ {quiz.duration} mins</span>
                                        <span>📝 {quiz.questions.length} questions</span>
                                        <span>🏆 {quiz.totalMarks} marks</span>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        Created by {quiz.createdBy} on {quiz.createdAt}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    {quiz.status === 'published' && (
                                        <Link href={`/quiz/${quiz.id}/attempt`}>
                                            <Button variant="outline">Take Quiz</Button>
                                        </Link>
                                    )}
                                    <Link href={`/quiz/${quiz.id}/results`}>
                                        <Button variant="outline">View Results</Button>
                                    </Link>
                                    {quiz.status === 'draft' && (
                                        <Button>Publish</Button>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
