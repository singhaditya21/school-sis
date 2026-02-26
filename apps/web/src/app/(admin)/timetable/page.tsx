import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSectionsForTimetable } from '@/lib/actions/timetable';

export default async function TimetablePage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const sections = await getSectionsForTimetable();

    // Group sections by grade
    const gradeGroups = sections.reduce((acc, sec) => {
        if (!acc[sec.gradeName]) acc[sec.gradeName] = [];
        acc[sec.gradeName].push(sec);
        return acc;
    }, {} as Record<string, typeof sections>);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Timetable</h1>
                    <p className="text-gray-600 mt-1">Manage class schedules and periods</p>
                </div>
                <div className="flex gap-3">
                    <Link href="/timetable/grid" className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                        📅 Grid View
                    </Link>
                    <Link href="/timetable/new" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        + Add Period
                    </Link>
                </div>
            </div>

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
                        Object.entries(gradeGroups).map(([gradeName, secs]) => (
                            <div key={gradeName} className="p-4">
                                <h3 className="text-sm font-semibold text-gray-700 mb-2">{gradeName}</h3>
                                <div className="flex flex-wrap gap-2">
                                    {secs.map(sec => (
                                        <Link
                                            key={sec.id}
                                            href={`/timetable/${sec.id}`}
                                            className="flex items-center gap-2 px-3 py-2 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
                                        >
                                            <span className="w-8 h-8 bg-purple-200 rounded flex items-center justify-center text-purple-700 font-bold text-xs">
                                                {sec.sectionName}
                                            </span>
                                            <span className="text-sm font-medium text-gray-900">
                                                {gradeName}-{sec.sectionName}
                                            </span>
                                            <span className="text-gray-400 text-sm">→</span>
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
