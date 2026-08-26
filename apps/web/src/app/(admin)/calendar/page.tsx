import { getCalendarSummary, getEventsInRange, getUpcomingEvents } from './actions';
import { daysInMonth, isoDay } from './types';
import CalendarClient from './calendar-client';

export const dynamic = 'force-dynamic';

function parseMonth(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : fallback;
}

function parseYear(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 1970 && parsed <= 2100 ? parsed : fallback;
}

export default async function CalendarPage({
    searchParams,
}: {
    searchParams: Promise<{ month?: string; year?: string }>;
}) {
    const params = await searchParams;
    const today = new Date();
    const month = parseMonth(params.month, today.getMonth() + 1);
    const year = parseYear(params.year, today.getFullYear());

    const from = isoDay(year, month, 1);
    const to = isoDay(year, month, daysInMonth(year, month));

    const [events, upcoming, summary] = await Promise.all([
        getEventsInRange(from, to),
        getUpcomingEvents(12),
        getCalendarSummary(),
    ]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Academic calendar</h1>
                <p className="mt-1 text-slate-600">
                    Holidays, exams, parent-teacher meetings, and school events.
                </p>
            </div>

            <CalendarClient
                year={year}
                month={month}
                events={events}
                upcoming={upcoming}
                summary={summary}
                todayIso={isoDay(today.getFullYear(), today.getMonth() + 1, today.getDate())}
            />
        </div>
    );
}
