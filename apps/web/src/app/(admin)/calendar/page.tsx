'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface CalendarEvent {
    id: string;
    title: string;
    type: 'HOLIDAY' | 'EXAM' | 'EVENT' | 'PTM' | 'DEADLINE';
    date: string;
    endDate?: string;
    description?: string;
    forClasses?: string[];
}

const mockEvents: CalendarEvent[] = [
    { id: 'e1', title: 'Republic Day', type: 'HOLIDAY', date: '2026-01-26', description: 'National holiday' },
    { id: 'e2', title: 'PTM - Classes 9-12', type: 'PTM', date: '2026-01-25', description: 'Parent-Teacher Meeting', forClasses: ['9', '10', '11', '12'] },
    { id: 'e3', title: 'Term 2 Exams Begin', type: 'EXAM', date: '2026-02-15', endDate: '2026-02-28', description: 'Final examinations for Term 2' },
    { id: 'e4', title: 'Sports Day', type: 'EVENT', date: '2026-02-05', description: 'Annual sports day celebration' },
    { id: 'e5', title: 'Fee Payment Deadline', type: 'DEADLINE', date: '2026-01-31', description: 'Last date for Term 2 fee payment' },
    { id: 'e6', title: 'Science Exhibition', type: 'EVENT', date: '2026-02-10', description: 'Inter-school science exhibition' },
    { id: 'e7', title: 'Maha Shivaratri', type: 'HOLIDAY', date: '2026-02-26', description: 'Festival holiday' },
    { id: 'e8', title: 'Holi', type: 'HOLIDAY', date: '2026-03-14', description: 'Festival holiday' },
    { id: 'e9', title: 'Annual Day', type: 'EVENT', date: '2026-03-20', description: 'Annual day celebration' },
    { id: 'e10', title: 'Board Exams - Class 10', type: 'EXAM', date: '2026-03-01', endDate: '2026-03-20', forClasses: ['10'] },
];

const months = [
    { name: 'January', days: 31, startDay: 3 }, // Wed
    { name: 'February', days: 28, startDay: 6 }, // Sat
    { name: 'March', days: 31, startDay: 0 }, // Sun
];

export default function CalendarPage() {
    const [currentMonth, setCurrentMonth] = useState(0); // 0 = January
    const [selectedDate, setSelectedDate] = useState<string | null>(null);

    const month = months[currentMonth];
    const year = 2026;

    const getEventsForDate = (date: string) => {
        return mockEvents.filter(e => {
            if (e.date === date) return true;
            if (e.endDate && date >= e.date && date <= e.endDate) return true;
            return false;
        });
    };

    const getTypeBadge = (type: CalendarEvent['type']) => {
        const colors: Record<string, string> = {
            HOLIDAY: 'bg-red-100 text-red-700',
            EXAM: 'bg-purple-100 text-purple-700',
            EVENT: 'bg-blue-100 text-blue-700',
            PTM: 'bg-green-100 text-green-700',
            DEADLINE: 'bg-orange-100 text-orange-700',
        };
        return <Badge className={colors[type]}>{type}</Badge>;
    };

    const getDayColor = (date: string) => {
        const events = getEventsForDate(date);
        if (events.some(e => e.type === 'HOLIDAY')) return 'bg-red-100 text-red-700';
        if (events.some(e => e.type === 'EXAM')) return 'bg-purple-100 text-purple-700';
        if (events.some(e => e.type === 'EVENT')) return 'bg-blue-100';
        if (events.length > 0) return 'bg-yellow-100';
        return '';
    };

    // Generate calendar days
    const calendarDays = [];
    for (let i = 0; i < month.startDay; i++) {
        calendarDays.push(null); // Empty cells before month starts
    }
    for (let day = 1; day <= month.days; day++) {
        const dateStr = `${year}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        calendarDays.push({ day, date: dateStr });
    }

    const selectedEvents = selectedDate ? getEventsForDate(selectedDate) : [];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Academic Calendar</h1>
                    <p className="text-gray-600 mt-1">School events, holidays, and important dates</p>
                </div>
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    + Add Event
                </button>
            </div>

            {/* Legend */}
            <div className="flex gap-4 flex-wrap">
                {['HOLIDAY', 'EXAM', 'EVENT', 'PTM', 'DEADLINE'].map(type => (
                    <div key={type} className="flex items-center gap-2">
                        {getTypeBadge(type as CalendarEvent['type'])}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Calendar */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <button
                                onClick={() => setCurrentMonth(Math.max(0, currentMonth - 1))}
                                className="px-3 py-1 border rounded hover:bg-gray-50"
                                disabled={currentMonth === 0}
                            >
                                ←
                            </button>
                            <CardTitle>{month.name} {year}</CardTitle>
                            <button
                                onClick={() => setCurrentMonth(Math.min(2, currentMonth + 1))}
                                className="px-3 py-1 border rounded hover:bg-gray-50"
                                disabled={currentMonth === 2}
                            >
                                →
                            </button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-7 gap-1">
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                                <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
                                    {day}
                                </div>
                            ))}
                            {calendarDays.map((d, idx) => (
                                <div
                                    key={idx}
                                    onClick={() => d && setSelectedDate(d.date)}
                                    className={`
                                        aspect-square p-1 border rounded-lg cursor-pointer transition-colors
                                        ${d ? `hover:bg-gray-100 ${getDayColor(d.date)}` : ''}
                                        ${selectedDate === d?.date ? 'ring-2 ring-blue-500' : ''}
                                    `}
                                >
                                    {d && (
                                        <>
                                            <div className="text-center font-medium">{d.day}</div>
                                            {getEventsForDate(d.date).length > 0 && (
                                                <div className="flex justify-center gap-0.5 mt-1">
                                                    {getEventsForDate(d.date).slice(0, 3).map((_, i) => (
                                                        <div key={i} className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Events Panel */}
                <Card>
                    <CardHeader>
                        <CardTitle>
                            {selectedDate
                                ? `Events on ${new Date(selectedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                                : 'Upcoming Events'
                            }
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {selectedEvents.length > 0 ? (
                            <div className="space-y-3">
                                {selectedEvents.map(event => (
                                    <div key={event.id} className="p-3 bg-gray-50 rounded-lg">
                                        <div className="flex items-center gap-2 mb-1">
                                            {getTypeBadge(event.type)}
                                        </div>
                                        <h4 className="font-semibold">{event.title}</h4>
                                        {event.description && (
                                            <p className="text-sm text-gray-600 mt-1">{event.description}</p>
                                        )}
                                        {event.forClasses && (
                                            <p className="text-xs text-gray-500 mt-1">For: Classes {event.forClasses.join(', ')}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {mockEvents.slice(0, 5).map(event => (
                                    <div key={event.id} className="p-3 bg-gray-50 rounded-lg">
                                        <div className="flex items-center justify-between">
                                            <h4 className="font-medium text-sm">{event.title}</h4>
                                            <span className="text-xs text-gray-500">
                                                {new Date(event.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                            </span>
                                        </div>
                                        <div className="mt-1">{getTypeBadge(event.type)}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
