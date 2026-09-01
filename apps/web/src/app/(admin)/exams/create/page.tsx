import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import Link from 'next/link';
import { getAcademicYears } from '@/lib/actions/queries';
import { createExam } from '@/lib/actions/exams';

export default async function CreateExamPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const academicYears = await getAcademicYears();

    return (
        <div className="space-y-6 max-w-2xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground dark:text-white">Create Exam</h1>
                    <p className="text-muted-foreground mt-1">Set up a new examination</p>
                </div>
                <Link href="/exams" className="text-primary hover:underline text-sm">← Back</Link>
            </div>

            <form action={createExam} className="bg-card rounded-xl shadow-sm border border-border dark:border-gray-800 p-6 space-y-4">
                <div>
                    <label className="block text-sm font-medium text-foreground dark:text-gray-300 mb-1">Exam Name *</label>
                    <input type="text" name="name" required placeholder="e.g. Term 1 Exam 2025-26"
                        className="w-full px-3 py-2 border border-border dark:border-gray-700 rounded-lg bg-card text-sm focus:ring-2 focus:ring-ring" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-foreground dark:text-gray-300 mb-1">Type *</label>
                        <select name="type" required
                            className="w-full px-3 py-2 border border-border dark:border-gray-700 rounded-lg bg-card text-sm focus:ring-2 focus:ring-ring">
                            <option value="UNIT_TEST">Unit Test</option>
                            <option value="MID_TERM">Mid-Term</option>
                            <option value="FINAL">Final</option>
                            <option value="PRACTICE">Practice</option>
                            <option value="BOARD_PREP">Board Prep</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-foreground dark:text-gray-300 mb-1">Academic Year *</label>
                        <select name="academicYearId" required
                            className="w-full px-3 py-2 border border-border dark:border-gray-700 rounded-lg bg-card text-sm focus:ring-2 focus:ring-ring">
                            <option value="">Select</option>
                            {academicYears.map(ay => <option key={ay.id} value={ay.id}>{ay.name} {ay.isCurrent ? '(Current)' : ''}</option>)}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-foreground dark:text-gray-300 mb-1">Start Date *</label>
                        <input type="date" name="startDate" required
                            className="w-full px-3 py-2 border border-border dark:border-gray-700 rounded-lg bg-card text-sm focus:ring-2 focus:ring-ring" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-foreground dark:text-gray-300 mb-1">End Date *</label>
                        <input type="date" name="endDate" required
                            className="w-full px-3 py-2 border border-border dark:border-gray-700 rounded-lg bg-card text-sm focus:ring-2 focus:ring-ring" />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-foreground dark:text-gray-300 mb-1">Description</label>
                    <textarea name="description" rows={3} placeholder="Optional description..."
                        className="w-full px-3 py-2 border border-border dark:border-gray-700 rounded-lg bg-card text-sm focus:ring-2 focus:ring-ring" />
                </div>

                <button type="submit" className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium">
                    Create Exam
                </button>
            </form>
        </div>
    );
}
