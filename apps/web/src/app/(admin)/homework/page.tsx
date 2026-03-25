'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

// Mock data since we are building the UI layer
const MOCK_ASSIGNMENTS = [
    { id: '1', title: 'Calculus Chapter 4 Exercises', subject: 'Mathematics', grade: 'Grade 12', dueDate: '2026-03-25T23:59:00Z', status: 'Active', maxMarks: 50, submissions: 24, totalStudents: 30 },
    { id: '2', title: 'World War II Essay', subject: 'History', grade: 'Grade 10', dueDate: '2026-03-20T23:59:00Z', status: 'Grading', maxMarks: 100, submissions: 28, totalStudents: 28 },
    { id: '3', title: 'Cell Biology Lab Report', subject: 'Biology', grade: 'Grade 11', dueDate: '2026-03-28T17:00:00Z', status: 'Draft', maxMarks: 20, submissions: 0, totalStudents: 25 },
];

export default function HomeworkDashboard() {
    const [view, setView] = useState<'list' | 'create'>('list');

    return (
        <div className="space-y-8 max-w-7xl mx-auto pb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">Homework & Assignments</h1>
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
                                <div className="text-3xl font-bold text-gray-900">12</div>
                            </CardContent>
                        </Card>
                        <Card className="shadow-sm border-orange-100 bg-orange-50/30">
                            <CardContent className="p-6">
                                <div className="text-sm font-medium text-orange-600 mb-1">Pending Grading</div>
                                <div className="text-3xl font-bold text-gray-900">45</div>
                            </CardContent>
                        </Card>
                        <Card className="shadow-sm border-green-100 bg-green-50/30">
                            <CardContent className="p-6">
                                <div className="text-sm font-medium text-green-600 mb-1">Avg Submission Rate</div>
                                <div className="text-3xl font-bold text-gray-900">92%</div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase font-semibold">
                                    <tr>
                                        <th className="px-6 py-4">Assignment</th>
                                        <th className="px-6 py-4">Class</th>
                                        <th className="px-6 py-4">Due Date</th>
                                        <th className="px-6 py-4">Status</th>
                                        <th className="px-6 py-4">Submissions</th>
                                        <th className="px-6 py-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {MOCK_ASSIGNMENTS.map((assignment) => (
                                        <tr key={assignment.id} className="hover:bg-gray-50/80 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="font-semibold text-gray-900">{assignment.title}</div>
                                                <div className="text-gray-500 mt-0.5">{assignment.subject}</div>
                                            </td>
                                            <td className="px-6 py-4 text-gray-700">{assignment.grade}</td>
                                            <td className="px-6 py-4">
                                                <div className="text-gray-900">{new Date(assignment.dueDate).toLocaleDateString()}</div>
                                                <div className="text-xs text-gray-500">{new Date(assignment.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <Badge
                                                    variant="secondary"
                                                    className={
                                                        assignment.status === 'Active' ? 'bg-green-100 text-green-700 hover:bg-green-100' :
                                                            assignment.status === 'Grading' ? 'bg-orange-100 text-orange-700 hover:bg-orange-100' :
                                                                'bg-gray-100 text-gray-700 hover:bg-gray-100'
                                                    }
                                                >
                                                    {assignment.status}
                                                </Badge>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-full bg-gray-200 rounded-full h-2 max-w-[80px]">
                                                        <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${(assignment.submissions / assignment.totalStudents) * 100}%` }}></div>
                                                    </div>
                                                    <span className="text-xs font-medium text-gray-600">{assignment.submissions}/{assignment.totalStudents}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50">View Submissions</Button>
                                            </td>
                                        </tr>
                                    ))}
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
                        <form className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="title">Assignment Title</Label>
                                <Input id="title" placeholder="e.g., Chapter 5 Reading & Questions" autoFocus />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Class / Grade</Label>
                                    <select className="w-full h-10 px-3 py-2 bg-white border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                                        <option value="">Select Class...</option>
                                        <option value="1">Grade 10 - Section A</option>
                                        <option value="2">Grade 12 - Science</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Subject</Label>
                                    <select className="w-full h-10 px-3 py-2 bg-white border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                                        <option value="">Select Subject...</option>
                                        <option value="math">Mathematics</option>
                                        <option value="physics">Physics</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">Instructions / Description</Label>
                                <Textarea id="description" placeholder="Write detailed instructions for the students..." className="h-32 resize-none" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="dueDate">Due Date & Time</Label>
                                    <Input id="dueDate" type="datetime-local" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="maxMarks">Maximum Marks (Optional)</Label>
                                    <Input id="maxMarks" type="number" placeholder="50" min="0" />
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
                                <Button type="button" onClick={() => setView('list')} className="bg-blue-600 hover:bg-blue-700">Assign to Class</Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
