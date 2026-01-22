import { getSession } from '@/lib/auth/session';
import Link from 'next/link';

interface Student {
    id: string;
    name: string;
    admissionNumber: string;
}

interface Mark {
    studentId: string;
    marksObtained: number;
}

export default async function MarksEntryPage({ params }: { params: Promise<{ examId: string; classId: string }> }) {
    const { examId, classId } = await params;
    const session = await getSession();

    let students: Student[] = [];
    let existingMarks: Mark[] = [];

    try {
        const studentsResponse = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/students/class/${classId}`,
            {
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (studentsResponse.ok) {
            const data = await studentsResponse.json();
            students = data.data || [];
        }

        const marksResponse = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/exams/${examId}/marks/class/${classId}`,
            {
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (marksResponse.ok) {
            const marksData = await marksResponse.json();
            existingMarks = marksData.data || [];
        }
    } catch (error) {
        console.error('[Marks] API Error:', error);
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Enter Marks</h1>
                <Link href={`/exams/${examId}`} className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <form action="/api/marks" method="POST" className="bg-white rounded-xl shadow-sm border">
                <input type="hidden" name="examId" value={examId} />
                <input type="hidden" name="classId" value={classId} />

                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Admission No</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Student Name</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Marks</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {students.map((student) => {
                            const existing = existingMarks.find(m => m.studentId === student.id);
                            return (
                                <tr key={student.id}>
                                    <td className="px-4 py-3 text-sm">{student.admissionNumber}</td>
                                    <td className="px-4 py-3 text-sm font-medium">{student.name}</td>
                                    <td className="px-4 py-3">
                                        <input
                                            name={`marks[${student.id}]`}
                                            type="number"
                                            min={0}
                                            max={100}
                                            defaultValue={existing?.marksObtained || ''}
                                            className="w-20 px-2 py-1 border rounded"
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                <div className="p-4 border-t">
                    <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                        Save Marks
                    </button>
                </div>
            </form>
        </div>
    );
}
