import { getMyHomework } from '../_lib/queries';
import { AccountNotLinked } from '../_components/AccountNotLinked';

export const dynamic = 'force-dynamic';

export default async function StudentHomeworkPage() {
    const data = await getMyHomework();

    if (!data) {
        return <AccountNotLinked what="homework" />;
    }

    const today = new Date().toISOString().slice(0, 10);

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-6">
            <div className="border-b border-border pb-4">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">My homework</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Assignments set for {data.student.gradeName} · Section {data.student.sectionName},
                    with your own submission and feedback.
                </p>
            </div>

            {data.homework.length === 0 ? (
                <div className="rounded-xl border bg-white p-8 text-center text-sm text-muted-foreground">
                    No homework has been assigned to your class yet.
                </div>
            ) : (
                <ul className="space-y-3">
                    {data.homework.map((item) => {
                        const overdue = item.submittedAt === null && item.dueDate < today;
                        return (
                            <li key={item.id} className="rounded-xl border bg-white p-5 shadow-sm">
                                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                    <div className="min-w-0">
                                        <h2 className="font-semibold text-foreground">{item.title}</h2>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            {item.subject ?? 'General'} · due {item.dueDate}
                                            {item.maxMarks !== null && <> · out of {item.maxMarks}</>}
                                        </p>
                                        {item.description && (
                                            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{item.description}</p>
                                        )}
                                    </div>
                                    <span
                                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                                            item.submittedAt !== null
                                                ? 'bg-emerald-50 text-emerald-700'
                                                : overdue
                                                    ? 'bg-red-50 text-red-700'
                                                    : 'bg-amber-50 text-amber-700'
                                        }`}
                                    >
                                        {item.submittedAt !== null
                                            ? `Submitted ${item.submittedAt}`
                                            : overdue
                                                ? 'Overdue'
                                                : 'Not submitted'}
                                    </span>
                                </div>

                                {item.gradedAt !== null && (
                                    <div className="mt-4 rounded-lg bg-muted p-4 text-sm">
                                        <p className="font-medium text-foreground">
                                            Graded {item.gradedAt}
                                            {item.marks !== null && (
                                                <> · {item.marks}{item.maxMarks !== null && <> / {item.maxMarks}</>}</>
                                            )}
                                        </p>
                                        {item.feedback && <p className="mt-1 text-muted-foreground">{item.feedback}</p>}
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            <p className="text-xs text-muted-foreground">
                Submitting work from this portal isn&apos;t built yet — hand in through your teacher.
            </p>
        </div>
    );
}
