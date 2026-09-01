import Link from 'next/link';
import { getMyClasses } from '../_actions/classes';
import { getMyAttendanceSummary } from '../_actions/attendance';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export default async function TeacherClassesPage() {
    const today = new Date().toISOString().split('T')[0];
    const [classes, summaries] = await Promise.all([
        getMyClasses(),
        getMyAttendanceSummary(today),
    ]);

    const summaryBySection = new Map(summaries.map((s) => [s.sectionId, s]));

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">My Classes</h1>
                <p className="text-muted-foreground">
                    Sections where you are the class teacher or hold at least one timetabled period.
                </p>
            </div>

            {classes.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
                    <p className="font-medium text-foreground">No classes are assigned to your account.</p>
                    <p className="text-sm text-muted-foreground mt-2 max-w-lg mx-auto">
                        A class reaches this page once the office makes you the class teacher of a section,
                        or puts you on the timetable for one. Until then there is nothing here to show.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {classes.map((cls) => {
                        const summary = summaryBySection.get(cls.sectionId);
                        const marked = summary?.marked ?? 0;
                        return (
                            <div key={cls.sectionId} className="bg-white rounded-xl shadow-sm border p-5 flex flex-col">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <h2 className="font-semibold text-lg text-foreground">
                                            {cls.gradeName} – {cls.sectionName}
                                        </h2>
                                        <p className="text-sm text-muted-foreground">
                                            {cls.studentCount} active {cls.studentCount === 1 ? 'student' : 'students'}
                                            {cls.roomNumber ? ` · Room ${cls.roomNumber}` : ''}
                                        </p>
                                    </div>
                                    {cls.isClassTeacher && (
                                        <Badge className="bg-emerald-600 text-white shrink-0">Class teacher</Badge>
                                    )}
                                </div>

                                <div className="mt-3 text-sm text-foreground">
                                    {cls.subjects ? (
                                        <p>
                                            <span className="text-muted-foreground">You teach:</span> {cls.subjects}
                                            <span className="text-muted-foreground"> · {cls.periodsPerWeek} periods/week</span>
                                        </p>
                                    ) : (
                                        <p className="text-muted-foreground italic">
                                            No timetabled periods here — class-teacher duties only.
                                        </p>
                                    )}
                                </div>

                                <div className="mt-3 text-sm">
                                    {marked > 0 ? (
                                        <p className="text-muted-foreground">
                                            Today: {summary?.present ?? 0} present, {summary?.absent ?? 0} absent,{' '}
                                            {summary?.late ?? 0} late
                                            {(summary?.excused ?? 0) > 0 ? `, ${summary?.excused} excused` : ''}
                                        </p>
                                    ) : (
                                        <p className="text-amber-700">Attendance not marked today.</p>
                                    )}
                                </div>

                                <div className="mt-4 pt-3 border-t flex flex-wrap gap-3 text-sm">
                                    <Link
                                        href={`/teacher/attendance/${cls.sectionId}`}
                                        className="text-emerald-700 font-medium hover:underline"
                                    >
                                        Mark attendance
                                    </Link>
                                    <Link href="/teacher/gradebook" className="text-primary hover:underline">
                                        Marks
                                    </Link>
                                    <Link href="/teacher/homework" className="text-purple-600 hover:underline">
                                        Homework
                                    </Link>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
