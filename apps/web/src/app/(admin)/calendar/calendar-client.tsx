'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { removeEvent, saveEvent } from './actions';
import {
    AUDIENCE_TYPES,
    EVENT_TYPES,
    EVENT_TYPE_LABEL,
    daysInMonth,
    eventCoversDay,
    firstWeekday,
    formatDayRange,
    isoDay,
    monthLabel,
    typeIcon,
    typeLabel,
    typeStyle,
    type AudienceType,
    type CalendarEvent,
    type CalendarSummary,
    type EventType,
} from './types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type FormState = {
    id?: string;
    title: string;
    description: string;
    eventType: EventType;
    startDate: string;
    endDate: string;
    isAllDay: boolean;
    startTime: string;
    endTime: string;
    venue: string;
    audienceType: AudienceType;
};

function blankForm(startDate: string): FormState {
    return {
        title: '',
        description: '',
        eventType: 'ACADEMIC',
        startDate,
        endDate: '',
        isAllDay: true,
        startTime: '',
        endTime: '',
        venue: '',
        audienceType: 'ALL',
    };
}

function formFromEvent(event: CalendarEvent): FormState {
    return {
        id: event.id,
        title: event.title,
        description: event.description ?? '',
        eventType: event.eventType,
        startDate: event.startDate,
        endDate: event.endDate ?? '',
        isAllDay: event.isAllDay,
        startTime: event.startTime ?? '',
        endTime: event.endTime ?? '',
        venue: event.venue ?? '',
        audienceType: event.audienceType,
    };
}

