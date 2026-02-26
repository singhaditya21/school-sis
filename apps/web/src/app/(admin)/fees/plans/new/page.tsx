import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import Link from 'next/link';
import { getAcademicYears } from '@/lib/actions/queries';
import { getGradesList } from '@/lib/actions/students';

export default async function NewFeePlanPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const academicYears = await getAcademicYears();
    const grades = await getGradesList();

    return (
        <div className="space-y-6 max-w-2xl mx-auto">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">New Fee Plan</h1>
                <Link href="/fees" className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <form action="/api/fee-plans" method="POST" className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Plan Name *</label>
                    <input type="text" name="name" className="w-full px-3 py-2 border rounded-lg" placeholder="e.g. Class 1-5 Annual Fee" required />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year *</label>
                    <select name="academicYearId" className="w-full px-3 py-2 border rounded-lg" required>
                        <option value="">Select</option>
                        {academicYears.map(ay => <option key={ay.id} value={ay.id}>{ay.name} {ay.isCurrent ? '(Current)' : ''}</option>)}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Applicable Grades</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                        {grades.map(g => (
                            <label key={g.id} className="flex items-center gap-1 px-2 py-1 bg-gray-50 rounded text-sm cursor-pointer hover:bg-gray-100">
                                <input type="checkbox" name="gradeIds" value={g.id} />
                                {g.name}
                            </label>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea name="description" className="w-full px-3 py-2 border rounded-lg" rows={3} />
                </div>

                <button type="submit" className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Create Fee Plan
                </button>
            </form>
        </div>
    );
}
