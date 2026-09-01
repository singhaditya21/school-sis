import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth/session';
import { getVerificationOverview } from '../_actions/verification';
import { VerificationTable } from './verification-table';

export default async function MarksVerificationPage({
    searchParams,
}: {
    searchParams: Promise<{ examId?: string }>;
}) {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const { examId } = await searchParams;
    const overview = await getVerificationOverview(examId);

    const activeExam = overview.exams.find((e) => e.id === examId) ?? null;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-foreground">Marks verification</h1>
                    <p className="text-muted-foreground">
                        Verifying a result writes a tamper-evident hash of it and locks it against
                        further edits.
                    </p>
                </div>
                <Link href="/exams" className="text-blue-600 hover:underline text-sm">
                    ← Back to exams
                </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-muted-foreground">Awaiting verification</p>
                    <p className="text-2xl font-bold text-amber-600">{overview.stats.pending}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-muted-foreground">Verified &amp; locked</p>
                    <p className="text-2xl font-bold text-green-600">{overview.stats.verified}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-muted-foreground">Saved results, all exams</p>
                    <p className="text-2xl font-bold text-foreground">{overview.stats.total}</p>
                </div>
            </div>

            {overview.exams.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <p className="text-sm font-medium text-foreground mb-2">Filter by exam</p>
                    <div className="flex flex-wrap gap-2">
                        <Link
                            href="/exams/verification"
                            className={`px-3 py-1.5 rounded-lg text-sm border ${
                                activeExam === null
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'border-border text-foreground hover:bg-muted'
                            }`}
                        >
                            All exams
                        </Link>
                        {overview.exams.map((exam) => (
                            <Link
                                key={exam.id}
                                href={`/exams/verification?examId=${exam.id}`}
                                className={`px-3 py-1.5 rounded-lg text-sm border ${
                                    activeExam?.id === exam.id
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'border-border text-foreground hover:bg-muted'
                                }`}
                            >
                                {exam.name}
                                <span
                                    className={`ml-2 text-xs ${
                                        activeExam?.id === exam.id ? 'text-blue-100' : 'text-muted-foreground'
                                    }`}
                                >
                                    {exam.pendingCount}
                                </span>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            <VerificationTable rows={overview.rows} truncated={overview.truncated} />
        </div>
    );
}
