import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTimetableForSection } from '@/lib/actions/timetable';
import { db } from '@/lib/db';
import { sections, grades } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export default async function SectionTimetablePage({ params }: { params: Promise<{ sectionId: string }> }) {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const { sectionId } = await params;

    const rows = await db
        .select({
            id: sections.id,
            sectionName: sections.name,
            gradeName: grades.name,
        })
        .from(sections)
        .innerJoin(grades, eq(sections.gradeId, grades.id))
        .where(and(
            eq(sections.id, sectionId),
            eq(sections.tenantId, session.tenantId)
        ))
        .limit(1);

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
                <Link href="/timetable" className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                    ← Back
                </Link>
            </div>

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
        </div>
    );
}