export default function CalendarClient({
    year,
    month,
    events,
    upcoming,
    summary,
    todayIso,
}: {
    year: number;
    month: number;
    events: CalendarEvent[];
    upcoming: CalendarEvent[];
    summary: CalendarSummary;
    todayIso: string;
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [form, setForm] = useState<FormState | null>(null);
    const [armedForDelete, setArmedForDelete] = useState<string | null>(null);
    const [typeFilter, setTypeFilter] = useState<string>('ALL');

    const filtered = useMemo(
        () => (typeFilter === 'ALL' ? events : events.filter((e) => e.eventType === typeFilter)),
        [events, typeFilter],
    );

    const cells = useMemo(() => {
        const total = daysInMonth(year, month);
        const offset = firstWeekday(year, month);
        const grid: { day: number | null; iso: string | null }[] = [];
        for (let i = 0; i < offset; i += 1) grid.push({ day: null, iso: null });
        for (let day = 1; day <= total; day += 1) {
            grid.push({ day, iso: isoDay(year, month, day) });
        }
        while (grid.length % 7 !== 0) grid.push({ day: null, iso: null });
        return grid;
    }, [year, month]);

    const prev = month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
    const next = month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year };

    function eventsOn(iso: string): CalendarEvent[] {
        return filtered.filter((event) => eventCoversDay(event, iso));
    }

    function submit() {
        if (!form) return;
        startTransition(async () => {
            const result = await saveEvent({
                id: form.id,
                title: form.title,
                description: form.description,
                eventType: form.eventType,
                startDate: form.startDate,
                endDate: form.endDate || undefined,
                isAllDay: form.isAllDay,
                startTime: form.startTime || undefined,
                endTime: form.endTime || undefined,
                venue: form.venue,
                audienceType: form.audienceType,
            });
            if (result.success) {
                toast.success(form.id ? 'Event updated' : 'Event added to the calendar');
                setForm(null);
                router.refresh();
            } else {
                toast.error(result.error || 'Could not save the event.');
            }
        });
    }

    function destroy(event: CalendarEvent) {
        if (armedForDelete !== event.id) {
            setArmedForDelete(event.id);
            return;
        }
        startTransition(async () => {
            const result = await removeEvent(event.id);
            if (result.success) {
                toast.success(`"${event.title}" removed`);
                setForm(null);
                router.refresh();
            } else {
                toast.error(result.error || 'Could not remove the event.');
            }
            setArmedForDelete(null);
        });
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <SummaryTile label="Events on record" value={summary.total} />
                <SummaryTile label="Still upcoming" value={summary.upcoming} />
                <SummaryTile label="Holidays" value={summary.byType.HOLIDAY ?? 0} />
                <SummaryTile label="Exam days" value={summary.byType.EXAM ?? 0} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Link
                        href={`/calendar?month=${prev.month}&year=${prev.year}`}
                        className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
                        aria-label="Previous month"
                    >
                        ←
                    </Link>
                    <h2 className="min-w-52 text-center text-lg font-semibold">
                        {monthLabel(year, month)}
                    </h2>
                    <Link
                        href={`/calendar?month=${next.month}&year=${next.year}`}
                        className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
                        aria-label="Next month"
                    >
                        →
                    </Link>
                    <Link
                        href="/calendar"
                        className="ml-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
                    >
                        Today
                    </Link>
                </div>

                <div className="flex items-center gap-3">
                    <select
                        value={typeFilter}
                        onChange={(event) => setTypeFilter(event.target.value)}
                        className="h-9 rounded-md border border-border px-3 text-sm"
                        aria-label="Filter by event type"
                    >
                        <option value="ALL">All event types</option>
                        {EVENT_TYPES.map((type) => (
                            <option key={type} value={type}>
                                {EVENT_TYPE_LABEL[type]}
                            </option>
                        ))}
                    </select>
                    <Button onClick={() => setForm(blankForm(isoDay(year, month, 1)))}>
                        Add event
                    </Button>
                </div>
            </div>

            {form && (
                <Card>
                    <CardContent className="space-y-4 pt-6">
                        <h3 className="font-semibold">{form.id ? 'Edit event' : 'New event'}</h3>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="md:col-span-2">
                                <Label htmlFor="event-title">Title</Label>
                                <Input
                                    id="event-title"
                                    value={form.title}
                                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                                    placeholder="Half-yearly examinations"
                                />
                            </div>

                            <div>
                                <Label htmlFor="event-type">Type</Label>
                                <select
                                    id="event-type"
                                    value={form.eventType}
                                    onChange={(e) =>
                                        setForm({ ...form, eventType: e.target.value as EventType })
                                    }
                                    className="mt-1 h-9 w-full rounded-md border border-border px-3 text-sm"
                                >
                                    {EVENT_TYPES.map((type) => (
                                        <option key={type} value={type}>
                                            {EVENT_TYPE_LABEL[type]}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <Label htmlFor="event-audience">Audience</Label>
                                <select
                                    id="event-audience"
                                    value={form.audienceType}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            audienceType: e.target.value as AudienceType,
                                        })
                                    }
                                    className="mt-1 h-9 w-full rounded-md border border-border px-3 text-sm"
                                >
                                    {AUDIENCE_TYPES.map((audience) => (
                                        <option key={audience} value={audience}>
                                            {audience.charAt(0) + audience.slice(1).toLowerCase()}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <Label htmlFor="event-start">Start date</Label>
                                <Input
                                    id="event-start"
                                    type="date"
                                    value={form.startDate}
                                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                                />
                            </div>

                            <div>
                                <Label htmlFor="event-end">End date (optional)</Label>
                                <Input
                                    id="event-end"
                                    type="date"
                                    value={form.endDate}
                                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                                />
                            </div>

                            <div className="md:col-span-2">
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4"
                                        checked={form.isAllDay}
                                        onChange={(e) =>
                                            setForm({ ...form, isAllDay: e.target.checked })
                                        }
                                    />
                                    All-day event
                                </label>
                            </div>

                            {!form.isAllDay && (
                                <>
                                    <div>
                                        <Label htmlFor="event-start-time">Start time</Label>
                                        <Input
                                            id="event-start-time"
                                            type="time"
                                            value={form.startTime}
                                            onChange={(e) =>
                                                setForm({ ...form, startTime: e.target.value })
                                            }
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="event-end-time">End time</Label>
                                        <Input
                                            id="event-end-time"
                                            type="time"
                                            value={form.endTime}
                                            onChange={(e) =>
                                                setForm({ ...form, endTime: e.target.value })
                                            }
                                        />
                                    </div>
                                </>
                            )}

                            <div className="md:col-span-2">
                                <Label htmlFor="event-venue">Venue (optional)</Label>
                                <Input
                                    id="event-venue"
                                    value={form.venue}
                                    onChange={(e) => setForm({ ...form, venue: e.target.value })}
                                    placeholder="Main auditorium"
                                />
                            </div>

                            <div className="md:col-span-2">
                                <Label htmlFor="event-description">Description (optional)</Label>
                                <Textarea
                                    id="event-description"
                                    rows={3}
                                    value={form.description}
                                    onChange={(e) =>
                                        setForm({ ...form, description: e.target.value })
                                    }
                                />
                            </div>
                        </div>

                        <p className="text-xs text-muted-foreground">
                            Saving an event records it on the calendar. It does not notify anyone —
                            announcements are composed separately under Messages.
                        </p>

                        <div className="flex flex-wrap gap-3">
                            <Button onClick={submit} disabled={pending || !form.title.trim()}>
                                {pending ? 'Saving…' : form.id ? 'Save changes' : 'Add event'}
                            </Button>
                            <Button variant="outline" onClick={() => setForm(null)} disabled={pending}>
                                Cancel
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardContent className="p-0">
                    <div className="grid grid-cols-7 border-b bg-muted text-center text-xs font-medium uppercase text-muted-foreground">
                        {WEEKDAYS.map((day) => (
                            <div key={day} className="px-2 py-2">
                                {day}
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7">
                        {cells.map((cell, index) => {
                            if (!cell.iso || cell.day === null) {
                                return (
                                    <div
                                        key={`blank-${index}`}
                                        className="min-h-28 border-b border-r bg-muted/60"
                                    />
                                );
                            }
                            const dayEvents = eventsOn(cell.iso);
                            const isToday = cell.iso === todayIso;
                            return (
                                <div
                                    key={cell.iso}
                                    className={`min-h-28 border-b border-r p-1.5 ${
                                        isToday ? 'bg-blue-50/60' : ''
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span
                                            className={`text-xs font-medium ${
                                                isToday
                                                    ? 'rounded-full bg-blue-600 px-1.5 py-0.5 text-white'
                                                    : 'text-muted-foreground'
                                            }`}
                                        >
                                            {cell.day}
                                        </span>
                                        <button
                                            type="button"
                                            aria-label={`Add event on ${cell.iso}`}
                                            className="text-xs text-slate-300 hover:text-foreground"
                                            onClick={() => setForm(blankForm(cell.iso as string))}
                                        >
                                            +
                                        </button>
                                    </div>
                                    <div className="mt-1 space-y-1">
                                        {dayEvents.slice(0, 3).map((event) => (
                                            <button
                                                key={event.id}
                                                type="button"
                                                onClick={() => setForm(formFromEvent(event))}
                                                className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium ${
                                                    typeStyle(event.eventType).chip
                                                }`}
                                                title={`${typeLabel(event.eventType)}: ${event.title}`}
                                            >
                                                {event.title}
                                            </button>
                                        ))}
                                        {dayEvents.length > 3 && (
                                            <span className="block px-1.5 text-[10px] text-muted-foreground">
                                                +{dayEvents.length - 3} more
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-0">
                    <div className="border-b p-4">
                        <h2 className="font-bold">Upcoming events</h2>
                        <p className="text-xs text-muted-foreground">
                            The next dated entries from today onward, across all months.
                        </p>
                    </div>
                    <div className="divide-y">
                        {upcoming.map((event) => (
                            <div
                                key={event.id}
                                className={`flex items-start gap-4 border-l-4 p-4 ${
                                    typeStyle(event.eventType).border
                                }`}
                            >
                                <div className="text-2xl" aria-hidden="true">
                                    {typeIcon(event.eventType)}
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-semibold">{event.title}</h3>
                                    {event.description && (
                                        <p className="mt-1 text-sm text-muted-foreground">{event.description}</p>
                                    )}
                                    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                                        <span>📅 {formatDayRange(event)}</span>
                                        {event.venue && <span>📍 {event.venue}</span>}
                                        {!event.isAllDay && event.startTime && (
                                            <span>
                                                🕐 {event.startTime}
                                                {event.endTime ? ` – ${event.endTime}` : ''}
                                            </span>
                                        )}
                                        <span>👥 {event.audienceType}</span>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <span
                                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                            typeStyle(event.eventType).chip
                                        }`}
                                    >
                                        {typeLabel(event.eventType)}
                                    </span>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setForm(formFromEvent(event))}
                                        >
                                            Edit
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="text-rose-600 hover:bg-rose-50"
                                            disabled={pending}
                                            onClick={() => destroy(event)}
                                        >
                                            {armedForDelete === event.id ? 'Confirm' : 'Delete'}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {upcoming.length === 0 && (
                            <div className="p-12 text-center text-muted-foreground">
                                No upcoming events on the calendar.
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-lg border bg-white p-4">
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="mt-1 text-2xl font-bold text-foreground">{value}</div>
        </div>
    );
}
