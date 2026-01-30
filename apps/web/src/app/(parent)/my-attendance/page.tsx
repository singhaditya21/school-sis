'use client';

import { useState } from 'react';

interface AttendanceDay {
    date: string;
    status: 'PRESENT' | 'ABSENT' | 'LATE' | 'HOLIDAY' | null;
}

const statusColors: Record<string, string> = {
    PRESENT: 'bg-green-500 text-white',
    ABSENT: 'bg-red-500 text-white',
    LATE: 'bg-yellow-500 text-white',
    HOLIDAY: 'bg-gray-300 text-gray-600',
};

const statusLabels: Record<string, string> = {
    PRESENT: 'P',
    ABSENT: 'A',
    LATE: 'L',
    HOLIDAY: 'H',
};

export default function MyAttendancePage() {
    const [currentMonth, setCurrentMonth] = useState(new Date());

    // Mock attendance data - will be replaced with API call
    const mockAttendance: AttendanceDay[] = generateMockAttendance(currentMonth);

    const stats = calculateStats(mockAttendance);

    const monthName = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

    const goToPreviousMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    };

    const goToNextMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">My Attendance</h1>
                <p className="text-gray-600 mt-1">Track your child&apos;s attendance records</p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Total Days" value={stats.totalDays} color="bg-blue-50 text-blue-700" />
                <StatCard label="Present" value={stats.present} color="bg-green-50 text-green-700" />
                <StatCard label="Absent" value={stats.absent} color="bg-red-50 text-red-700" />
                <StatCard
                    label="Attendance %"
                    value={`${stats.percentage}%`}
                    color={stats.percentage >= 75 ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}
                />
            </div>

            {/* Calendar */}
            <div className="bg-white rounded-xl shadow-sm border p-4">
                {/* Month Navigation */}
                <div className="flex items-center justify-between mb-4">
                    <button
                        onClick={goToPreviousMonth}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        ◀
                    </button>
                    <h2 className="text-lg font-semibold">{monthName}</h2>
                    <button
                        onClick={goToNextMonth}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        ▶
                    </button>
                </div>

                {/* Day Headers */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                        <div key={day} className="text-center text-xs font-medium text-gray-500 py-2">
                            {day}
                        </div>
                    ))}
                </div>

                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-1">
                    {generateCalendarDays(currentMonth, mockAttendance).map((day, index) => (
                        <div
                            key={index}
                            className={`
                                aspect-square flex flex-col items-center justify-center rounded-lg text-sm
                                ${day.isCurrentMonth ? '' : 'opacity-30'}
                                ${day.status ? statusColors[day.status] : 'bg-gray-50'}
                            `}
                        >
                            <span className="font-medium">{day.dayNumber}</span>
                            {day.status && (
                                <span className="text-[10px]">{statusLabels[day.status]}</span>
                            )}
                        </div>
                    ))}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t">
                    <LegendItem color="bg-green-500" label="Present" />
                    <LegendItem color="bg-red-500" label="Absent" />
                    <LegendItem color="bg-yellow-500" label="Late" />
                    <LegendItem color="bg-gray-300" label="Holiday" />
                </div>
            </div>
        </div>
    );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
    return (
        <div className={`${color} rounded-xl p-4`}>
            <p className="text-sm opacity-80">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
        </div>
    );
}

function LegendItem({ color, label }: { color: string; label: string }) {
    return (
        <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className={`w-4 h-4 rounded ${color}`}></div>
            <span>{label}</span>
        </div>
    );
}

function generateMockAttendance(month: Date): AttendanceDay[] {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const today = new Date();

    const attendance: AttendanceDay[] = [];
    const statuses: Array<'PRESENT' | 'ABSENT' | 'LATE' | 'HOLIDAY'> = ['PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'ABSENT', 'LATE', 'HOLIDAY'];

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, monthIndex, day);
        const dayOfWeek = date.getDay();

        // Skip future dates
        if (date > today) {
            attendance.push({ date: date.toISOString().split('T')[0], status: null });
            continue;
        }

        // Sundays are holidays
        if (dayOfWeek === 0) {
            attendance.push({ date: date.toISOString().split('T')[0], status: 'HOLIDAY' });
            continue;
        }

        // Random status for demo (weighted towards PRESENT)
        const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
        attendance.push({ date: date.toISOString().split('T')[0], status: randomStatus });
    }

    return attendance;
}

function calculateStats(attendance: AttendanceDay[]) {
    const workingDays = attendance.filter(d => d.status && d.status !== 'HOLIDAY');
    const present = workingDays.filter(d => d.status === 'PRESENT' || d.status === 'LATE').length;
    const absent = workingDays.filter(d => d.status === 'ABSENT').length;
    const totalDays = workingDays.length;
    const percentage = totalDays > 0 ? Math.round((present / totalDays) * 100) : 0;

    return { totalDays, present, absent, percentage };
}

interface CalendarDay {
    dayNumber: number;
    isCurrentMonth: boolean;
    status: string | null;
}

function generateCalendarDays(month: Date, attendance: AttendanceDay[]): CalendarDay[] {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const firstDay = new Date(year, monthIndex, 1).getDay();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, monthIndex, 0).getDate();

    const days: CalendarDay[] = [];

    // Previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
        days.push({
            dayNumber: daysInPrevMonth - i,
            isCurrentMonth: false,
            status: null,
        });
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = new Date(year, monthIndex, day).toISOString().split('T')[0];
        const record = attendance.find(a => a.date === dateStr);
        days.push({
            dayNumber: day,
            isCurrentMonth: true,
            status: record?.status || null,
        });
    }

    // Next month days (fill to complete 6 rows)
    const remaining = 42 - days.length;
    for (let day = 1; day <= remaining; day++) {
        days.push({
            dayNumber: day,
            isCurrentMonth: false,
            status: null,
        });
    }

    return days;
}
