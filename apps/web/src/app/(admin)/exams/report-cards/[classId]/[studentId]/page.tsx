import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth/session';
import { formatDate } from '@/lib/utils';
import {
    getClassReportCards,
    getDefaultExamForSection,
} from '../../../_actions/report-cards';
import { PrintButton } from './print-button';

export default async function StudentReportCardPage({
    params,
    searchParams,
}: {
    params: Promise<{ classId: string; studentId: string }>;
    searchParams: Promise<{ examId?: string }>;
}) {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const { classId: sectionId, studentId } = await params;
    const { examId: examIdParam } = await searchParams;
    const examId = examIdParam ?? (await getDefaultExamForSection(sectionId));

    const data = examId ? await getClassReportCards(sectionId, examId) : null;
    const student = data?.students.find((s) => s.studentId === studentId) ?? null;

    if (!data || !student) {
        return (
            <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
                <p className="text-muted-foreground">
                    No report card found for this student in the selected exam.
                </p>
                <Link
                    href={`/exams/report-cards/${sectionId}`}
                    className="text-primary hover:underline text-sm mt-2 inline-block"
                >
                    ← Back to class
                </Link>
            </div>
        );
    }

    const className = `${data.gradeName}-${data.sectionName}`;
    const notEntered = data.subjects.length - student.subjectsEntered;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
                <Link
                    href={`/exams/report-cards/${sectionId}?examId=${data.examId}`}
                    className="text-primary hover:underline text-sm"
                >
                    ← Back to {className}
                </Link>
                <PrintButton />
            </div>

            <div className="bg-white rounded-xl shadow-sm border print:border-0 print:shadow-none">
                <div className="p-6 border-b">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Report card</p>
                    <h1 className="text-2xl font-bold text-foreground mt-1">{student.fullName}</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        {student.admissionNumber} · {className}
                        {student.rollNumber !== null && ` · Roll ${student.rollNumber}`}
                    </p>
                    <p className="text-muted-foreground text-sm">
                        {data.examName} · {data.academicYearName}
                    </p>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted border-b">
                            <tr>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Subject</th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Marks</th>
                                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Max</th>
                                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Grade</th>
                                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Result</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {data.subjects.map((subject) => {
                                const mark = student.subjectMarks[subject.scheduleId];
                                return (
                                    <tr key={subject.scheduleId}>
                                        <td className="px-4 py-3 font-medium text-foreground">
                                            {subject.subjectName}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {formatDate(subject.examDate)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono">
                                            {!mark ? '—' : mark.isAbsent ? 'AB' : (mark.marksObtained ?? '—')}
                                        </td>
                                        <td className="px-4 py-3 text-right text-muted-foreground">
                                            {subject.maxMarks}
                                        </td>
                                        <td className="px-4 py-3 text-center">{mark?.grade ?? '—'}</td>
                                        <td className="px-4 py-3 text-center">
                                            {!mark ? (
                                                <span className="text-muted-foreground text-xs">Not entered</span>
                                            ) : mark.isAbsent ? (
                                                <span className="text-red-600 text-xs font-medium">Absent</span>
                                            ) : (mark.marksObtained ?? 0) >= subject.passingMarks ? (
                                                <span className="text-green-700 text-xs font-medium">Pass</span>
                                            ) : (
                                                <span className="text-red-600 text-xs font-medium">Fail</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="p-6 border-t grid grid-cols-2 md:grid-cols-5 gap-4">
                    <Field label="Total" value={`${student.totalObtained} / ${student.totalMax}`} />
                    <Field
                        label="Percentage"
                        value={student.percentage === null ? '—' : `${student.percentage}%`}
                    />
                    <Field label="Subjects passed" value={`${student.subjectsPassed}/${student.subjectsEntered}`} />
                    <Field label="Section rank" value={student.sectionRank === null ? '—' : `#${student.sectionRank}`} />
                    <Field
                        label={`Class rank (of ${data.gradeStudentCount})`}
                        value={student.classRank === null ? '—' : `#${student.classRank}`}
                    />
                </div>

                {notEntered > 0 && (
                    <div className="px-6 pb-6">
                        <p className="text-xs text-muted-foreground">
                            {notEntered} scheduled paper(s) have no saved result yet and are excluded
                            from the total and percentage.
                        </p>
                    </div>
                )}

                {Object.values(student.subjectMarks).some((m) => m.remarks) && (
                    <div className="px-6 pb-6">
                        <h2 className="text-sm font-semibold text-foreground mb-2">Remarks</h2>
                        <ul className="space-y-1">
                            {data.subjects.map((subject) => {
                                const remark = student.subjectMarks[subject.scheduleId]?.remarks;
                                if (!remark) return null;
                                return (
                                    <li key={subject.scheduleId} className="text-sm text-foreground">
                                        <span className="font-medium">{subject.subjectName}:</span> {remark}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold text-foreground">{value}</p>
        </div>
    );
}
