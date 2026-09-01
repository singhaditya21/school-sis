import Link from 'next/link';
import { getMyExamSchedules } from '../_actions/marks';
import { getMyClasses } from '../_actions/classes';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * Every paper this teacher may enter marks for.
 *
 * An exam schedule is (exam, grade, subject). This page lists only the schedules
 * whose subject this teacher takes with a section of that grade — that is the
 * whole of what the schema knows about who marks what. There is no credit,
 * GPA, curve or z-score anywhere in the database, so none is shown.
 */
export default async function TeacherGradebookPage() {
    const [schedules, classes] = await Promise.all([getMyExamSchedules(), getMyClasses()]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Gradebook</h1>
                <p className="text-muted-foreground">
                    Exam papers for the subjects you teach. Open one to enter or revise marks.
                </p>
            </div>

            {schedules.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
                    <p className="font-medium text-foreground">No exam papers are assigned to you.</p>
                    <p className="text-sm text-muted-foreground mt-2 max-w-xl mx-auto">
                        {classes.length === 0
                            ? 'You have no timetabled classes yet, so no exam schedule can match your subjects.'
                            : 'A paper appears here once the office schedules an exam for a grade and subject you teach. Nothing is scheduled for your subjects at the moment.'}
                    </p>
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border divide-y" data-testid="teacher-exam-papers">
                    {schedules.map((sched) => {
                        const complete = sched.studentCount > 0 && sched.enteredCount >= sched.studentCount;
                        return (
                            <div
                                key={sched.scheduleId}
                                className="p-4 flex flex-wrap items-center justify-between gap-3"
                            >
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className="font-medium text-foreground">
                                            {sched.gradeName} · {sched.subjectName}
                                        </p>
                                        <Badge variant="outline" className="text-xs">
                                            {sched.examType.replace(/_/g, ' ')}
                                        </Badge>
                                        {complete && (
                                            <Badge className="bg-emerald-600 text-white text-xs">Marks entered</Badge>
                                        )}
                                    </div>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        {sched.examName} · {formatDate(sched.examDate)} · {sched.startTime}–
                                        {sched.endTime} · max {Number(sched.maxMarks)}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {sched.enteredCount} of {sched.studentCount} of your students marked
                                        {sched.examStatus ? ` · exam status ${sched.examStatus}` : ''}
                                    </p>
                                </div>
                                <Link
                                    href={`/teacher/gradebook/${sched.scheduleId}`}
                                    className="text-sm font-medium text-primary hover:underline"
                                >
                                    {sched.enteredCount > 0 ? 'Revise marks' : 'Enter marks'} →
                                </Link>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
