import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMyHomeworkDetail, getMyHomeworkRoster } from '../../_actions/homework';
import { HomeworkRoster } from '../../_components/HomeworkRoster';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function TeacherHomeworkDetailPage({
    params,
}: {
    params: Promise<{ assignmentId: string }>;
}) {
    const { assignmentId } = await params;

    // Null covers "no such homework" and "somebody else set it" alike.
    const detail = await getMyHomeworkDetail(assignmentId);
    if (!detail) notFound();

    const roster = await getMyHomeworkRoster(assignmentId);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">{detail.title}</h1>
                    <p className="text-muted-foreground">
                        {detail.gradeName && detail.sectionName
                            ? `${detail.gradeName} – ${detail.sectionName}`
                            : 'No class recorded'}
                        {detail.subjectName ? ` · ${detail.subjectName}` : ''} · due{' '}
                        {formatDate(detail.dueDate)}
                        {detail.maxMarks !== null ? ` · max ${detail.maxMarks}` : ''}
                    </p>
                </div>
                <Link href="/teacher/homework" className="text-sm text-primary hover:underline">
                    ← All homework
                </Link>
            </div>

            {detail.description && (
                <div className="bg-card rounded-xl shadow-sm border p-4">
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        Instructions
                    </h2>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{detail.description}</p>
                </div>
            )}

            <HomeworkRoster rows={roster} maxMarks={detail.maxMarks} />
        </div>
    );
}
