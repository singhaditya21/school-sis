import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth/session';
import { formatDate } from '@/lib/utils';
import { getReportCardClasses, getReportCardExamOptions } from '../_actions/report-cards';

export default async function ReportCardsPage({
    searchParams,
}: {
    searchParams: Promise<{ examId?: string }>;
}) {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const { examId } = await searchParams;
    const exams = await getReportCardExamOptions();

    if (exams.length === 0) {
        return (
            <div className="space-y-6">
                <Header />
                <div className="bg-card rounded-xl shadow-sm border p-8 text-center">
                    <p className="font-medium text-foreground">No exams yet</p>
                    <p className="text-sm text-muted-foreground mt-1 mb-4">
                        Report cards are built from saved marks, so there is nothing to show until an
                        exam exists and marks have been entered.
                    </p>
                    <Link
                        href="/exams/create"
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
                    >
                        Create an exam
                    </Link>
                </div>
            </div>
        );
    }

    const selected =
        exams.find((e) => e.id === examId) ??
        exams.find((e) => e.resultCount > 0) ??
        exams[0];

    const classes = await getReportCardClasses(selected.id);

    const byGrade = new Map<string, typeof classes>();
    for (const cls of classes) {
        const bucket = byGrade.get(cls.gradeName) ?? [];
        bucket.push(cls);
        byGrade.set(cls.gradeName, bucket);
    }

    return (
        <div className="space-y-6">
            <Header />

            <div className="bg-card rounded-xl shadow-sm border">
                <div className="p-4 border-b">
                    <h2 className="font-semibold text-foreground">1. Choose an exam</h2>
                </div>
                <div className="divide-y">
                    {exams.map((exam) => {
                        const active = exam.id === selected.id;
                        return (
                            <Link
                                key={exam.id}
                                href={`/exams/report-cards?examId=${exam.id}`}
                                className={`flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-muted ${
                                    active ? 'bg-blue-50/60' : ''
                                }`}
                            >
                                <div>
                                    <p className="font-medium text-foreground">
                                        {exam.name}
                                        {active && (
                                            <span className="ml-2 text-xs font-semibold text-blue-600">
                                                selected
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {exam.academicYearName} · {formatDate(exam.startDate)}
                                    </p>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    {exam.scheduleCount} paper(s) · {exam.resultCount} mark(s) saved
                                </p>
                            </Link>
                        );
                    })}
                </div>
            </div>

            <div className="bg-card rounded-xl shadow-sm border">
                <div className="p-4 border-b">
                    <h2 className="font-semibold text-foreground">
                        2. Choose a class — {selected.name}
                    </h2>
                </div>

                {classes.length === 0 ? (
                    <div className="p-8 text-center">
                        <p className="font-medium text-foreground">No classes scheduled for this exam</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            Add a paper for at least one class to this exam before generating report
                            cards.
                        </p>
                        <Link
                            href={`/exams/${selected.id}`}
                            className="text-primary hover:underline text-sm mt-3 inline-block"
                        >
                            Open exam →
                        </Link>
                    </div>
                ) : (
                    <div className="p-4 space-y-5">
                        {Array.from(byGrade.entries()).map(([gradeName, sections]) => (
                            <div key={gradeName}>
                                <h3 className="text-sm font-semibold text-foreground mb-2">{gradeName}</h3>
                                <div className="flex flex-wrap gap-2">
                                    {sections.map((cls) => (
                                        <Link
                                            key={cls.sectionId}
                                            href={`/exams/report-cards/${cls.sectionId}?examId=${selected.id}`}
                                            className="px-3 py-2 rounded-lg border border-border hover:border-blue-300 hover:bg-accent text-sm"
                                        >
                                            <span className="font-medium text-foreground">
                                                {gradeName}-{cls.sectionName}
                                            </span>
                                            <span className="block text-xs text-muted-foreground">
                                                {cls.studentCount} student(s) · {cls.resultCount} mark(s)
                                            </span>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function Header() {
    return (
        <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
                <h1 className="text-2xl font-bold text-foreground">Report cards</h1>
                <p className="text-muted-foreground">
                    Built from marks saved against each exam paper — nothing is estimated.
                </p>
            </div>
            <Link href="/exams" className="text-primary hover:underline text-sm">
                ← Back to exams
            </Link>
        </div>
    );
}
