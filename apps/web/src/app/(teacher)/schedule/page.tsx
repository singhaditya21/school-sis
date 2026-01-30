import { getSession } from '@/lib/auth/session';
import Link from 'next/link';

interface ScheduleSlot {
    id: string;
    period: number;
    startTime: string;
    endTime: string;
    subject: string;
    class: string;
    room: string;
    dayOfWeek: number;
}

// Mock weekly schedule
const mockSchedule: ScheduleSlot[] = [
    // Monday
    { id: '1', period: 1, startTime: '8:00', endTime: '8:45', subject: 'Mathematics', class: '10-A', room: 'Room 201', dayOfWeek: 1 },
    { id: '2', period: 2, startTime: '8:45', endTime: '9:30', subject: 'Mathematics', class: '10-B', room: 'Room 201', dayOfWeek: 1 },
    { id: '3', period: 5, startTime: '11:15', endTime: '12:00', subject: 'Mathematics', class: '11-A', room: 'Room 301', dayOfWeek: 1 },
    // Tuesday
    { id: '4', period: 3, startTime: '9:45', endTime: '10:30', subject: 'Mathematics', class: '9-A', room: 'Room 105', dayOfWeek: 2 },
    { id: '5', period: 6, startTime: '12:00', endTime: '12:45', subject: 'Mathematics', class: '11-B', room: 'Room 301', dayOfWeek: 2 },
    // Wednesday
    { id: '6', period: 1, startTime: '8:00', endTime: '8:45', subject: 'Mathematics', class: '10-A', room: 'Room 201', dayOfWeek: 3 },
    { id: '7', period: 4, startTime: '10:30', endTime: '11:15', subject: 'Mathematics', class: '12-A', room: 'Room 401', dayOfWeek: 3 },
    // Thursday
    { id: '8', period: 2, startTime: '8:45', endTime: '9:30', subject: 'Mathematics', class: '9-A', room: 'Room 105', dayOfWeek: 4 },
    { id: '9', period: 5, startTime: '11:15', endTime: '12:00', subject: 'Mathematics', class: '11-B', room: 'Room 301', dayOfWeek: 4 },
    // Friday
    { id: '10', period: 1, startTime: '8:00', endTime: '8:45', subject: 'Mathematics', class: '10-B', room: 'Room 201', dayOfWeek: 5 },
    { id: '11', period: 3, startTime: '9:45', endTime: '10:30', subject: 'Mathematics', class: '11-A', room: 'Room 301', dayOfWeek: 5 },
    { id: '12', period: 6, startTime: '12:00', endTime: '12:45', subject: 'Mathematics', class: '12-A', room: 'Room 401', dayOfWeek: 5 },
];

const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const periods = [1, 2, 3, 4, 5, 6, 7, 8];

export default async function SchedulePage() {
    const session = await getSession();

    // Fetch schedule from backend
    let schedule: ScheduleSlot[] = mockSchedule;

    try {
        const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/teacher/schedule`,
            {
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                    'Content-Type': 'application/json',
                },
                cache: 'no-store',
            }
        );
        if (response.ok) {
            const data = await response.json();
            if (data.data?.length > 0) {
                schedule = data.data;
            }
        }
    } catch (error) {
        console.error('[Schedule] API Error:', error);
    }

    const getSlot = (day: number, period: number) => {
        return schedule.find(s => s.dayOfWeek === day && s.period === period);
    };

    const totalClasses = schedule.length;
    const uniqueClasses = new Set(schedule.map(s => s.class)).size;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">My Schedule</h1>
                    <p className="text-gray-600 mt-1">
                        {totalClasses} classes/week across {uniqueClasses} sections
                    </p>
                </div>
                <Link
                    href="/teacher"
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                    ← Back to Dashboard
                </Link>
            </div>

            {/* Weekly Timetable Grid */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px]">
                        <thead className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white">
                            <tr>
                                <th className="px-4 py-3 text-left text-sm font-semibold">Period</th>
                                {[1, 2, 3, 4, 5].map(day => (
                                    <th key={day} className="px-4 py-3 text-center text-sm font-semibold">
                                        {dayNames[day]}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {periods.map(period => (
                                <tr key={period} className="hover:bg-gray-50">
                                    <td className="px-4 py-4 font-medium text-gray-700">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">P{period}</span>
                                        </div>
                                    </td>
                                    {[1, 2, 3, 4, 5].map(day => {
                                        const slot = getSlot(day, period);
                                        return (
                                            <td key={day} className="px-2 py-2">
                                                {slot ? (
                                                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center hover:shadow-md transition-shadow">
                                                        <p className="font-semibold text-emerald-700">{slot.class}</p>
                                                        <p className="text-xs text-gray-500">{slot.subject}</p>
                                                        <p className="text-xs text-gray-400">{slot.room}</p>
                                                        <p className="text-xs text-emerald-600 mt-1">
                                                            {slot.startTime} - {slot.endTime}
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <div className="bg-gray-50 rounded-lg p-3 text-center text-gray-300">
                                                        —
                                                    </div>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Legend */}
            <div className="flex gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-emerald-50 border border-emerald-200 rounded"></div>
                    <span>Scheduled Class</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-gray-50 rounded"></div>
                    <span>Free Period</span>
                </div>
            </div>
        </div>
    );
}
