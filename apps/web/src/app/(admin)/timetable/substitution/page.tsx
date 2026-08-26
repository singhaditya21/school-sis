import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { listGridPeriods, listGridSections } from '../_actions/grid';
import {
    listAbsentTeachers,
    listCoverObligations,
    listSubstitutionRequests,
    listTeacherOptions,
    type CoverObligation,
} from '../_actions/substitution';
import { dayOfWeekForIsoDate, isIsoDate, todayIsoDate, DAY_LABELS } from '../_lib/days';
import SubstitutionBoard from './SubstitutionBoard';

export default async function SubstitutionPage({
    searchParams,
}: {
    searchParams: Promise<{ date?: string }>;
}) {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const { date: requestedDate } = await searchParams;
    const date = requestedDate && isIsoDate(requestedDate) ? requestedDate : todayIsoDate();
    const dayOfWeek = dayOfWeekForIsoDate(date);

    const [absentTeachers, teachers, requests, periods, sections] = await Promise.all([
        listAbsentTeachers(date),
        listTeacherOptions(),
        listSubstitutionRequests(),
        listGridPeriods(),
        listGridSections(),
    ]);

    const obligationsByTeacher: Record<string, CoverObligation[]> = {};
    await Promise.all(
        absentTeachers.map(async (teacher) => {
            obligationsByTeacher[teacher.userId] = await listCoverObligations(teacher.userId, date);
        })
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Substitution Management</h1>
                    <p className="text-gray-600 mt-1">
                        Cover for staff on approved leave
                        {dayOfWeek ? ` — ${DAY_LABELS[dayOfWeek]}, ${date}` : ` — ${date} (Sunday: nothing is timetabled)`}
                    </p>
                </div>
                <div className="flex gap-3">
                    <Link href="/timetable/grid" className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                        Grid View
                    </Link>
                    <Link href="/timetable" className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                        ← Back to Timetable
                    </Link>
                </div>
            </div>

            <SubstitutionBoard
                date={date}
                isTimetabledDay={dayOfWeek !== null}
                absentTeachers={absentTeachers}
                obligationsByTeacher={obligationsByTeacher}
                teachers={teachers}
                requests={requests}
                periods={periods.filter((period) => !period.isBreak)}
                sections={sections}
            />
        </div>
    );
}
