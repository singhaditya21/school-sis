import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth/session';
import { formatDate } from '@/lib/utils';
import { getExamWithSchedules, getSchedulePicklists } from '../_actions/exam-marks';
import type { ExamScheduleRow } from '../_actions/exam-marks';
import { AddPaperForm } from './add-paper-form';

const TYPE_COLORS: Record<string, string> = {
    UNIT_TEST: 'bg-blue-100 text-blue-700',
    MID_TERM: 'bg-orange-100 text-orange-700',
    FINAL: 'bg-red-100 text-red-700',
    PRACTICE: 'bg-green-100 text-green-700',
    BOARD_PREP: 'bg-purple-100 text-purple-700',
};

const STATUS_COLORS: Record<string, string> = {
    DRAFT: 'bg-muted text-foreground',
    SCHEDULED: 'bg-blue-100 text-blue-700',
    MARKS_ENTRY: 'bg-amber-100 text-amber-800',
    RESULT_REVIEW: 'bg-purple-100 text-purple-700',
    PUBLISHED: 'bg-green-100 text-green-700',
};

export default async function ExamDetailPage({
    params,
}: {
    params: Promise<{ examId: string }>;
}) {
    const { examId } = await params;
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const [data, picklists] = await Promise.all([
        getExamWithSchedules(examId),
        getSchedulePicklists(),
    ]);

    if (!data) {
        return (
            <div className="bg-card rounded-xl shadow-sm border p-8 text-center">
                <p className="text-muted-foreground">Exam not found.</p>
                <Link href="/exams" className="text-primary hover:underline text-sm mt-2 inline-block">
                    ← Back to exams
                </Link>
            </div>
        );
    }

    const { exam, schedules } = data;

    // Group papers by class so the "enter marks" link (which is per grade) is
    // offered once per class rather than once per row.
    const byGrade = new Map<string, { gradeName: string; rows: ExamScheduleRow[] }>();
    for (const row of schedules) {
        const bucket = byGrade.get(row.gradeId) ?? { gradeName: row.gradeName, rows: [] };
        bucket.rows.push(row);
        byGrade.set(row.gradeId, bucket);
    }

    const entered = schedules.reduce((sum, s) => sum + s.enteredCount, 0);
    const expected = schedules.reduce((sum, s) => sum + s.studentCount, 0);
    const locked = schedules.reduce((sum, s) => sum + s.lockedCount, 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-foreground">{exam.name}</h1>
                    <p className="text-muted-foreground">
                        {exam.academicYearName} · {formatDate(exam.startDate)} – {formatDate(exam.endDate)}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <AddPaperForm
                        examId={exam.id}
                        examStartDate={exam.startDate}
                        examEndDate={exam.endDate}
                        picklists={picklists}
                    />
                    <Link href="/exams" className="text-primary hover:underline text-sm">
                        ← Back to exams
                    </Link>
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                        TYPE_COLORS[exam.type] || 'bg-muted text-foreground'
                    }`}
                >
                    {exam.type.replace(/_/g, ' ')}
                </span>
                <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                        STATUS_COLORS[exam.status] || 'bg-muted text-foreground'
                    }`}
                >
                    {exam.status.replace(/_/g, ' ')}
                </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-card rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-muted-foreground">Papers scheduled</p>
                    <p className="text-2xl font-bold text-foreground">{schedules.length}</p>
                </div>
                <div className="bg-card rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-muted-foreground">Classes covered</p>
                    <p className="text-2xl font-bold text-foreground">{byGrade.size}</p>
                </div>
                <div className="bg-card rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-muted-foreground">Marks entered</p>
                    <p className="text-2xl font-bold text-blue-600">
                        {entered}
                        <span className="text-base font-medium text-muted-foreground"> / {expected}</span>
                    </p>
                </div>
                <div className="bg-card rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-muted-foreground">Locked by verification</p>
                    <p className="text-2xl font-bold text-foreground">{locked}</p>
                </div>
            </div>

            {exam.description && (
                <div className="bg-card rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-foreground">{exam.description}</p>
                </div>
            )}

            {schedules.length === 0 ? (
                <div className="bg-card rounded-xl shadow-sm border p-8 text-center">
                    <p className="font-medium text-foreground">No papers scheduled yet</p>
                    <p className="text-sm text-muted-foreground mt-1">
                        Marks entry and report cards both read from the exam schedule, so nothing can
                        be recorded against this exam until at least one class/subject paper exists.
                    </p>
                    <div className="mt-4 flex justify-center">
                        <AddPaperForm
                            examId={exam.id}
                            examStartDate={exam.startDate}
                            examEndDate={exam.endDate}
                            picklists={picklists}
                        />
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    {Array.from(byGrade.entries()).map(([gradeId, bucket]) => {
                        const gradeEntered = bucket.rows.reduce((s, r) => s + r.enteredCount, 0);
                        const gradeExpected = bucket.rows.reduce((s, r) => s + r.studentCount, 0);
                        return (
                            <div key={gradeId} className="bg-card rounded-xl shadow-sm border">
                                <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h2 className="font-semibold text-foreground">{bucket.gradeName}</h2>
                                        <p className="text-sm text-muted-foreground">
                                            {bucket.rows.length} paper(s) · {gradeEntered} of{' '}
                                            {gradeExpected} marks entered
                                        </p>
                                    </div>
                                    <Link
                                        href={`/exams/${exam.id}/marks/${gradeId}`}
                                        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90"
                                    >
                                        Enter marks
                                    </Link>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted">
                                            <tr>
                                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Subject</th>
                                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Time</th>
                                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Room</th>
                                                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Max</th>
                                                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Pass</th>
                                                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Entered</th>
                                                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Absent</th>
                                                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Locked</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {bucket.rows.map((row) => (
                                                <tr key={row.scheduleId} className="hover:bg-muted">
                                                    <td className="px-4 py-3">{formatDate(row.examDate)}</td>
                                                    <td className="px-4 py-3 font-medium">
                                                        {row.subjectName}{' '}
                                                        <span className="text-muted-foreground">({row.subjectCode})</span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {row.startTime} – {row.endTime}
                                                    </td>
                                                    <td className="px-4 py-3">{row.roomNumber || '—'}</td>
                                                    <td className="px-4 py-3 text-center">{row.maxMarks}</td>
                                                    <td className="px-4 py-3 text-center">{row.passingMarks}</td>
                                                    <td className="px-4 py-3 text-center">
                                                        {row.enteredCount}/{row.studentCount}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">{row.absentCount}</td>
                                                    <td className="px-4 py-3 text-center">{row.lockedCount}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
