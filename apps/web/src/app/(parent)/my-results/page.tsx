'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getMyResults } from '@/lib/actions/scaffolding-bridge';

export default function MyResultsPage() {
    const [results, setResults] = useState<any[]>([]);
    useEffect(() => { getMyResults().then(r => setResults(r as any[])); }, []);

    const grouped = results.reduce((acc: Record<string, any[]>, r: any) => {
        const key = r.examName || 'Unknown Exam';
        (acc[key] = acc[key] || []).push(r);
        return acc;
    }, {} as Record<string, any[]>);

    return (
        <div className="space-y-6">
            <div><h1 className="text-3xl font-bold">My Results</h1><p className="text-gray-600 mt-1">View exam results and performance</p></div>
            {Object.keys(grouped).length === 0 ? <Card><CardContent className="py-12 text-center text-gray-500">No exam results available.</CardContent></Card> : (
                Object.entries(grouped).map(([examName, subjects]) => {
                    const avg = subjects.length > 0 ? Math.round(subjects.reduce((sum: number, s: any) => sum + Number(s.percentage || 0), 0) / subjects.length) : 0;
                    return (
                        <Card key={examName}>
                            <CardHeader><CardTitle className="flex items-center justify-between"><span>{examName}</span><Badge className={avg >= 80 ? 'bg-green-100 text-green-700' : avg >= 60 ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}>Avg: {avg}%</Badge></CardTitle></CardHeader>
                            <CardContent>
                                <table className="w-full"><thead className="bg-gray-50"><tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subject</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Marks</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">%</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Grade</th>
                                </tr></thead><tbody className="divide-y">
                                    {subjects.map((s: any, idx: number) => (
                                        <tr key={idx} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 font-medium">{s.subject}</td>
                                            <td className="px-4 py-3 text-right">{s.marksObtained}/{s.totalMarks}</td>
                                            <td className="px-4 py-3 text-right font-bold">{s.percentage}%</td>
                                            <td className="px-4 py-3"><Badge variant="outline">{s.grade || 'N/A'}</Badge></td>
                                        </tr>
                                    ))}
                                </tbody></table>
                            </CardContent>
                        </Card>
                    );
                })
            )}
        </div>
    );
}
