import { getSession } from '@/lib/auth/session';
import Link from 'next/link';

export default async function TimetableGridPage() {
    const session = await getSession();

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const periods = ['Period 1', 'Period 2', 'Period 3', 'Period 4', 'Period 5', 'Period 6', 'Period 7', 'Period 8'];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Timetable Grid</h1>
                <Link href="/timetable" className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
                <table className="w-full min-w-[800px]">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Period</th>
                            {days.map((day) => (
                                <th key={day} className="px-4 py-3 text-left text-sm font-medium text-gray-500">{day}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {periods.map((period) => (
                            <tr key={period}>
                                <td className="px-4 py-3 font-medium text-gray-900">{period}</td>
                                {days.map((day) => (
                                    <td key={`${period}-${day}`} className="px-4 py-3">
                                        <div className="h-12 bg-gray-50 rounded border-2 border-dashed border-gray-200 flex items-center justify-center text-xs text-gray-400">
                                            Click to assign
                                        </div>
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-700">
                    💡 This grid view is a placeholder. Timetable data will be fetched from the Java API when available.
                </p>
            </div>
        </div>
    );
}
