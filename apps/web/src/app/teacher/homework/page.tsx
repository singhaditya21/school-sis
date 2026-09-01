import Link from 'next/link';
import { getMyHomework, getMyTeachingSlots } from '../_actions/homework';
import { NewHomeworkForm } from '../_components/NewHomeworkForm';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function TeacherHomeworkPage() {
    const [items, slots] = await Promise.all([getMyHomework(), getMyTeachingSlots()]);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Homework</h1>
                    <p className="text-muted-foreground">Work you have set, and what has come back.</p>
                </div>
                <NewHomeworkForm slots={slots} />
            </div>

            {items.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
                    <p className="font-medium text-foreground">You have not set any homework yet.</p>
                    <p className="text-sm text-muted-foreground mt-2">
                        Only homework recorded against your account appears here.
                    </p>
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border divide-y" data-testid="teacher-homework-list">
                    {items.map((item) => (
                        <div key={item.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                                <p className="font-medium text-foreground">{item.title}</p>
                                <p className="text-sm text-muted-foreground">
                                    {item.gradeName && item.sectionName
                                        ? `${item.gradeName} – ${item.sectionName}`
                                        : 'No class recorded'}
                                    {item.subjectName ? ` · ${item.subjectName}` : ''} · due{' '}
                                    {formatDate(item.dueDate)}
                                    {item.maxMarks !== null ? ` · max ${item.maxMarks}` : ''}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {item.submissionCount} of {item.studentCount} submitted ·{' '}
                                    {item.gradedCount} graded
                                </p>
                            </div>
                            <Link
                                href={`/teacher/homework/${item.id}`}
                                className="text-sm font-medium text-purple-700 hover:underline"
                            >
                                Open →
                            </Link>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
