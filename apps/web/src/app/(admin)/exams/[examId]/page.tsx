import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';
import { getExamDetail } from '@/lib/actions/queries';

export default async function ExamDetailPage({ params }: { params: Promise<{ examId: string }> }) {
    const { examId } = await params;
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const exam = await getExamDetail(examId);

    if (!exam) {
        return <div className="p-8 text-center text-gray-500">Exam not found.</div>;
    }

    const typeColors: Record<string, string> = {
        UNIT_TEST: 'bg-blue-100 text-blue-700', TERM_EXAM: 'bg-purple-100 text-purple-700',
        MID_TERM: 'bg-orange-100 text-orange-700', FINAL: 'bg-red-100 text-red-700',
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">{exam.name}</h1>
                    <p className="text-gray-600">{exam.academicYearName} • {formatDate(exam.startDate)} – {formatDate(exam.endDate)}</p>
                </div>
                <Link href="/exams" className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-gray-500">Type</p>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${typeColors[exam.type] || 'bg-gray-100 text-gray-700'}`}>{exam.type.replace(/_/g, ' ')}</span>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-gray-500">Schedules</p>
                    <p className="text-2xl font-bold">{exam.schedules.length}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-gray-500">Duration</p>
                    <p className="text-lg font-semibold">{formatDate(exam.startDate)} – {formatDate(exam.endDate)}</p>
                </div>
            </div>

            {exam.description && (
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-gray-700">{exam.description}</p>
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border">
                <div className="p-4 border-b">
                    <h2 className="font-semibold">Exam Schedule</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left font-medium text-gray-500">Date</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-500">Class</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-500">Subject</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-500">Time</th>
                                <th className="px-4 py-3 text-center font-medium text-gray-500">Max Marks</th>
                                <th className="px-4 py-3 text-center font-medium text-gray-500">Pass Marks</th>
                                <th className="px-4 py-3 text-center font-medium text-gray-500">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {exam.schedules.map(sched => (
                                <tr key={sched.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3">{formatDate(sched.examDate)}</td>
                                    <td className="px-4 py-3 font-medium">{sched.gradeName}</td>
                                    <td className="px-4 py-3">{sched.subjectName}</td>
                                    <td className="px-4 py-3">{sched.startTime} – {sched.endTime}</td>
                                    <td className="px-4 py-3 text-center">{sched.maxMarks}</td>
                                    <td className="px-4 py-3 text-center">{sched.passingMarks}</td>
                                    <td className="px-4 py-3 text-center">
                                        <Link href={`/exams/${examId}/marks/${sched.gradeId}`} className="text-blue-600 hover:underline text-xs">Enter Marks</Link>
                                    </td>
                                </tr>
                            ))}
                            {exam.schedules.length === 0 && (
                                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No schedules configured.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
