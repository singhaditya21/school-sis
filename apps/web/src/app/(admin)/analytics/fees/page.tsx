'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getFeeCollectionData, getClassWiseFees } from '@/lib/actions/analytics';

export default function FeeAnalyticsPage() {
    const [feeData, setFeeData] = useState<{ month: string; collected: number; target: number; pending: number }[]>([]);
    const [classWiseData, setClassWiseData] = useState<{ class: string; students: number; collected: number; pending: number }[]>([]);
    const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

    useEffect(() => {
        getFeeCollectionData().then(setFeeData);
        getClassWiseFees().then(setClassWiseData);
    }, []);

    const totalCollected = feeData.reduce((sum, d) => sum + d.collected, 0);
    const totalTarget = feeData.reduce((sum, d) => sum + d.target, 0);
    const totalPending = feeData.reduce((sum, d) => sum + d.pending, 0);
    const collectionRate = totalTarget > 0 ? Math.round((totalCollected / totalTarget) * 100) : 0;
    const maxValue = feeData.length > 0 ? Math.max(...feeData.map(d => Math.max(d.collected, d.target)), 1) : 1;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div><h1 className="text-3xl font-bold">Fee Collection Analysis</h1><p className="text-gray-600 mt-1">Detailed fee trends and class-wise breakdown</p></div>
                <div className="flex gap-3">
                    <Link href="/analytics" className="px-4 py-2 border rounded-lg hover:bg-gray-50">← Back to Analytics</Link>
                    <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">📊 Export Report</button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Total Collected</div><div className="text-2xl font-bold text-green-600">₹{(totalCollected / 10000000).toFixed(2)}Cr</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Total Target</div><div className="text-2xl font-bold text-blue-600">₹{(totalTarget / 10000000).toFixed(2)}Cr</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Total Pending</div><div className="text-2xl font-bold text-orange-600">₹{(totalPending / 100000).toFixed(1)}L</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Collection Rate</div><div className="text-2xl font-bold text-purple-600">{collectionRate}%</div></CardContent></Card>
            </div>

            <Card>
                <CardHeader><CardTitle>Monthly Collection vs Target</CardTitle></CardHeader>
                <CardContent>
                    {feeData.length === 0 ? <p className="text-gray-500 text-center py-12">No fee data available yet.</p> : (
                        <div className="h-80">
                            <div className="flex items-end gap-4 h-64">
                                {feeData.map((d, idx) => (
                                    <div key={idx} className={`flex-1 flex flex-col items-center gap-1 cursor-pointer transition-opacity ${selectedMonth && selectedMonth !== d.month ? 'opacity-50' : ''}`}
                                        onClick={() => setSelectedMonth(selectedMonth === d.month ? null : d.month)}>
                                        <div className="w-full flex gap-1" style={{ height: '240px' }}>
                                            <div className="flex-1 flex flex-col justify-end"><div className="w-full bg-blue-500 rounded-t transition-all hover:bg-blue-600" style={{ height: `${(d.collected / maxValue) * 100}%` }} /></div>
                                            <div className="flex-1 flex flex-col justify-end"><div className="w-full bg-gray-300 rounded-t" style={{ height: `${(d.target / maxValue) * 100}%` }} /></div>
                                        </div>
                                        <span className="text-xs font-medium">{d.month}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-center gap-6 mt-4">
                                <div className="flex items-center gap-2"><div className="w-4 h-4 bg-blue-500 rounded" /><span className="text-sm">Collected</span></div>
                                <div className="flex items-center gap-2"><div className="w-4 h-4 bg-gray-300 rounded" /><span className="text-sm">Target</span></div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>Class-wise Fee Collection</CardTitle></CardHeader>
                <CardContent>
                    {classWiseData.length === 0 ? <p className="text-gray-500 text-center py-8">No class-wise data available.</p> : (
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Class Group</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Students</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Collected</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Pending</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Progress</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {classWiseData.map((row, idx) => {
                                    const total = row.collected + row.pending;
                                    const percent = total > 0 ? Math.round((row.collected / total) * 100) : 0;
                                    return (
                                        <tr key={idx} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 font-medium">{row.class}</td>
                                            <td className="px-4 py-3 text-right">{row.students.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right text-green-600 font-semibold">₹{(row.collected / 100000).toFixed(1)}L</td>
                                            <td className="px-4 py-3 text-right text-orange-600">₹{(row.pending / 100000).toFixed(1)}L</td>
                                            <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="flex-1 bg-gray-200 rounded-full h-2"><div className="bg-green-500 h-2 rounded-full" style={{ width: `${percent}%` }} /></div><span className="text-xs font-medium w-10">{percent}%</span></div></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
