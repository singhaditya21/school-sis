import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMySection } from '../../_actions/classes';
import { getMyAttendanceRoll } from '../../_actions/attendance';
import { AttendanceSheet } from '../../_components/AttendanceSheet';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function MarkMyAttendancePage({
    params,
    searchParams,
}: {
    params: Promise<{ sectionId: string }>;
    searchParams: Promise<{ date?: string }>;
}) {
    const { sectionId } = await params;
    const query = await searchParams;
    const today = new Date().toISOString().split('T')[0];
    const date = query?.date && DATE_RE.test(query.date) ? query.date : today;

    // Null covers both "no such section" and "not yours" — a teacher must not be
    // able to probe another class's roll by pasting an id.
    const section = await getMySection(sectionId);
    if (!section) notFound();

    const roll = await getMyAttendanceRoll(sectionId, date);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">
                        {section.gradeName} – {section.sectionName}
                    </h1>
                    <p className="text-muted-foreground">Attendance for {date}</p>
                </div>
                <div className="flex items-end gap-3">
                    <form method="GET" className="flex items-end gap-2">
                        <label className="text-sm text-muted-foreground">
                            <span className="block mb-1">Date</span>
                            <input
                                type="date"
                                name="date"
                                defaultValue={date}
                                className="border border-border rounded-lg px-3 py-2 text-sm"
                            />
                        </label>
                        <button
                            type="submit"
                            className="bg-white border border-border text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted"
                        >
                            Show
                        </button>
                    </form>
                    <Link href="/teacher/attendance" className="text-sm text-blue-600 hover:underline pb-2">
                        ← All classes
                    </Link>
                </div>
            </div>

            <AttendanceSheet sectionId={sectionId} date={date} roll={roll} />
        </div>
    );
}
