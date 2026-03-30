import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getPeriods } from '@/lib/actions/timetable';

export default async function TeacherSchedulePage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const periods = await getPeriods();

    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = dayNames[new Date().getDay() - 1] || 'Monday';

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">My Schedule</h1>
                <p className="text-gray-600">Today: {today}</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border">
                <div className="p-4 border-b">
                    <h2 className="font-semibold">Today&apos;s Periods</h2>
                </div>
                <div className="divide-y">
                    {periods.map(period => (
                        <div key={period.id} className={`p-4 ${period.isBreak ? 'bg-yellow-50' : ''}`}>
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="font-medium">{period.name}</p>
                                    <p className="text-sm text-gray-500">{period.startTime} – {period.endTime}</p>
                                </div>
                                {period.isBreak && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded">Break</span>}
                            </div>
                        </div>
                    ))}
                    {periods.length === 0 && (
                        <div className="p-8 text-center text-gray-500">No periods configured.</div>
                    )}
                </div>
            </div>
        </div>
    );
}
