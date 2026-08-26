import Link from 'next/link';
import { getMyAttendanceMonth } from '../_lib/queries';
import { AccountNotLinked } from '../_components/AccountNotLinked';

export const dynamic = 'force-dynamic';

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

const STATUS_STYLES: Record<string, string> = {
    PRESENT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    ABSENT: 'bg-red-50 text-red-700 border-red-200',
    LATE: 'bg-amber-50 text-amber-700 border-amber-200',
    HALF_DAY: 'bg-sky-50 text-sky-700 border-sky-200',
    EXCUSED: 'bg-violet-50 text-violet-700 border-violet-200',
    HOLIDAY: 'bg-slate-100 text-slate-500 border-slate-200',
};

function parseIntInRange(value: string | undefined, fallback: number, min: number, max: number): number {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export default async function StudentAttendancePage({
    searchParams,
}: {
    searchParams: Promise<{ month?: string; year?: string }>;
}) {
    const params = await searchParams;
    const now = new Date();
    const year = parseIntInRange(params.year, now.getFullYear(), 2000, 2100);
    const month = parseIntInRange(params.month, now.getMonth() + 1, 1, 12);

    const data = await getMyAttendanceMonth(year, month);

    if (!data) {
        return <AccountNotLinked what="attendance" />;
    }

    const { attendance } = data;
    const rate = attendance.marked > 0
        ? Math.round(((attendance.present + attendance.late + attendance.halfDay) / attendance.marked) * 100)
        : null;

    const prev = month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
    const next = month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year };

    const daysInMonth = new Date(year, month, 0).getDate();
    const byDay = new Map(attendance.records.map((r) => [Number(r.date.slice(8, 10)), r]));

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-gray-200 pb-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">My attendance</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Marked by your class teacher. Only your own record is shown.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        href={`/student/attendance?month=${prev.month}&year=${prev.year}`}
                        className="rounded-md border bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                        ← Prev
                    </Link>
                    <span className="w-40 text-center text-sm font-medium text-gray-700">
                        {MONTH_NAMES[month - 1]} {year}
                    </span>
                    <Link
                        href={`/student/attendance?month=${next.month}&year=${next.year}`}
                        className="rounded-md border bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                        Next →
                    </Link>
                </div>
            </div>

            {attendance.marked === 0 ? (
                <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-500">
                    No attendance was marked for you in {MONTH_NAMES[month - 1]} {year}.
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Stat label="Present" value={attendance.present} />
                        <Stat label="Absent" value={attendance.absent} />
                        <Stat label="Late" value={attendance.late} />
                        <Stat label="Attendance rate" value={rate === null ? '—' : `${rate}%`} />
                    </div>

                    <div className="rounded-xl border bg-white p-6">
                        <h2 className="mb-4 text-sm font-semibold text-gray-800">Daily record</h2>
                        <div className="grid grid-cols-7 gap-2">
                            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                                const record = byDay.get(day);
                                return (
                                    <div
                                        key={day}
                                        title={record?.remarks ?? undefined}
                                        className={`aspect-square flex flex-col items-center justify-center rounded-md border text-sm font-medium ${
                                            record ? STATUS_STYLES[record.status] ?? 'bg-white text-gray-500 border-gray-100' : 'bg-white text-gray-300 border-gray-100'
                                        }`}
                                    >
                                        <span>{day}</span>
                                        {record && (
                                            <span className="mt-0.5 text-[9px] font-semibold uppercase opacity-70">
                                                {record.status.replace('_', ' ').slice(0, 3)}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <p className="mt-4 text-xs text-gray-400">
                            Blank squares are days with no attendance mark on record.
                        </p>
                    </div>
                </>
            )}
        </div>
    );
}

function Stat({ label, value }: { label: string; value: number | string }) {
    return (
        <div className="rounded-xl border bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">{label}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
        </div>
    );
}
