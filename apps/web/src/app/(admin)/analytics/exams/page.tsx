'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getSubjectPerformance, getTopPerformers as fetchTopPerformers, getExamClassPerformance } from '@/lib/actions/analytics';

export default function ExamAnalyticsPage() {
    const [subjectData, setSubjectData] = useState<{ label: string; value: number }[]>([]);
    const [topPerformers, setTopPerformers] = useState<{ name: string; class: string; percentage: number }[]>([]);
    const [classData, setClassData] = useState<{ class: string; section: string; averagePercent: number; passPercent: number }[]>([]);

    useEffect(() => {
        getSubjectPerformance().then(setSubjectData);
        fetchTopPerformers().then(setTopPerformers);
        getExamClassPerformance().then(d => setClassData(d.slice(0, 18)));
    }, []);

    const avgScore = subjectData.length > 0 ? Math.round(subjectData.reduce((sum, d) => sum + d.value, 0) / subjectData.length) : 0;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div><h1 className="text-3xl font-bold">Exam Performance Analysis</h1><p className="text-gray-600 mt-1">Term-wise and subject-wise performance</p></div>
                <div className="flex gap-3">
                    <Link href="/analytics" className="px-4 py-2 border rounded-lg hover:bg-gray-50">← Back to Analytics</Link>
                    <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">📊 Export Report</button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Average Score</div><div className="text-2xl font-bold text-blue-600">{avgScore}%</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Subjects Tracked</div><div className="text-2xl font-bold text-green-600">{subjectData.length}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Class Sections</div><div className="text-2xl font-bold text-purple-600">{classData.length}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Top Performers</div><div className="text-2xl font-bold text-orange-600">{topPerformers.length}</div></CardContent></Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader><CardTitle>Subject-wise Performance</CardTitle></CardHeader>
                    <CardContent>
                        {subjectData.length === 0 ? <p className="text-gray-500 text-center py-8">No exam data yet.</p> : (
                            <div className="space-y-4">
                                {subjectData.map((subject, idx) => (
                                    <div key={idx}>
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm font-medium">{subject.label}</span>
                                            <span className={`text-sm font-bold ${subject.value >= 80 ? 'text-green-600' : subject.value >= 60 ? 'text-blue-600' : 'text-orange-600'}`}>{subject.value}%</span>
                                        </div>
                                        <div className="bg-gray-200 rounded-full h-3"><div className={`h-3 rounded-full transition-all ${subject.value >= 80 ? 'bg-green-500' : subject.value >= 60 ? 'bg-blue-500' : 'bg-orange-500'}`} style={{ width: `${subject.value}%` }} /></div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle>🏆 Top 10 Performers</CardTitle></CardHeader>
                    <CardContent>
                        {topPerformers.length === 0 ? <p className="text-gray-500 text-center py-8">No performer data yet.</p> : (
                            <div className="space-y-2">
                                {topPerformers.map((student, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${idx === 0 ? 'bg-yellow-400' : idx === 1 ? 'bg-gray-300' : idx === 2 ? 'bg-amber-400' : 'bg-gray-200'}`}>{idx + 1}</div>
                                            <div><p className="font-medium text-sm">{student.name}</p><p className="text-xs text-gray-500">Class {student.class}</p></div>
                                        </div>
                                        <Badge className="bg-green-100 text-green-700">{student.percentage}%</Badge>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader><CardTitle>Class-wise Performance</CardTitle></CardHeader>
                <CardContent>
                    {classData.length === 0 ? <p className="text-gray-500 text-center py-8">No class performance data.</p> : (
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Class</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Section</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg %</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Pass %</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Performance</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {classData.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 font-medium">{row.class}</td>
                                        <td className="px-4 py-3"><Badge variant="outline">{row.section}</Badge></td>
                                        <td className="px-4 py-3 text-right"><span className={`font-semibold ${row.averagePercent >= 80 ? 'text-green-600' : row.averagePercent >= 60 ? 'text-blue-600' : 'text-orange-600'}`}>{row.averagePercent}%</span></td>
                                        <td className="px-4 py-3 text-right">{row.passPercent}%</td>
                                        <td className="px-4 py-3"><div className="w-32 bg-gray-200 rounded-full h-2"><div className={`h-2 rounded-full ${row.averagePercent >= 80 ? 'bg-green-500' : row.averagePercent >= 60 ? 'bg-blue-500' : 'bg-orange-500'}`} style={{ width: `${row.averagePercent}%` }} /></div></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
