import { getSession } from '@/lib/auth/session';
import Link from 'next/link';

interface ClassGroup {
    id: string;
    name: string;
    section: { name: string; grade: { name: string } };
}

export default async function NewStudentPage() {
    const session = await getSession();

    // Fetch class groups for dropdown
    let classGroups: ClassGroup[] = [];

    try {
        const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/classes`,
            {
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (response.ok) {
            const data = await response.json();
            classGroups = data.data?.content || data.content || [];
        }
    } catch (error) {
        console.error('[Students] API Error:', error);
    }

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold">Add New Student</h1>
                <Link href="/students" className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <form action="/api/students" method="POST" className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                        <input name="firstName" type="text" required className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                        <input name="lastName" type="text" required className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Admission Number</label>
                    <input name="admissionNumber" type="text" required className="w-full px-3 py-2 border rounded-lg" />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                    <input name="dateOfBirth" type="date" required className="w-full px-3 py-2 border rounded-lg" />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
                    <select name="classGroupId" className="w-full px-3 py-2 border rounded-lg">
                        <option value="">Select Class</option>
                        {classGroups.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.section?.grade?.name || 'Class'} - {c.section?.name || 'Section'}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex gap-3 pt-4">
                    <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        Save Student
                    </button>
                    <Link href="/students" className="px-4 py-2 border rounded-lg hover:bg-gray-50">
                        Cancel
                    </Link>
                </div>
            </form>
        </div>
    );
}
