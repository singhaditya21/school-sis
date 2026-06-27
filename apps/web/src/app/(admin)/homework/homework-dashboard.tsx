'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { createAssignment } from '@/lib/actions/homework';

interface Assignment {
    id: string;
    tenantId: string;
    title: string;
    description: string | null;
    subjectId: string | null;
    gradeId: string | null;
    sectionId: string | null;
    dueDate: string;
    assignedBy: string;
    maxMarks: number | null;
    createdAt: string;
    updatedAt: string;
}

interface HomeworkStats {
    totalAssignments: number;
    totalSubmissions: number;
    gradedSubmissions: number;
    pendingGrading: number;
}

interface HomeworkDashboardClientProps {
    assignments: Assignment[];
    stats: HomeworkStats;
}

function getAssignmentStatus(dueDate: string): string {
    const now = new Date();
    const due = new Date(dueDate);
    if (due > now) return 'Active';
    return 'Past Due';
}

function getStatusBadgeClass(status: string): string {
    switch (status) {
        case 'Active':
            return 'bg-green-100 text-green-700 hover:bg-green-100';
        case 'Past Due':
            return 'bg-orange-100 text-orange-700 hover:bg-orange-100';
        default:
            return 'bg-gray-100 text-gray-700 hover:bg-gray-100';
    }
}

export default function HomeworkDashboardClient({ assignments, stats }: HomeworkDashboardClientProps) {
    const [view, setView] = useState<'list' | 'create'>('list');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const router = useRouter();

    async function handleCreateAssignment(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setIsSubmitting(true);

        const formData = new FormData(e.currentTarget);
        const title = formData.get('title') as string;
        const description = formData.get('description') as string;
        const gradeId = formData.get('gradeId') as string;
        const subjectId = formData.get('subjectId') as string;
        const dueDate = formData.get('dueDate') as string;
        const maxMarksStr = formData.get('maxMarks') as string;
        const maxMarks = maxMarksStr ? Number(maxMarksStr) : undefined;

        try {
            await createAssignment({
                title,
                description: description || undefined,
                gradeId: gradeId || undefined,
                subjectId: subjectId || undefined,
                dueDate,
                maxMarks,
            });
            setView('list');
            router.refresh();
        } catch (error) {
            console.error('Failed to create assignment:', error);
        } finally {
            setIsSubmitting(false);
        }
    }

    const submissionRate = stats.totalAssignments > 0
        ? Math.round((stats.totalSubmissions / stats.totalAssignments) * 100)
        : 0;

    return (
        <div className="space-y-8 max-w-7xl mx-auto pb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">Homework &amp; Assignments</h1>
                    <p className="text-gray-500 mt-1">Manage class assignments, collect homework, and enter grades.</p>
                </div>
                {view === 'list' ? (
                    <Button onClick={() => setView('create')} className="bg-blue-600 hover:bg-blue-700">
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        Create Assignment
                    </Button>
                ) : (
                    <Button variant="outline" onClick={() => setView('list')}>Cancel</Button>
                )}
            </div>

            {view === 'list' && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <Card className="shadow-sm border-blue-100 bg-blue-50/30">
                            <CardContent className="p-6">
                                <div className="text-sm font-medium text-blue-600 mb-1">Active Assignments</div>
                                <div className="text-3xl font-bold text-gray-900">{stats.totalAssignments}</div>
                            </CardContent>
                        </Card>
                        <Card className="shadow-sm border-orange-100 bg-orange-50/30">
                            <CardContent className="p-6">
                                <div className="text-sm font-medium text-orange-600 mb-1">Pending Grading</div>
                                <div className="text-3xl font-bold text-gray-900">{stats.pendingGrading}</div>
                            </CardContent>
                        </Card>
                        <Card className="shadow-sm border-green-100 bg-green-50/30">
                            <CardContent className="p-6">
                                <div className="text-sm font-medium text-green-600 mb-1">Total Submissions</div>
                                <div className="text-3xl font-bold text-gray-900">{stats.totalSubmissions}</div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase font-semibold">
                                    <tr>
                                        <th className="px-6 py-4">Assignment</th>
                                        <th className="px-6 py-4">Due Date</th>
                                        <th className="px-6 py-4">Status</th>
                                        <th className="px-6 py-4">Max Marks</th>
                                        <th className="px-6 py-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {assignments.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                                <div className="flex flex-col items-center gap-2">
                                                    <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                    <p className="font-medium">No assignments yet</p>
                                                    <p className="text-sm">Create your first assignment to get started.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        assignments.map((assignment) => {
                                            const status = getAssignmentStatus(assignment.dueDate);
                                            return (
                                                <tr key={assignment.id} className="hover:bg-gray-50/80 transition-colors group">
                                                    <td className="px-6 py-4">
                                                        <div className="font-semibold text-gray-900">{assignment.title}</div>
                                                        {assignment.description && (
                                                            <div className="text-gray-500 mt-0.5 truncate max-w-xs">{assignment.description}</div>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="text-gray-900">{new Date(assignment.dueDate).toLocaleDateString()}</div>
                                                        <div className="text-xs text-gray-500">{new Date(assignment.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <Badge
                                                            variant="secondary"
                                                            className={getStatusBadgeClass(status)}
                                                        >
                                                            {status}
                                                        </Badge>
                                                    </td>
                                                    <td className="px-6 py-4 text-gray-700">
                                                        {assignment.maxMarks ?? '—'}
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50">View Submissions</Button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </>
            )}

            {view === 'create' && (
                <Card className="max-w-2xl shadow-sm border-gray-200">
                    <CardHeader className="border-b bg-gray-50/50 pb-6">
                        <CardTitle>Create New Assignment</CardTitle>
                        <CardDescription>Fill in the details below to assign homework to your class.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <form className="space-y-6" onSubmit={handleCreateAssignment}>
                            <div className="space-y-2">
                                <Label htmlFor="title">Assignment Title</Label>
                                <Input id="title" name="title" placeholder="e.g., Chapter 5 Reading & Questions" autoFocus required />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Class / Grade</Label>
                                    <select name="gradeId" className="w-full h-10 px-3 py-2 bg-white border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                                        <option value="">Select Class...</option>
                                        <option value="1">Grade 10 - Section A</option>
                                        <option value="2">Grade 12 - Science</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Subject</Label>
                                    <select name="subjectId" className="w-full h-10 px-3 py-2 bg-white border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                                        <option value="">Select Subject...</option>
                                        <option value="math">Mathematics</option>
                                        <option value="physics">Physics</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">Instructions / Description</Label>
                                <Textarea id="description" name="description" placeholder="Write detailed instructions for the students..." className="h-32 resize-none" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="dueDate">Due Date &amp; Time</Label>
                                    <Input id="dueDate" name="dueDate" type="datetime-local" required />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="maxMarks">Maximum Marks (Optional)</Label>
                                    <Input id="maxMarks" name="maxMarks" type="number" placeholder="50" min="0" />
                                </div>
                            </div>

                            <div className="space-y-2 pt-2">
                                <Label>Attachments (Optional)</Label>
                                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:bg-gray-50 hover:border-blue-400 transition-colors cursor-pointer">
                                    <svg className="w-8 h-8 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                    <div className="text-sm font-medium text-gray-700">Click to upload or drag and drop</div>
                                    <div className="text-xs text-gray-500 mt-1">PDF, DOCX, or Images (Max 10MB)</div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-6 border-t">
                                <Button type="button" variant="outline" onClick={() => setView('list')}>Cancel</Button>
                                <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700">
                                    {isSubmitting ? 'Creating...' : 'Assign to Class'}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
