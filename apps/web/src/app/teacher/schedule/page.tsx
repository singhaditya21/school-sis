import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import {
    getSchedulePeriods,
    getMyScheduleForDay,
    getMyCoverForDate,
    type Weekday,
} from '../_actions/schedule';

export const dynamic = 'force-dynamic';

const WEEKDAYS: Weekday[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

function titleCase(day: string): string {
    return day.charAt(0) + day.slice(1).toLowerCase();
}

export default async function TeacherSchedulePage({
    searchParams,
}: {
    searchParams: Promise<{ day?: string }>;
}) {
    const params = await searchParams;
    const now = new Date();
    const todayDate = now.toISOString().split('T')[0];

    // getDay() is 0 for Sunday, which the day_of_week enum has no value for.
    // The old page silently reported Sunday as "Monday"; it now says so.
    const todayIndex = now.getDay() - 1;
    const todayWeekday: Weekday | null = todayIndex >= 0 ? WEEKDAYS[todayIndex] ?? null : null;

    const requested = (params?.day ?? '').toUpperCase();
    const selectedDay: Weekday = WEEKDAYS.includes(requested as Weekday)
        ? (requested as Weekday)
        : (todayWeekday ?? 'MONDAY');

    const isToday = todayWeekday === selectedDay;

    const [periods, entries, cover] = await Promise.all([
        getSchedulePeriods(),
        getMyScheduleForDay(selectedDay),
        // Cover is recorded against a calendar date, so it is only meaningful for today.
        isToday ? getMyCoverForDate(todayDate) : Promise.resolve([]),
    ]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">My Schedule</h1>
                <p className="text-muted-foreground">
                    {todayWeekday === null
                        ? `Today is Sunday (${todayDate}) — the timetable only runs Monday to Saturday. Showing ${titleCase(selectedDay)}.`
                        : isToday
                          ? `${titleCase(selectedDay)}, ${todayDate}`
                          : `${titleCase(selectedDay)} (not today — cover is only shown for the current date)`}
                </p>
            </div>

            <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((day) => (
                    <Link
                        key={day}
                        href={`/teacher/schedule?day=${day}`}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                            day === selectedDay
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white text-foreground border-border hover:bg-muted'
                        }`}
                    >
                        {titleCase(day)}
                    </Link>
                ))}
            </div>

            <div className="bg-white rounded-xl shadow-sm border">
                <div className="p-4 border-b">
                    <h2 className="font-semibold">Periods</h2>
                </div>
                <div className="divide-y" data-testid="teacher-schedule-list">
                    {periods.map((period) => {
                        const regular = entries.find((e) => e.periodId === period.periodId);
                        const namedNumber = parseInt(period.name.replace(/\D/g, ''), 10);
                        const substitution = cover.find(
                            (c) => c.period === period.displayOrder || c.period === namedNumber
                        );

                        return (
                            <div
                                key={period.periodId}
                                className={`p-4 ${period.isBreak ? 'bg-yellow-50' : ''}`}
                                data-testid={`schedule-period-${period.displayOrder}`}
                            >
                                <div className="flex justify-between items-start gap-4">
                                    <div>
                                        <p className="font-medium text-foreground">{period.name}</p>
                                        <p className="text-sm text-muted-foreground">
                                            {period.startTime} – {period.endTime}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        {substitution ? (
                                            <div className="space-y-1">
                                                <Badge
                                                    className="bg-green-600 text-white"
                                                    data-testid="substitution-badge"
                                                >
                                                    Cover
                                                </Badge>
                                                <p className="text-sm font-semibold text-green-700">
                                                    {substitution.reason ?? 'Reason not recorded'}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    Class: {substitution.className}
                                                </p>
                                                {substitution.sectionId && (
                                                    <Link
                                                        href={`/teacher/attendance/${substitution.sectionId}`}
                                                        className="text-xs text-emerald-700 hover:underline"
                                                    >
                                                        Mark attendance
                                                    </Link>
                                                )}
                                            </div>
                                        ) : regular ? (
                                            <div className="space-y-1">
                                                <p className="text-sm font-semibold text-blue-700">
                                                    {regular.subjectName}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    Class: {regular.className}
                                                </p>
                                                {regular.roomNumber && (
                                                    <p className="text-xs text-muted-foreground">
                                                        Room {regular.roomNumber}
                                                    </p>
                                                )}
                                                <Link
                                                    href={`/teacher/attendance/${regular.sectionId}`}
                                                    className="text-xs text-emerald-700 hover:underline"
                                                >
                                                    Mark attendance
                                                </Link>
                                            </div>
                                        ) : period.isBreak ? (
                                            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded">
                                                Break
                                            </span>
                                        ) : (
                                            <span className="text-xs text-muted-foreground italic">Free period</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {periods.length === 0 && (
                        <div className="p-8 text-center text-muted-foreground">
                            No periods have been configured for this school, so no timetable can be shown.
                        </div>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap gap-4 text-sm">
                <Link href="/teacher/my-classes" className="text-blue-600 hover:underline">
                    My classes
                </Link>
                <Link href="/teacher/attendance" className="text-blue-600 hover:underline">
                    Attendance
                </Link>
                <Link href="/teacher/gradebook" className="text-blue-600 hover:underline">
                    Gradebook
                </Link>
                <Link href="/teacher/homework" className="text-blue-600 hover:underline">
                    Homework
                </Link>
                <Link href="/teacher/lesson-plans" className="text-blue-600 hover:underline">
                    Lesson plans
                </Link>
                <Link href="/teacher/profile" className="text-blue-600 hover:underline">
                    My profile
                </Link>
            </div>
        </div>
    );
}
