'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { generateMockRankedResults, type RankComputationResult } from '@/lib/services/exams/rank-computation.service';

interface PageProps {
    params: Promise<{ classId: string }>;
}

export default function ClassReportCardsPage({ params }: PageProps) {
    const [classId, setClassId] = useState<string>('');
    const [rankData, setRankData] = useState<RankComputationResult | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        params.then(({ classId }) => {
            setClassId(classId);
            // Generate mock ranked data
            const data = generateMockRankedResults(classId, 'Term 1 Examination 2025-26');
            setRankData(data);
            setLoading(false);
        });
    }, [params]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (!rankData) {
        return <div className="text-center py-8 text-gray-500">No data available</div>;
    }

    const getRankBadge = (rank: number | undefined) => {
        if (!rank) return null;
        if (rank === 1) return <Badge className="bg-yellow-500">🥇 1st</Badge>;
        if (rank === 2) return <Badge className="bg-gray-400">🥈 2nd</Badge>;
        if (rank === 3) return <Badge className="bg-amber-600">🥉 3rd</Badge>;
        return <Badge variant="outline">{rank}</Badge>;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">{rankData.className} - Student Rankings</h1>
                    <p className="text-gray-600">{rankData.examName}</p>
                </div>
                <Link href="/exams/report-cards" className="text-blue-600 hover:underline">← Back</Link>
            </div>

            {/* Statistics Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <div className="text-sm text-gray-500">Total Students</div>
                    <div className="text-2xl font-bold text-blue-600">{rankData.totalStudents}</div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <div className="text-sm text-gray-500">Highest %</div>
                    <div className="text-2xl font-bold text-green-600">{rankData.statistics.highestMarks}%</div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <div className="text-sm text-gray-500">Lowest %</div>
                    <div className="text-2xl font-bold text-red-600">{rankData.statistics.lowestMarks}%</div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <div className="text-sm text-gray-500">Average %</div>
                    <div className="text-2xl font-bold text-purple-600">{rankData.statistics.averageMarks}%</div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <div className="text-sm text-gray-500">Pass Rate</div>
                    <div className="text-2xl font-bold text-amber-600">{rankData.statistics.passPercentage}%</div>
                </div>
            </div>

            {/* Top Performers */}
            <div className="bg-gradient-to-r from-yellow-50 to-amber-50 rounded-xl shadow-sm border p-4">
                <h2 className="font-semibold mb-3">🏆 Top Performers</h2>
                <div className="flex gap-6">
                    {rankData.topPerformers.map((student, idx) => (
                        <div key={student.studentId} className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${idx === 0 ? 'bg-yellow-400' : idx === 1 ? 'bg-gray-300' : 'bg-amber-400'
                                }`}>
                                {idx + 1}
                            </div>
                            <div>
                                <p className="font-medium">{student.studentName}</p>
                                <p className="text-sm text-gray-600">{student.percentage}% • Section {student.section}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Full Rankings Table */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="p-4 border-b bg-gray-50">
                    <h2 className="font-semibold">Complete Rankings</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Class Rank</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student Name</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Section</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Section Rank</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Marks</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Percentage</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {rankData.results
                                .sort((a, b) => (a.classRank || 999) - (b.classRank || 999))
                                .map((student) => (
                                    <tr key={student.studentId} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            {getRankBadge(student.classRank)}
                                        </td>
                                        <td className="px-4 py-3 font-medium">{student.studentName}</td>
                                        <td className="px-4 py-3">
                                            <Badge variant="outline">{student.section}</Badge>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-sm text-gray-600">#{student.sectionRank}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span className="font-mono">{student.totalMarks}/{student.maxMarks}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span className={`font-semibold ${student.percentage >= 90 ? 'text-green-600' :
                                                    student.percentage >= 75 ? 'text-blue-600' :
                                                        student.percentage >= 60 ? 'text-yellow-600' :
                                                            student.percentage >= 33 ? 'text-orange-600' :
                                                                'text-red-600'
                                                }`}>
                                                {student.percentage}%
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <a
                                                href={`/api/report-cards/${student.studentId}/current`}
                                                target="_blank"
                                                className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                            >
                                                📄 PDF
                                            </a>
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
