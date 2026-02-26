import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import Link from 'next/link';
import { getStudentsBySection } from '@/lib/actions/queries';
import { getExamResults, getExamSchedules } from '@/lib/actions/exams';

export default async function ExamMarksPage({ params }: { params: Promise<{ examId: string; classId: string }> }) {
    const { examId, classId: gradeId } = await params;
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const schedules = await getExamSchedules(examId);
    const gradeSchedules = schedules.filter(s => s.gradeName.includes(gradeId) || true); // Show all for now

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Enter Marks</h1>
                    <p className="text-gray-600">{schedules.length} subjects scheduled</p>
                </div>
                <Link href={`/exams/${examId}`} className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <div className="bg-white rounded-xl shadow-sm border">
                <div className="p-4 border-b">
                    <h2 className="font-semibold">Subject-wise Marks Entry</h2>
                </div>
                <div className="divide-y">
                    {gradeSchedules.map(sched => (
                        <div key={sched.id} className="p-4">
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="font-medium">{sched.gradeName} — {sched.subjectName}</p>
                                    <p className="text-sm text-gray-500">Max: {sched.maxMarks} | Pass: {sched.passingMarks}</p>
                                </div>
                                <span className="text-sm text-gray-500">{sched.resultCount} results entered</span>
                            </div>
                        </div>
                    ))}
                    {gradeSchedules.length === 0 && (
                        <div className="p-8 text-center text-gray-500">No schedules found for this class.</div>
                    )}
                </div>
            </div>

            <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-4">
                <p className="text-sm text-yellow-800">ℹ️ Marks entry form with inline editing will be implemented in the next phase.</p>
            </div>
        </div>
    );
}
