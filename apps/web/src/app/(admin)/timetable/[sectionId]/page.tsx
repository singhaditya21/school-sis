import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTimetableForSection } from '@/lib/actions/timetable';
import { tenantScope, eq } from '@school-sis/api/src/data';
import { sections, grades } from '@school-sis/api/src/db/generated/tables';

export default async function SectionTimetablePage({ params }: { params: Promise<{ sectionId: string }> }) {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const { sectionId } = await params;

    const rows = await tenantScope(session.tenantId)
        .from(sections)
        .innerJoin(grades, eq(sections.gradeId, grades.id))
        .select<{ id: string; sectionName: string; gradeName: string }>({
            id: sections.id,
            sectionName: sections.name,
            gradeName: grades.name,
        })
        .where(eq(sections.id, sectionId))
        .limit(1)
        .rows();

    if (rows.length === 0) {
        return (
            <div className="container mx-auto p-6 text-center">
                <h1 className="text-2xl font-bold text-red-600">Section not found</h1>
                <Link href="/timetable" className="text-blue-600 hover:underline mt-4 block">← Back to Timetable</Link>
            </div>
        );
    }

    const { sectionName, gradeName } = rows[0];
    const timetableRows = await getTimetableForSection(sectionId);

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold" data-testid="section-title">
                        Timetable for {gradeName} - {sectionName}
                    </h1>
                    <p className="text-gray-600 mt-1">Weekly schedule details</p>
                </div>
                <div className="flex gap-3">
                    <Link
                        href={`/timetable/grid?section=${sectionId}`}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                        Edit in grid
                    </Link>
                    <Link href="/timetable" className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                        ← Back
                    </Link>
                </div>
            </div>

            {timetableRows.length === 0 ? (
                <div data-testid="section-no-periods" className="bg-white rounded-xl shadow-sm border p-8 text-center text-gray-500">
                    <p className="font-medium text-gray-700">No periods configured</p>
                    <p className="text-sm mt-1">
                        A weekly schedule needs the school&apos;s daily period structure before it can show anything.
                    </p>
                    <Link
                        href="/timetable/periods"
                        className="inline-block mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        Set up periods
                    </Link>
                </div>
            ) : (
            <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
                <table className="w-full min-w-[800px]" data-testid="timetable-grid-table">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Period</th>
                            {days.map((day) => (
                                <th key={day} className="px-4 py-3 text-left text-sm font-medium text-gray-500">{day}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {timetableRows.map((row, idx) => (
                            <tr key={idx}>
                                <td className="px-4 py-3 font-medium text-gray-900">
                                    <div>{row.periodName}</div>
                                    <div className="text-xs text-gray-500">{row.startTime} - {row.endTime}</div>
                                </td>
                                {[
                                    row.monday,
                                    row.tuesday,
                                    row.wednesday,
                                    row.thursday,
                                    row.friday,
                                    row.saturday
                                ].map((cell, cellIdx) => (
                                    <td key={cellIdx} className="px-4 py-3">
                                        {cell ? (
                                            <div className="p-2 bg-blue-50 rounded border border-blue-100 text-xs" data-testid="timetable-cell-content">
                                                <div className="font-semibold text-blue-900">{cell.subjectName}</div>
                                                <div className="text-gray-600">{cell.teacherName}</div>
                                                {cell.roomNumber && <div className="text-gray-400 mt-1">Room {cell.roomNumber}</div>}
                                            </div>
                                        ) : (
                                            <div className="text-xs text-gray-400 italic">Empty</div>
                                        )}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            )}
        </div>
    );
}
