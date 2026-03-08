import { Card, CardContent } from '@/components/ui/card';
import { getEvents, getUpcomingEvents } from '@/lib/actions/calendar';

export default async function CalendarPage() {
    const [allEvents, upcoming] = await Promise.all([
        getEvents(),
        getUpcomingEvents(15),
    ]);

    const typeColor = (t: string) => {
        const m: Record<string, string> = {
            HOLIDAY: 'bg-red-100 text-red-700 border-red-200',
            EXAM: 'bg-purple-100 text-purple-700 border-purple-200',
            PTM: 'bg-blue-100 text-blue-700 border-blue-200',
            SPORTS_DAY: 'bg-green-100 text-green-700 border-green-200',
            CULTURAL: 'bg-pink-100 text-pink-700 border-pink-200',
            ACADEMIC: 'bg-indigo-100 text-indigo-700 border-indigo-200',
            OTHER: 'bg-gray-100 text-gray-700 border-gray-200',
        };
        return m[t] || 'bg-gray-100 text-gray-700 border-gray-200';
    };

    const typeIcon = (t: string) => {
        const m: Record<string, string> = { HOLIDAY: '🏖️', EXAM: '📝', PTM: '👨‍👩‍👧', SPORTS_DAY: '⚽', CULTURAL: '🎭', ACADEMIC: '📚', OTHER: '📋' };
        return m[t] || '📋';
    };

    const holidays = allEvents.filter(e => e.eventType === 'HOLIDAY').length;
    const exams = allEvents.filter(e => e.eventType === 'EXAM').length;
    const ptms = allEvents.filter(e => e.eventType === 'PTM').length;

    return (
        <div className="space-y-6">
            <div><h1 className="text-3xl font-bold">Academic Calendar</h1><p className="text-gray-600 mt-1">Events, holidays, and academic schedule</p></div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Total Events</div><div className="text-2xl font-bold text-blue-600">{allEvents.length}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Holidays</div><div className="text-2xl font-bold text-red-600">{holidays}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Exams</div><div className="text-2xl font-bold text-purple-600">{exams}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">PTMs</div><div className="text-2xl font-bold text-green-600">{ptms}</div></CardContent></Card>
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="p-4 border-b"><h3 className="font-bold">Upcoming Events</h3></div>
                    <div className="divide-y">
                        {upcoming.map(event => (
                            <div key={event.id} className={`p-4 flex items-start gap-4 border-l-4 ${typeColor(event.eventType)}`}>
                                <div className="text-2xl">{typeIcon(event.eventType)}</div>
                                <div className="flex-1">
                                    <h4 className="font-semibold">{event.title}</h4>
                                    {event.description && <p className="text-sm text-gray-600 mt-1">{event.description}</p>}
                                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                        <span>📅 {event.startDate}{event.endDate && event.endDate !== event.startDate ? ` → ${event.endDate}` : ''}</span>
                                        {event.venue && <span>📍 {event.venue}</span>}
                                        {!event.isAllDay && event.startTime && <span>🕐 {event.startTime}{event.endTime ? ` - ${event.endTime}` : ''}</span>}
                                    </div>
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColor(event.eventType)}`}>{event.eventType}</span>
                            </div>
                        ))}
                        {upcoming.length === 0 && <div className="p-12 text-center text-gray-400">No upcoming events. Add your first event!</div>}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
