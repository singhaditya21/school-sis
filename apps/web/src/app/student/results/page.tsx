import { getMyResults, type StudentResult } from '../_lib/queries';
import { AccountNotLinked } from '../_components/AccountNotLinked';

export const dynamic = 'force-dynamic';

export default async function StudentResultsPage() {
    const data = await getMyResults();

    if (!data) {
        return <AccountNotLinked what="results" />;
    }

    const byExam = new Map<string, { name: string; type: string; date: string; rows: StudentResult[] }>();
    for (const row of data.results) {
        const existing = byExam.get(row.examId);
        if (existing) {
            existing.rows.push(row);
        } else {
            byExam.set(row.examId, { name: row.examName, type: row.examType, date: row.examDate, rows: [row] });
        }
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-6">
            <div className="border-b border-border pb-4">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">My results</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Marks appear here once your school publishes the exam. Results still being
                    entered or reviewed are not shown.
                </p>
            </div>

            {byExam.size === 0 ? (
                <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
                    No published results yet.
                </div>
            ) : (
                Array.from(byExam.entries()).map(([examId, exam]) => {
                    const scored = exam.rows.filter((r) => !r.isAbsent && r.marksObtained !== null);
                    const obtained = scored.reduce((sum, r) => sum + (r.marksObtained ?? 0), 0);
                    const total = scored.reduce((sum, r) => sum + r.maxMarks, 0);
                    const percentage = total > 0 ? Math.round((obtained / total) * 1000) / 10 : null;

                    return (
                        <div key={examId} className="rounded-xl border bg-card shadow-sm overflow-hidden">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 border-b bg-muted px-6 py-4">
                                <div>
                                    <h2 className="text-base font-semibold text-foreground">{exam.name}</h2>
                                    <p className="text-xs text-muted-foreground">
                                        {exam.type.replace(/_/g, ' ')} · from {exam.date}
                                    </p>
                                </div>
                                {percentage !== null && (
                                    <p className="text-sm font-medium text-foreground">
                                        {obtained} / {total} ({percentage}%)
                                    </p>
                                )}
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                                            <th className="px-6 py-3 font-medium">Subject</th>
                                            <th className="px-6 py-3 font-medium">Marks</th>
                                            <th className="px-6 py-3 font-medium">Grade</th>
                                            <th className="px-6 py-3 font-medium">Remarks</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {exam.rows.map((row) => {
                                            const passed = row.marksObtained !== null && row.marksObtained >= row.passingMarks;
                                            return (
                                                <tr key={`${row.examId}-${row.subject}`} className="border-b last:border-0">
                                                    <td className="px-6 py-3 font-medium text-foreground">{row.subject}</td>
                                                    <td className="px-6 py-3">
                                                        {row.isAbsent ? (
                                                            <span className="text-muted-foreground">Absent</span>
                                                        ) : row.marksObtained === null ? (
                                                            <span className="text-muted-foreground">Not recorded</span>
                                                        ) : (
                                                            <span className={passed ? 'text-emerald-700' : 'text-red-700'}>
                                                                {row.marksObtained} / {row.maxMarks}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-3 text-foreground">{row.grade ?? '—'}</td>
                                                    <td className="px-6 py-3 text-muted-foreground">{row.remarks ?? '—'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
}
