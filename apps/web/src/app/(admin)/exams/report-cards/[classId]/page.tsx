import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth/session';
import {
    getClassReportCards,
    getDefaultExamForSection,
} from '../../_actions/report-cards';

export default async function ClassReportCardsPage({
    params,
    searchParams,
}: {
    params: Promise<{ classId: string }>;
    searchParams: Promise<{ examId?: string }>;
}) {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const { classId: sectionId } = await params;
    const { examId: examIdParam } = await searchParams;

    const examId = examIdParam ?? (await getDefaultExamForSection(sectionId));

    if (!examId) {
        return (
            <Shell>
                <div className="bg-card rounded-xl shadow-sm border p-8 text-center">
                    <p className="font-medium text-foreground">No exam selected</p>
                    <p className="text-sm text-muted-foreground mt-1">
                        This class has no saved marks for any exam yet, so there is no report card to
                        build. Pick an exam to see its (empty) sheet, or enter marks first.
                    </p>
                    <Link
                        href="/exams/report-cards"
                        className="text-primary hover:underline text-sm mt-3 inline-block"
                    >
                        ← Choose an exam
                    </Link>
                </div>
            </Shell>
        );
    }

    const data = await getClassReportCards(sectionId, examId);

    if (!data) {
        return (
            <Shell>
                <div className="bg-card rounded-xl shadow-sm border p-8 text-center">
                    <p className="text-muted-foreground">This class or exam could not be found.</p>
                    <Link
                        href="/exams/report-cards"
                        className="text-primary hover:underline text-sm mt-2 inline-block"
                    >
                        ← Back to report cards
                    </Link>
                </div>
            </Shell>
        );
    }

    const className = `${data.gradeName}-${data.sectionName}`;

    const header = (
        <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
                <h1 className="text-2xl font-bold text-foreground">Report cards — {className}</h1>
                <p className="text-muted-foreground">
                    {data.examName} · {data.academicYearName} · {data.examStatus.replace(/_/g, ' ')}
                </p>
            </div>
            <Link href="/exams/report-cards" className="text-primary hover:underline text-sm">
                ← Change exam or class
            </Link>
        </div>
    );

    if (data.subjects.length === 0) {
        return (
            <div className="space-y-6">
                {header}
                <div className="bg-card rounded-xl shadow-sm border p-8 text-center">
                    <p className="font-medium text-foreground">
                        No papers scheduled for {data.gradeName} in this exam
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                        A report card needs at least one scheduled subject to report against.
                    </p>
                </div>
            </div>
        );
    }

    if (data.statistics.withResults === 0) {
        return (
            <div className="space-y-6">
                {header}
                <div className="bg-card rounded-xl shadow-sm border p-8 text-center">
                    <p className="font-medium text-foreground">No marks entered yet</p>
                    <p className="text-sm text-muted-foreground mt-1 mb-4">
                        {data.subjects.length} paper(s) are scheduled for {data.gradeName}, but no
                        results have been saved for {className}. Report cards appear here as soon as
                        marks are entered.
                    </p>
                    <Link
                        href={`/exams/${data.examId}/marks/${data.gradeId}`}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
                    >
                        Enter marks for {data.gradeName}
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {header}

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Stat label="Students with results" value={`${data.statistics.withResults}/${data.students.length}`} />
                <Stat
                    label="Average"
                    value={data.statistics.averagePercentage === null ? '—' : `${data.statistics.averagePercentage}%`}
                />
                <Stat
                    label="Highest"
                    value={data.statistics.highestPercentage === null ? '—' : `${data.statistics.highestPercentage}%`}
                />
                <Stat
                    label="Lowest"
                    value={data.statistics.lowestPercentage === null ? '—' : `${data.statistics.lowestPercentage}%`}
                />
                <Stat
                    label="Cleared every subject"
                    value={`${data.statistics.clearedAllSubjects}/${data.statistics.withResults}`}
                />
            </div>

            <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
                <div className="p-4 border-b bg-muted">
                    <h2 className="font-semibold text-foreground">Subject-wise marks</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                        &ldquo;—&rdquo; means no result has been saved for that paper. Totals and
                        percentages count only the papers that have been marked. Class rank is across
                        all {data.gradeStudentCount} students of {data.gradeName}.
                    </p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted border-b">
                            <tr>
                                <th className="px-3 py-3 text-left font-medium text-muted-foreground">Roll</th>
                                <th className="px-3 py-3 text-left font-medium text-muted-foreground">Student</th>
                                {data.subjects.map((subject) => (
                                    <th
                                        key={subject.scheduleId}
                                        className="px-3 py-3 text-center font-medium text-muted-foreground"
                                        title={`${subject.subjectName} · max ${subject.maxMarks} · pass ${subject.passingMarks}`}
                                    >
                                        {subject.subjectCode}
                                        <span className="block text-[10px] font-normal text-muted-foreground">
                                            /{subject.maxMarks}
                                        </span>
                                    </th>
                                ))}
                                <th className="px-3 py-3 text-right font-medium text-muted-foreground">Total</th>
                                <th className="px-3 py-3 text-right font-medium text-muted-foreground">%</th>
                                <th className="px-3 py-3 text-center font-medium text-muted-foreground">Section rank</th>
                                <th className="px-3 py-3 text-center font-medium text-muted-foreground">Class rank</th>
                                <th className="px-3 py-3 text-center font-medium text-muted-foreground"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {data.students.map((student) => (
                                <tr key={student.studentId} className="hover:bg-muted">
                                    <td className="px-3 py-3 text-muted-foreground">{student.rollNumber ?? '—'}</td>
                                    <td className="px-3 py-3">
                                        <p className="font-medium text-foreground">{student.fullName}</p>
                                        <p className="text-xs text-muted-foreground">{student.admissionNumber}</p>
                                    </td>
                                    {data.subjects.map((subject) => {
                                        const mark = student.subjectMarks[subject.scheduleId];
                                        if (!mark) {
                                            return (
                                                <td
                                                    key={subject.scheduleId}
                                                    className="px-3 py-3 text-center text-gray-300"
                                                >
                                                    —
                                                </td>
                                            );
                                        }
                                        if (mark.isAbsent) {
                                            return (
                                                <td
                                                    key={subject.scheduleId}
                                                    className="px-3 py-3 text-center text-red-600 font-medium"
                                                >
                                                    AB
                                                </td>
                                            );
                                        }
                                        const value = mark.marksObtained ?? 0;
                                        const failed = value < subject.passingMarks;
                                        return (
                                            <td
                                                key={subject.scheduleId}
                                                className={`px-3 py-3 text-center font-medium ${
                                                    failed ? 'text-red-600' : 'text-foreground'
                                                }`}
                                            >
                                                {value}
                                            </td>
                                        );
                                    })}
                                    <td className="px-3 py-3 text-right font-mono">
                                        {student.subjectsEntered === 0
                                            ? '—'
                                            : `${student.totalObtained}/${student.totalMax}`}
                                    </td>
                                    <td className="px-3 py-3 text-right font-semibold">
                                        {student.percentage === null ? '—' : `${student.percentage}%`}
                                    </td>
                                    <td className="px-3 py-3 text-center">{student.sectionRank ?? '—'}</td>
                                    <td className="px-3 py-3 text-center">{student.classRank ?? '—'}</td>
                                    <td className="px-3 py-3 text-center">
                                        {student.subjectsEntered > 0 ? (
                                            <Link
                                                href={`/exams/report-cards/${data.sectionId}/${student.studentId}?examId=${data.examId}`}
                                                className="text-primary hover:underline text-xs"
                                            >
                                                Report card
                                            </Link>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">no marks</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-card rounded-xl shadow-sm border p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
        </div>
    );
}

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-foreground">Report cards</h1>
                <Link href="/exams" className="text-primary hover:underline text-sm">
                    ← Back to exams
                </Link>
            </div>
            {children}
        </div>
    );
}
