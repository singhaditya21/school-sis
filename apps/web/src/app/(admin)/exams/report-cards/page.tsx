import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import Link from 'next/link';
import { getSectionsForTimetable } from '@/lib/actions/timetable';
import { getExams } from '@/lib/actions/exams';

export default async function ReportCardsPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const sections = await getSectionsForTimetable();
    const exams = await getExams();

    const gradeGroups = sections.reduce((acc, sec) => {
        if (!acc[sec.gradeName]) acc[sec.gradeName] = [];
        acc[sec.gradeName].push(sec);
        return acc;
    }, {} as Record<string, typeof sections>);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Report Cards</h1>
                    <p className="text-gray-600">Generate and print report cards</p>
                </div>
                <Link href="/exams" className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6">
                <h2 className="font-semibold mb-4">Select Class to Generate Report Cards</h2>
                <div className="space-y-4">
                    {Object.entries(gradeGroups).map(([gradeName, secs]) => (
                        <div key={gradeName}>
                            <h3 className="text-sm font-semibold text-gray-700 mb-2">{gradeName}</h3>
                            <div className="flex flex-wrap gap-2">
                                {secs.map(sec => (
                                    <Link
                                        key={sec.id}
                                        href={`/exams/report-cards/${sec.id}`}
                                        className="px-3 py-2 bg-purple-50 rounded-lg hover:bg-purple-100 text-sm font-medium"
                                    >
                                        {gradeName}-{sec.sectionName}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {exams.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h2 className="font-semibold mb-4">Available Exams ({exams.length})</h2>
                    <div className="divide-y">
                        {exams.map(exam => (
                            <div key={exam.id} className="py-2 flex justify-between">
                                <span className="font-medium">{exam.name}</span>
                                <span className="text-sm text-gray-500">{exam.scheduleCount} schedules</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
