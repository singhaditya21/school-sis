'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface LessonPlan {
    id: string;
    subject: string;
    class: string;
    section: string;
    chapter: string;
    topic: string;
    duration: string;
    objectives: string[];
    activities: string[];
    resources: string[];
    assessment: string;
    teacherName: string;
    plannedDate: string;
    status: 'DRAFT' | 'APPROVED' | 'COMPLETED';
}

const mockLessonPlans: LessonPlan[] = [
    { id: 'lp1', subject: 'Mathematics', class: '10', section: 'A', chapter: 'Chapter 5 - Quadratic Equations', topic: 'Introduction to Quadratic Equations', duration: '2 periods (80 min)', objectives: ['Define quadratic equations', 'Identify standard form ax² + bx + c = 0', 'Solve using factorization'], activities: ['Concept explanation with examples', 'Practice problems on board', 'Group activity'], resources: ['NCERT Textbook', 'Graph paper', 'Calculator'], assessment: 'Quick quiz at end of class', teacherName: 'Rajesh Kumar', plannedDate: '2026-01-23', status: 'APPROVED' },
    { id: 'lp2', subject: 'Physics', class: '11', section: 'B', chapter: 'Unit 3 - Laws of Motion', topic: "Newton's Third Law", duration: '1 period (40 min)', objectives: ['Explain action-reaction pairs', 'Apply to real-world scenarios'], activities: ['Video demonstration', 'Live experiments with springs'], resources: ['Physics lab equipment', 'Video projector'], assessment: 'Numerical problems', teacherName: 'Suresh Menon', plannedDate: '2026-01-24', status: 'DRAFT' },
    { id: 'lp3', subject: 'English', class: '12', section: 'A', chapter: 'Flamingo - Lost Spring', topic: 'Reading Comprehension and Analysis', duration: '2 periods (80 min)', objectives: ['Analyze author perspective', 'Discuss child labor issues', 'Vocabulary building'], activities: ['Silent reading', 'Group discussion', 'Writing exercise'], resources: ['Textbook', 'Worksheet'], assessment: 'Written response', teacherName: 'Kavita Nair', plannedDate: '2026-01-22', status: 'COMPLETED' },
    { id: 'lp4', subject: 'Chemistry', class: '12', section: 'B', chapter: 'Organic Chemistry - Aldehydes', topic: 'Preparation and Reactions', duration: '3 periods (120 min)', objectives: ['Understand aldehyde structure', 'Learn preparation methods', 'Practice reaction mechanisms'], activities: ['Lecture', 'Lab demonstration', 'Practice session'], resources: ['Lab chemicals', 'Models', 'Worksheets'], assessment: 'Lab report', teacherName: 'Dr. Anita Sharma', plannedDate: '2026-01-25', status: 'APPROVED' },
];

