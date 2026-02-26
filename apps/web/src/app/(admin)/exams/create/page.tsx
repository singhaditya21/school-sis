import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import Link from 'next/link';
import { getAcademicYears, getTerms } from '@/lib/actions/queries';

export default async function CreateExamPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const academicYears = await getAcademicYears();
    const terms = await getTerms();

    return (
        <div className="space-y-6 max-w-2xl mx-auto">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Create Exam</h1>
                <Link href="/exams" className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <form action="/api/exams" method="POST" className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Exam Name *</label>
                    <input type="text" name="name" className="w-full px-3 py-2 border rounded-lg" placeholder="e.g. Term 1 Exam 2025-26" required />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                        <select name="type" className="w-full px-3 py-2 border rounded-lg" required>
                            <option value="UNIT_TEST">Unit Test</option>
                            <option value="MID_TERM">Mid-Term</option>
                            <option value="TERM_EXAM">Term Exam</option>
                            <option value="FINAL">Final</option>
                            <option value="PRACTICAL">Practical</option>
                            <option value="PROJECT">Project</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year *</label>
                        <select name="academicYearId" className="w-full px-3 py-2 border rounded-lg" required>
                            <option value="">Select</option>
                            {academicYears.map(ay => <option key={ay.id} value={ay.id}>{ay.name} {ay.isCurrent ? '(Current)' : ''}</option>)}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                        <input type="date" name="startDate" className="w-full px-3 py-2 border rounded-lg" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
                        <input type="date" name="endDate" className="w-full px-3 py-2 border rounded-lg" required />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea name="description" className="w-full px-3 py-2 border rounded-lg" rows={3} />
                </div>

                <button type="submit" className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Create Exam
                </button>
            </form>
        </div>
    );
}
