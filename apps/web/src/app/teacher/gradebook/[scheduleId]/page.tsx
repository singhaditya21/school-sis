import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMyMarksSheetHeader, getMyMarksSheetRows } from '../../_actions/marks';
import { MarksSheet } from '../../_components/MarksSheet';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function TeacherMarksEntryPage({
    params,
}: {
    params: Promise<{ scheduleId: string }>;
}) {
    const { scheduleId } = await params;

    // Null covers "no such paper" and "not a subject you teach" alike.
    const header = await getMyMarksSheetHeader(scheduleId);
    if (!header) notFound();

    const rows = await getMyMarksSheetRows(scheduleId);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">
                        {header.gradeName} · {header.subjectName}
                    </h1>
                    <p className="text-muted-foreground">
                        {header.examName} ({header.examType.replace(/_/g, ' ')}) ·{' '}
                        {formatDate(header.examDate)}
                    </p>
                </div>
                <Link href="/teacher/gradebook" className="text-sm text-blue-600 hover:underline">
                    ← All papers
                </Link>
            </div>

            <MarksSheet
                scheduleId={scheduleId}
                maxMarks={Number(header.maxMarks)}
                passingMarks={Number(header.passingMarks)}
                rows={rows}
            />
        </div>
    );
}
