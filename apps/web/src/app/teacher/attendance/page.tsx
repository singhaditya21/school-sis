import Link from 'next/link';
import { getMyClasses } from '../_actions/classes';
import { getMyAttendanceSummary } from '../_actions/attendance';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function TeacherAttendancePage({
    searchParams,
}: {
    searchParams: Promise<{ date?: string }>;
}) {
    const params = await searchParams;
    const today = new Date().toISOString().split('T')[0];
    const date = params?.date && DATE_RE.test(params.date) ? params.date : today;

    const [classes, summaries] = await Promise.all([getMyClasses(), getMyAttendanceSummary(date)]);
    const summaryBySection = new Map(summaries.map((s) => [s.sectionId, s]));

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Attendance</h1>
                    <p className="text-muted-foreground">Your sections only. Pick a class to open its roll.</p>
                </div>
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
                        className="bg-card border border-border text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted"
                    >
                        Show
                    </button>
                </form>
            </div>

            {classes.length === 0 ? (
                <div className="bg-card rounded-xl shadow-sm border p-8 text-center">
                    <p className="font-medium text-foreground">No classes are assigned to your account.</p>
                    <p className="text-sm text-muted-foreground mt-2">
                        Attendance can only be marked for a section you are the class teacher of, or hold a
                        timetabled period in.
                    </p>
                </div>
            ) : (
                <div className="bg-card rounded-xl shadow-sm border divide-y">
                    {classes.map((cls) => {
                        const summary = summaryBySection.get(cls.sectionId);
                        const marked = summary?.marked ?? 0;
                        return (
                            <div
                                key={cls.sectionId}
                                className="p-4 flex flex-wrap items-center justify-between gap-3"
                            >
                                <div>
                                    <p className="font-medium text-foreground">
                                        {cls.gradeName} – {cls.sectionName}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {marked > 0
                                            ? `${marked} of ${cls.studentCount} marked · ${summary?.present ?? 0} present, ${summary?.absent ?? 0} absent, ${summary?.late ?? 0} late`
                                            : `${cls.studentCount} students · nothing recorded on ${date}`}
                                    </p>
                                </div>
                                <Link
                                    href={`/teacher/attendance/${cls.sectionId}?date=${date}`}
                                    className="text-sm font-medium text-emerald-700 hover:underline"
                                >
                                    {marked > 0 ? 'Review roll' : 'Mark roll'} →
                                </Link>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
