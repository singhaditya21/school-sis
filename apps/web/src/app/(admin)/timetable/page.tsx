import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { listGridPeriods, listGridSections } from './_actions/grid';

export default async function TimetablePage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const [sections, periods] = await Promise.all([listGridSections(), listGridPeriods()]);

    const gradeGroups = sections.reduce((acc, section) => {
        if (!acc[section.gradeName]) acc[section.gradeName] = [];
        acc[section.gradeName].push(section);
        return acc;
    }, {} as Record<string, typeof sections>);

    const scheduledSections = sections.filter((section) => section.entryCount > 0).length;
    const totalEntries = sections.reduce((sum, section) => sum + section.entryCount, 0);
    const teachingPeriods = periods.filter((period) => !period.isBreak).length;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Timetable</h1>
                    <p className="text-gray-600 mt-1">Manage class schedules, periods and cover</p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <Link href="/timetable/periods" className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                        Periods
                    </Link>
                    <Link href="/timetable/substitution" className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                        Substitutions
                    </Link>
                    <Link href="/timetable/bulk" className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50" data-testid="bulk-upload-link">
                        Bulk Upload
                    </Link>
                    <Link href="/timetable/new" className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                        Add Entry
                    </Link>
                    <Link href="/timetable/grid" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                        Open Grid
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl shadow-sm border p-4" data-testid="stat-periods">
                    <div className="text-sm text-gray-500">Periods in the day</div>
                    <div className="text-2xl font-bold text-gray-900">{periods.length}</div>
                    <div className="text-xs text-gray-500 mt-1">{teachingPeriods} teaching · {periods.length - teachingPeriods} breaks</div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4" data-testid="stat-scheduled-sections">
                    <div className="text-sm text-gray-500">Classes with a timetable</div>
                    <div className="text-2xl font-bold text-gray-900">{scheduledSections} / {sections.length}</div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4" data-testid="stat-entries">
                    <div className="text-sm text-gray-500">Scheduled entries</div>
                    <div className="text-2xl font-bold text-gray-900">{totalEntries}</div>
                </div>
            </div>

            {periods.length === 0 && (
                <div data-testid="no-periods-warning" className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                    No periods are configured yet, so no timetable can be built.{' '}
                    <Link href="/timetable/periods" className="underline font-medium">Set up the daily periods first.</Link>
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border">
                <div className="p-4 border-b">
                    <h2 className="font-semibold text-gray-900">Classes ({sections.length} sections)</h2>
                </div>
                <div className="divide-y">
                    {Object.entries(gradeGroups).length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            No classes found. Configure grades and sections first.
                        </div>
                    ) : (
                        Object.entries(gradeGroups).map(([gradeName, groupSections]) => (
                            <div key={gradeName} className="p-4">
                                <h3 className="text-sm font-semibold text-gray-700 mb-2">{gradeName}</h3>
                                <div className="flex flex-wrap gap-2">
                                    {groupSections.map((section) => (
                                        <Link
                                            key={section.id}
                                            href={`/timetable/${section.id}`}
                                            className="flex items-center gap-2 px-3 py-2 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
                                        >
                                            <span className="w-8 h-8 bg-purple-200 rounded flex items-center justify-center text-purple-700 font-bold text-xs">
                                                {section.sectionName}
                                            </span>
                                            <span className="text-sm font-medium text-gray-900">
                                                {gradeName}-{section.sectionName}
                                            </span>
                                            <span className="text-xs text-gray-500">
                                                {section.entryCount === 0 ? 'not scheduled' : `${section.entryCount} entries`}
                                            </span>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
