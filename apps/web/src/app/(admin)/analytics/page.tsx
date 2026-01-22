'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    getAnalyticsSummary,
    generateFeeCollectionData,
    generateClassWiseSummary,
    getTopPerformers,
    generateDailyAttendance,
    type AnalyticsSummary
} from '@/lib/services/analytics/analytics.service';

export default function AnalyticsPage() {
    const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
    const [feeData, setFeeData] = useState<{ month: string; collected: number; target: number }[]>([]);
    const [classData, setClassData] = useState<{ label: string; value: number }[]>([]);
    const [topPerformers, setTopPerformers] = useState<{ name: string; class: string; percentage: number }[]>([]);
    const [attendanceData, setAttendanceData] = useState<{ date: string; value: number }[]>([]);

    useEffect(() => {
        setSummary(getAnalyticsSummary());
        setFeeData(generateFeeCollectionData());
        setClassData(generateClassWiseSummary());
        setTopPerformers(getTopPerformers());
        setAttendanceData(generateDailyAttendance());
    }, []);

    if (!summary) return <div className="animate-pulse">Loading...</div>;

    const maxFee = Math.max(...feeData.map(d => d.target));

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
                    <p className="text-gray-600 mt-1">School performance insights and trends</p>
                </div>
                <div className="flex gap-3">
                    <Link href="/analytics/fees" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        💰 Fee Analysis
                    </Link>
                    <Link href="/analytics/attendance" className="px-4 py-2 border rounded-lg hover:bg-gray-50">
                        📊 Attendance
                    </Link>
                    <Link href="/analytics/exams" className="px-4 py-2 border rounded-lg hover:bg-gray-50">
                        📝 Exams
                    </Link>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Total Students</div>
                        <div className="text-2xl font-bold text-blue-600">{summary.totalStudents.toLocaleString()}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Fee Collected (YTD)</div>
                        <div className="text-2xl font-bold text-green-600">₹{(summary.totalFeeCollected / 10000000).toFixed(1)}Cr</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Pending Fees</div>
                        <div className="text-2xl font-bold text-orange-600">₹{(summary.pendingFees / 100000).toFixed(1)}L</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Avg Attendance</div>
                        <div className="text-2xl font-bold text-purple-600">{summary.averageAttendance}%</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Avg Exam Score</div>
                        <div className="text-2xl font-bold text-indigo-600">{summary.averageExamScore}%</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Monthly Growth</div>
                        <div className="text-2xl font-bold text-emerald-600">+{summary.monthlyGrowth}%</div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Fee Collection Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            <span>💰 Fee Collection Trend</span>
                            <Link href="/analytics/fees" className="text-sm text-blue-600 hover:underline">View Details →</Link>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-64 flex items-end gap-2">
                            {feeData.map((d, idx) => (
                                <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                                    <div className="w-full flex flex-col gap-1" style={{ height: '200px' }}>
                                        <div
                                            className="w-full bg-blue-500 rounded-t transition-all"
                                            style={{ height: `${(d.collected / maxFee) * 100}%` }}
                                            title={`Collected: ₹${(d.collected / 100000).toFixed(1)}L`}
                                        />
                                    </div>
                                    <span className="text-xs text-gray-500">{d.month}</span>
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center justify-center gap-6 mt-4">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-blue-500 rounded" />
                                <span className="text-sm text-gray-600">Collected</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Attendance Heatmap */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            <span>📊 Attendance (Last 30 Days)</span>
                            <Link href="/analytics/attendance" className="text-sm text-blue-600 hover:underline">View Details →</Link>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-7 gap-1">
                            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                                <div key={day} className="text-xs text-center text-gray-500 py-1">{day}</div>
                            ))}
                            {attendanceData.map((d, idx) => {
                                const color = d.value >= 95 ? 'bg-green-500' :
                                    d.value >= 90 ? 'bg-green-400' :
                                        d.value >= 85 ? 'bg-yellow-400' : 'bg-orange-400';
                                return (
                                    <div
                                        key={idx}
                                        className={`${color} rounded aspect-square flex items-center justify-center text-xs text-white font-medium`}
                                        title={`${d.date}: ${d.value}%`}
                                    >
                                        {d.value}
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex items-center justify-center gap-4 mt-4">
                            <div className="flex items-center gap-1">
                                <div className="w-3 h-3 bg-green-500 rounded" />
                                <span className="text-xs text-gray-500">95%+</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-3 h-3 bg-green-400 rounded" />
                                <span className="text-xs text-gray-500">90-94%</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-3 h-3 bg-yellow-400 rounded" />
                                <span className="text-xs text-gray-500">85-89%</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-3 h-3 bg-orange-400 rounded" />
                                <span className="text-xs text-gray-500">&lt;85%</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Class-wise Performance */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            <span>📈 Class-wise Exam Performance</span>
                            <Link href="/analytics/exams" className="text-sm text-blue-600 hover:underline">View Details →</Link>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {classData.slice(0, 8).map((d, idx) => (
                                <div key={idx} className="flex items-center gap-3">
                                    <span className="w-16 text-sm text-gray-600">{d.label}</span>
                                    <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all"
                                            style={{ width: `${d.value}%` }}
                                        />
                                        <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
                                            {d.value}%
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Top Performers */}
                <Card>
                    <CardHeader>
                        <CardTitle>🏆 Top Performers</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {topPerformers.slice(0, 5).map((student, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${idx === 0 ? 'bg-yellow-400' : idx === 1 ? 'bg-gray-300' : idx === 2 ? 'bg-amber-400' : 'bg-gray-200'
                                            }`}>
                                            {idx + 1}
                                        </div>
                                        <div>
                                            <p className="font-medium">{student.name}</p>
                                            <p className="text-xs text-gray-500">Class {student.class}</p>
                                        </div>
                                    </div>
                                    <Badge className="bg-green-100 text-green-700">{student.percentage}%</Badge>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