export default function LessonPlansPage() {
    const [lessonPlans, setLessonPlans] = useState(mockLessonPlans);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<LessonPlan | null>(null);
    const [filter, setFilter] = useState<'ALL' | 'DRAFT' | 'APPROVED' | 'COMPLETED'>('ALL');

    const filteredPlans = lessonPlans.filter(lp => filter === 'ALL' || lp.status === filter);

    const getStatusBadge = (status: LessonPlan['status']) => {
        const colors: Record<string, string> = {
            DRAFT: 'bg-gray-100 text-gray-700',
            APPROVED: 'bg-green-100 text-green-700',
            COMPLETED: 'bg-blue-100 text-blue-700',
        };
        return <Badge className={colors[status]}>{status}</Badge>;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Lesson Plans</h1>
                    <p className="text-gray-600 mt-1">Create and manage teaching lesson plans</p>
                </div>
                <button
                    onClick={() => setShowCreateDialog(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                    + Create Lesson Plan
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="cursor-pointer" onClick={() => setFilter('ALL')}>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Total Plans</div>
                        <div className="text-2xl font-bold text-blue-600">{lessonPlans.length}</div>
                    </CardContent>
                </Card>
                <Card className="cursor-pointer" onClick={() => setFilter('DRAFT')}>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Draft</div>
                        <div className="text-2xl font-bold text-gray-600">{lessonPlans.filter(lp => lp.status === 'DRAFT').length}</div>
                    </CardContent>
                </Card>
                <Card className="cursor-pointer" onClick={() => setFilter('APPROVED')}>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Approved</div>
                        <div className="text-2xl font-bold text-green-600">{lessonPlans.filter(lp => lp.status === 'APPROVED').length}</div>
                    </CardContent>
                </Card>
                <Card className="cursor-pointer" onClick={() => setFilter('COMPLETED')}>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Completed</div>
                        <div className="text-2xl font-bold text-purple-600">{lessonPlans.filter(lp => lp.status === 'COMPLETED').length}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Lesson Plans Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredPlans.map(plan => (
                    <Card
                        key={plan.id}
                        className="cursor-pointer hover:shadow-lg transition-shadow"
                        onClick={() => setSelectedPlan(plan)}
                    >
                        <CardContent className="pt-4">
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Badge className="bg-blue-100 text-blue-700">{plan.subject}</Badge>
                                    <Badge variant="outline">Class {plan.class}-{plan.section}</Badge>
                                </div>
                                {getStatusBadge(plan.status)}
                            </div>
                            <h3 className="font-semibold text-lg">{plan.topic}</h3>
                            <p className="text-sm text-gray-500 mt-1">{plan.chapter}</p>
                            <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm text-gray-500">
                                <span>👨‍🏫 {plan.teacherName}</span>
                                <span>📅 {new Date(plan.plannedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                                <span>⏱️ {plan.duration}</span>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Plan Detail Dialog */}
            <Dialog open={!!selectedPlan} onOpenChange={() => setSelectedPlan(null)}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Lesson Plan Details</DialogTitle>
                    </DialogHeader>
                    {selectedPlan && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 flex-wrap">
                                <Badge className="bg-blue-100 text-blue-700">{selectedPlan.subject}</Badge>
                                <Badge variant="outline">Class {selectedPlan.class}-{selectedPlan.section}</Badge>
                                {getStatusBadge(selectedPlan.status)}
                            </div>

                            <div>
                                <h3 className="text-xl font-bold">{selectedPlan.topic}</h3>
                                <p className="text-gray-500">{selectedPlan.chapter}</p>
                            </div>

                            <div className="grid grid-cols-3 gap-4 text-sm">
                                <div><span className="text-gray-500">Teacher:</span><br />{selectedPlan.teacherName}</div>
                                <div><span className="text-gray-500">Date:</span><br />{new Date(selectedPlan.plannedDate).toLocaleDateString('en-IN')}</div>
                                <div><span className="text-gray-500">Duration:</span><br />{selectedPlan.duration}</div>
                            </div>

                            <div className="bg-blue-50 p-4 rounded-lg">
                                <h4 className="font-semibold mb-2">🎯 Learning Objectives</h4>
                                <ul className="list-disc list-inside text-sm space-y-1">
                                    {selectedPlan.objectives.map((obj, idx) => <li key={idx}>{obj}</li>)}
                                </ul>
                            </div>

                            <div className="bg-green-50 p-4 rounded-lg">
                                <h4 className="font-semibold mb-2">📚 Activities</h4>
                                <ul className="list-disc list-inside text-sm space-y-1">
                                    {selectedPlan.activities.map((act, idx) => <li key={idx}>{act}</li>)}
                                </ul>
                            </div>

                            <div className="bg-purple-50 p-4 rounded-lg">
                                <h4 className="font-semibold mb-2">📦 Resources Required</h4>
                                <div className="flex flex-wrap gap-2">
                                    {selectedPlan.resources.map((res, idx) => <Badge key={idx} variant="outline">{res}</Badge>)}
                                </div>
                            </div>

                            <div className="bg-orange-50 p-4 rounded-lg">
                                <h4 className="font-semibold mb-2">📝 Assessment</h4>
                                <p className="text-sm">{selectedPlan.assessment}</p>
                            </div>

                            {selectedPlan.status === 'DRAFT' && (
                                <div className="flex gap-3 pt-4">
                                    <button className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                                        ✓ Approve
                                    </button>
                                    <button className="px-4 py-2 border rounded-lg hover:bg-gray-50">
                                        Edit
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Create Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Lesson Plan</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                        <p className="text-sm text-gray-500">Form fields would go here...</p>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setShowCreateDialog(false)} className="px-4 py-2 border rounded-lg">Cancel</button>
                            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg">Create</button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
