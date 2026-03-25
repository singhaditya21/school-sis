'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getMyAttendance } from '@/lib/actions/scaffolding-bridge';

export default function MyAttendancePage() {
    const now = new Date();
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year, setYear] = useState(now.getFullYear());
    const [attendance, setAttendance] = useState<any[]>([]);

    useEffect(() => { getMyAttendance(month, year).then(r => setAttendance(r as any[])); }, [month, year]);

    const present = attendance.filter(a => a.status === 'PRESENT').length;
    const absent = attendance.filter(a => a.status === 'ABSENT').length;
    const total = attendance.length;
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
    const calendarDays = Array.from({ length: daysInMonth }, (_, i) => {
        const dayNum = i + 1;
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
        const record = attendance.find((a: any) => new Date(a.date).getDate() === dayNum);
        return { day: dayNum, status: record?.status || null };
    });

    return (
        <div className="space-y-6">
            <div><h1 className="text-3xl font-bold">My Attendance</h1><p className="text-gray-600 mt-1">View attendance records</p></div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Present</div><div className="text-3xl font-bold text-green-600">{present}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Absent</div><div className="text-3xl font-bold text-red-600">{absent}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Total Days</div><div className="text-3xl font-bold text-blue-600">{total}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Attendance %</div><div className="text-3xl font-bold text-purple-600">{percentage}%</div></CardContent></Card>
            </div>

            <div className="flex items-center gap-4">
                <button onClick={() => { if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1); }} className="px-3 py-2 border rounded-lg hover:bg-gray-50">←</button>
                <span className="text-lg font-medium">{months[month - 1]} {year}</span>
                <button onClick={() => { if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1); }} className="px-3 py-2 border rounded-lg hover:bg-gray-50">→</button>
            </div>

            <Card>
                <CardHeader><CardTitle>Attendance Calendar</CardTitle></CardHeader>
                <CardContent>
                    <div className="grid grid-cols-7 gap-2">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (<div key={d} className="text-center text-xs text-gray-500 font-medium py-1">{d}</div>))}
                        {Array.from({ length: firstDayOfWeek }).map((_, i) => (<div key={`empty-${i}`} />))}
                        {calendarDays.map(({ day, status }) => (
                            <div key={day} className={`aspect-square flex items-center justify-center rounded-lg text-sm font-medium ${
                                status === 'PRESENT' ? 'bg-green-100 text-green-700' :
                                status === 'ABSENT' ? 'bg-red-100 text-red-700' :
                                'bg-gray-50 text-gray-400'
                            }`}>{day}</div>
                        ))}
                    </div>
                    <div className="flex items-center justify-center gap-6 mt-4">
                        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-green-100 rounded" /><span className="text-xs text-gray-500">Present</span></div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-red-100 rounded" /><span className="text-xs text-gray-500">Absent</span></div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-gray-50 rounded border" /><span className="text-xs text-gray-500">No data</span></div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
