import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getSubjectsForTimetable, getTeachersForTimetable } from '@/lib/actions/timetable';
import { listGridPeriods, listGridSections, listSectionGridEntries } from '../_actions/grid';
import TimetableGrid from './TimetableGrid';

export default async function TimetableGridPage({
    searchParams,
}: {
    searchParams: Promise<{ section?: string }>;
}) {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const { section: requestedSection } = await searchParams;
    const [sections, periods] = await Promise.all([listGridSections(), listGridPeriods()]);

    const header = (
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-3xl font-bold">Timetable Grid</h1>
                <p className="text-muted-foreground mt-1">Weekly schedule, period by period</p>
            </div>
            <Link href="/timetable" className="px-4 py-2 border border-border rounded-lg hover:bg-muted">
                ← Back to Timetable
            </Link>
        </div>
    );

    if (sections.length === 0) {
        return (
            <div className="space-y-6">
                {header}
                <div data-testid="grid-no-sections" className="bg-white rounded-xl shadow-sm border p-8 text-center text-muted-foreground">
                    <p className="font-medium text-foreground">No classes configured</p>
                    <p className="text-sm mt-1">Grades and sections have to exist before a timetable can be built.</p>
                </div>
            </div>
        );
    }

    if (periods.length === 0) {
        return (
            <div className="space-y-6">
                {header}
                <div data-testid="grid-no-periods" className="bg-white rounded-xl shadow-sm border p-8 text-center text-muted-foreground">
                    <p className="font-medium text-foreground">No periods configured</p>
                    <p className="text-sm mt-1">
                        The grid rows come from the school&apos;s daily period structure. Define the periods first.
                    </p>
                    <Link
                        href="/timetable/periods"
                        className="inline-block mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        Set up periods
                    </Link>
                </div>
            </div>
        );
    }

    const selected =
        sections.find((option) => option.id === requestedSection) ?? sections[0];

    const [entries, subjects, teachers] = await Promise.all([
        listSectionGridEntries(selected.id),
        getSubjectsForTimetable(),
        getTeachersForTimetable(),
    ]);

    const sectionLabel = `${selected.gradeName} - ${selected.sectionName}`;

    return (
        <div className="space-y-6">
            {header}

            <div className="bg-white rounded-xl shadow-sm border p-4">
                <p className="text-sm font-medium text-foreground mb-3">Class</p>
                <div className="flex flex-wrap gap-2" data-testid="grid-section-picker">
                    {sections.map((option) => {
                        const isActive = option.id === selected.id;
                        return (
                            <Link
                                key={option.id}
                                href={`/timetable/grid?section=${option.id}`}
                                className={
                                    isActive
                                        ? 'px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white'
                                        : 'px-3 py-2 rounded-lg text-sm font-medium bg-muted text-foreground hover:bg-muted'
                                }
                            >
                                {option.gradeName}-{option.sectionName}
                                <span className={isActive ? 'ml-2 text-indigo-100' : 'ml-2 text-muted-foreground'}>
                                    {option.entryCount}
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </div>

            {subjects.length === 0 || teachers.length === 0 ? (
                <div data-testid="grid-missing-prerequisites" className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                    {subjects.length === 0 && teachers.length === 0
                        ? 'No subjects and no active teachers exist yet, so slots cannot be assigned.'
                        : subjects.length === 0
                            ? 'No subjects exist yet, so slots cannot be assigned.'
                            : 'No active teachers exist yet, so slots cannot be assigned.'}
                </div>
            ) : null}

            <TimetableGrid
                sectionId={selected.id}
                sectionLabel={sectionLabel}
                periods={periods}
                entries={entries}
                subjects={subjects}
                teachers={teachers}
            />

            <div className="flex flex-wrap gap-3 text-sm">
                <Link href={`/timetable/${selected.id}`} className="text-blue-600 hover:underline">
                    Printable view for {sectionLabel}
                </Link>
                <Link href="/timetable/periods" className="text-blue-600 hover:underline">
                    Manage periods
                </Link>
                <Link href="/timetable/substitution" className="text-blue-600 hover:underline">
                    Substitution cover
                </Link>
            </div>
        </div>
    );
}
