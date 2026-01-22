import { getSession } from '@/lib/auth/session';
import Link from 'next/link';

interface Term {
    id: string;
    name: string;
}

export default async function CreateExamPage() {
    const session = await getSession();

    let terms: Term[] = [];

    try {
        const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/terms`,
            {
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (response.ok) {
            const data = await response.json();
            terms = data.data?.content || data.content || [];
        }
    } catch (error) {
        console.error('[Exams] API Error:', error);
    }

    return (
        <div className="max-w-lg mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Create Exam</h1>
                <Link href="/exams" className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <form action="/api/exams" method="POST" className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Exam Name</label>
                    <input name="name" type="text" required className="w-full px-3 py-2 border rounded-lg" />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Exam Type</label>
                    <select name="type" className="w-full px-3 py-2 border rounded-lg">
                        <option value="UNIT_TEST">Unit Test</option>
                        <option value="MID_TERM">Mid Term</option>
                        <option value="TERM_EXAM">Term Exam</option>
                        <option value="FINAL">Final</option>
                        <option value="PRACTICAL">Practical</option>
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Term</label>
                    <select name="termId" className="w-full px-3 py-2 border rounded-lg">
                        {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                        <input name="startDate" type="date" required className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                        <input name="endDate" type="date" required className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Max Marks</label>
                    <input name="maxMarks" type="number" defaultValue={100} className="w-full px-3 py-2 border rounded-lg" />
                </div>

                <button type="submit" className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Create Exam
                </button>
            </form>
        </div>
    );
}
