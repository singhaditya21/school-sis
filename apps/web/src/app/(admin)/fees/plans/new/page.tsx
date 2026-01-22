import { getSession } from '@/lib/auth/session';
import Link from 'next/link';

interface AcademicYear {
    id: string;
    name: string;
}

export default async function NewFeePlanPage() {
    const session = await getSession();

    let academicYears: AcademicYear[] = [];

    try {
        const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/academic-years`,
            {
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (response.ok) {
            const data = await response.json();
            academicYears = data.data?.content || data.content || [];
        }
    } catch (error) {
        console.error('[FeePlans] API Error:', error);
    }

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Create Fee Plan</h1>
                <Link href="/fees" className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <form action="/api/fee-plans" method="POST" className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Plan Name</label>
                    <input name="name" type="text" required className="w-full px-3 py-2 border rounded-lg" placeholder="e.g., Grade 8 Annual Fee" />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
                    <select name="academicYearId" className="w-full px-3 py-2 border rounded-lg">
                        {academicYears.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea name="description" rows={2} className="w-full px-3 py-2 border rounded-lg"></textarea>
                </div>

                <div className="border-t pt-4">
                    <h3 className="font-semibold mb-3">Fee Components</h3>
                    <div className="space-y-3" id="components">
                        <div className="grid grid-cols-3 gap-2">
                            <input name="components[0].name" placeholder="Component name" className="px-3 py-2 border rounded-lg" />
                            <input name="components[0].amount" type="number" placeholder="Amount" className="px-3 py-2 border rounded-lg" />
                            <select name="components[0].frequency" className="px-3 py-2 border rounded-lg">
                                <option value="ONE_TIME">One Time</option>
                                <option value="MONTHLY">Monthly</option>
                                <option value="QUARTERLY">Quarterly</option>
                                <option value="ANNUAL">Annual</option>
                            </select>
                        </div>
                    </div>
                </div>

                <button type="submit" className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Create Plan
                </button>
            </form>
        </div>
    );
}
