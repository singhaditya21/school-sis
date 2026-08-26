import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth/session';
import { formatDate } from '@/lib/utils';
import { getMarksSheet } from '../../../_actions/exam-marks';
import { MarksSheetEditor } from './marks-sheet-editor';

/**
 * Marks entry for one exam × one class.
 *
 * `classId` is the grade id — exam_schedules are scheduled per grade + subject,
 * so a paper covers every section of that grade. Students are listed grouped by
 * section within the grade.
 */
export default async function ExamMarksPage({
    params,
}: {
    params: Promise<{ examId: string; classId: string }>;
}) {
    const { examId, classId: gradeId } = await params;
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const sheet = await getMarksSheet(examId, gradeId);

    if (!sheet) {
        return (
            <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
                <p className="text-gray-600">This exam or class could not be found.</p>
                <Link href="/exams" className="text-blue-600 hover:underline text-sm mt-2 inline-block">
                    ← Back to exams
                </Link>
            </div>
        );
    }

    const header = (
        <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Marks entry — {sheet.gradeName}</h1>
                <p className="text-gray-600">
                    {sheet.exam.name} · {sheet.exam.academicYearName} ·{' '}
                    {formatDate(sheet.exam.startDate)} – {formatDate(sheet.exam.endDate)}
                </p>
            </div>
            <Link href={`/exams/${examId}`} className="text-blue-600 hover:underline text-sm">
                ← Back to exam
            </Link>
        </div>
    );

    if (sheet.subjects.length === 0) {
        return (
            <div className="space-y-6">
                {header}
                <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
                    <p className="font-medium text-gray-900">No papers scheduled for {sheet.gradeName}</p>
                    <p className="text-sm text-gray-500 mt-1">
                        Marks can only be entered against a scheduled subject. Add a schedule for this
                        class to this exam first.
                    </p>
                </div>
            </div>
        );
    }

    if (sheet.students.length === 0) {
        return (
            <div className="space-y-6">
                {header}
                <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
                    <p className="font-medium text-gray-900">No active students in {sheet.gradeName}</p>
                    <p className="text-sm text-gray-500 mt-1">
                        There is nobody to enter marks for. Enrol students into this class first.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {header}
            <MarksSheetEditor
                examId={examId}
                gradeName={sheet.gradeName}
                subjects={sheet.subjects}
                students={sheet.students}
                marks={sheet.marks}
            />
        </div>
    );
}
