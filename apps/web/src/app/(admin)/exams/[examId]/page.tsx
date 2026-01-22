import { getSession } from '@/lib/auth/session';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';

interface Exam {
    id: string;
    name: string;
    type: string;
    startDate: string;
    endDate: string;
    maxMarks: number;
    marksCount: number;
}

export default async function ExamDetailPage({ params }: { params: Promise<{ examId: string }> }) {
    const { examId } = await params;
    const session = await getSession();

    let exam: Exam | null = null;
    let classGroups: { id: string; name: string; grade: string }[] = [];

    try {
        const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/exams/${examId}`,
            {
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                    'Content-Type': 'application/json',
                },
                cache: 'no-store',
            }
        );

        if (response.ok) {
            const data = await response.json();
            exam = data.data;
        }

        const classResponse = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/classes`,
            {
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (classResponse.ok) {
            const classData = await classResponse.json();
            classGroups = classData.data?.content || [];
        }
    } catch (error) {
        console.error('[Exam] API Error:', error);
    }

    if (!exam) {
        return <div className="p-8 text-center text-gray-500">Exam not found.</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">{exam.name}</h1>
                    <p className="text-gray-600">{formatDate(exam.startDate)} - {formatDate(exam.endDate)}</p>
                </div>
                <Link href="/exams" className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6">
                <h2 className="font-semibold mb-4">Enter Marks by Class</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {classGroups.map((c) => (
                        <Link
                            key={c.id}
                            href={`/exams/${examId}/marks/${c.id}`}
                            className="p-4 bg-gray-50 rounded-lg hover:bg-blue-50 transition-colors text-center"
                        >
                            <p className="font-medium">{c.name || c.grade}</p>
                            <p className="text-sm text-blue-600 mt-1">Enter Marks →</p>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}
