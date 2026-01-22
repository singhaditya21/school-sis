'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { generateAttendanceData, generateDailyAttendance } from '@/lib/services/analytics/analytics.service';

export default function AttendanceAnalyticsPage() {
    const [weeklyData, setWeeklyData] = useState<{ date: string; present: number; absent: number; percentage: number }[]>([]);
    const [dailyData, setDailyData] = useState<{ date: string; value: number }[]>([]);

    useEffect(() => {
        setWeeklyData(generateAttendanceData(12));
        setDailyData(generateDailyAttendance());
    }, []);

    const avgAttendance = weeklyData.length > 0
        ? Math.round(weeklyData.reduce((sum, d) => sum + d.percentage, 0) / weeklyData.length * 10) / 10
        : 0;

    // Class-wise attendance
    const classAttendance = Array.from({ length: 12 }, (_, i) => ({
        class: `Class ${i + 1}`,
        percentage: Math.round((88 + Math.random() * 8) * 10) / 10,
        present: Math.round(300 + Math.random() * 50),
        total: 360,
    }));

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Attendance Analytics</h1>
                    <p className="text-gray-600 mt-1">Attendance trends and patterns</p>
                </div>
                <div className="flex gap-3">
                    <Link href="/analytics" className="px-4 py-2 border rounded-lg hover:bg-gray-50">
                        ← Back to Analytics
                    </Link>
                    <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                        📊 Export Report
                    </button>
                </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Average Attendance</div>
                        <div className="text-2xl font-bold text-green-600">{avgAttendance}%</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Total Students</div>
                        <div className="text-2xl font-bold text-blue-600">4,320</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Present Today</div>
                        <div className="text-2xl font-bold text-purple-600">3,942</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Absent Today</div>
                        <div className="text-2xl font-bold text-orange-600">378</div>
                    </CardContent>
                </Card>
            </div>

            {/* Weekly Trend */}
            <Card>
                <CardHeader>
                    <CardTitle>Weekly Attendance Trend</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-64 flex items-end gap-2">
                        {weeklyData.map((d, idx) => (
                            <div key={idx} className="flex-1 flex flex-col items-center">
                                <div className="w-full flex flex-col justify-end" style={{ height: '200px' }}>
                                    <div
                                        className={`w-full rounded-t transition-all ${d.percentage >= 95 ? 'bg-green-500' :
                                                d.percentage >= 90 ? 'bg-green-400' :
                                                    d.percentage >= 85 ? 'bg-yellow-400' : 'bg-orange-400'
                                            }`}
                                        style={{ height: `${d.percentage}%` }}
                                    />
                                </div>
                                <span className="text-xs text-gray-500 mt-1">W{idx + 1}</span>
                                <span className="text-xs font-medium">{d.percentage}%</span>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Daily Heatmap */}
            <Card>
                <CardHeader>
                    <CardTitle>Daily Attendance Heatmap (Last 30 Days)</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-10 gap-2">
                        {dailyData.map((d, idx) => {
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
                </CardContent>
            </Card>

            {/* Class-wise Attendance */}
            <Card>
                <CardHeader>
                    <CardTitle>Class-wise Attendance</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {classAttendance.map((c, idx) => (
                            <div key={idx} className="p-4 bg-gray-50 rounded-lg">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="font-medium">{c.class}</span>
                                    <Badge className={
                                        c.percentage >= 95 ? 'bg-green-100 text-green-700' :
                                            c.percentage >= 90 ? 'bg-blue-100 text-blue-700' :
                                                'bg-yellow-100 text-yellow-700'
                                    }>
                                        {c.percentage}%
                                    </Badge>
                                </div>
                                <div className="bg-gray-200 rounded-full h-2">
                                    <div
                                        className={`h-2 rounded-full ${c.percentage >= 95 ? 'bg-green-500' :
                                                c.percentage >= 90 ? 'bg-blue-500' : 'bg-yellow-500'
                                            }`}
                                        style={{ width: `${c.percentage}%` }}
                                    />
                                </div>
                                <p className="text-xs text-gray-500 mt-1">{c.present}/{c.total} present</p>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
