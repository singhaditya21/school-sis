import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getPeriods } from '@/lib/actions/timetable';
import { pool } from '@/lib/db';
import { Badge } from '@/components/ui/badge';

export default async function TeacherSchedulePage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const periods = await getPeriods();

    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = dayNames[new Date().getDay() - 1] || 'Monday';
    const todayUpper = today.toUpperCase();
    const todayDate = new Date().toISOString().split('T')[0];

    // Regular entries for today
    const { rows: regularEntries } = await pool.query(
        `SELECT te.period_id, sub.name AS subject_name, g.name || '-' || sec.name AS class_name, te.room_number
         FROM timetable_entries te
         JOIN subjects sub ON sub.id = te.subject_id
         JOIN sections sec ON sec.id = te.section_id
         JOIN grades g ON g.id = sec.grade_id
         WHERE te.teacher_id = $1 AND te.day_of_week = $2 AND te.tenant_id = $3`,
         [session.userId, todayUpper, session.tenantId]
    );

    // Substitutions for today (where this teacher is the substitute)
    const { rows: substitutions } = await pool.query(
        `SELECT sr.period, sr.reason AS subject_name, g.name || '-' || sec.name AS class_name
         FROM substitution_requests sr
         JOIN sections sec ON sec.id = sr.section_id
         JOIN grades g ON g.id = sec.grade_id
         WHERE sr.substitute_id = $1 AND sr.date = $2 AND sr.status = 'approved' AND sr.tenant_id = $3`,
         [session.userId, todayDate, session.tenantId]
    );

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">My Schedule</h1>
                <p className="text-gray-600">Today: {today} ({todayDate})</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border">
                <div className="p-4 border-b">
                    <h2 className="font-semibold">Today&apos;s Periods</h2>
                </div>
                <div className="divide-y" data-testid="teacher-schedule-list">
                    {periods.map(period => {
                        // Find regular entry for this period
                        const regular = regularEntries.find(r => r.period_id === period.id);
                        // Find substitution for this period. Note: period name could be "Period 1", we match displayOrder or name
                        const subNumber = parseInt(period.name.replace(/\D/g, '')) || period.displayOrder;
                        const sub = substitutions.find(s => s.period === subNumber);

                        return (
                            <div key={period.id} className={`p-4 ${period.isBreak ? 'bg-yellow-50' : ''}`} data-testid={`schedule-period-${subNumber}`}>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="font-medium text-gray-900">{period.name}</p>
                                        <p className="text-sm text-gray-500">{period.startTime} – {period.endTime}</p>
                                    </div>
                                    <div className="text-right">
                                        {sub ? (
                                            <div className="space-y-1">
                                                <Badge className="bg-green-600 text-white" data-testid="substitution-badge">Substitution</Badge>
                                                <p className="text-sm font-semibold text-green-700">{sub.subject_name}</p>
                                                <p className="text-xs text-gray-500">Class: {sub.class_name}</p>
                                            </div>
                                        ) : regular ? (
                                            <div>
                                                <p className="text-sm font-semibold text-blue-700">{regular.subject_name}</p>
                                                <p className="text-xs text-gray-500">Class: {regular.class_name}</p>
                                                {regular.room_number && (
                                                    <p className="text-xs text-gray-400">Room {regular.room_number}</p>
                                                )}
                                            </div>
                                        ) : period.isBreak ? (
                                            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded">Break</span>
                                        ) : (
                                            <span className="text-xs text-gray-400 italic">Free Period</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {periods.length === 0 && (
                        <div className="p-8 text-center text-gray-500">No periods configured.</div>
                    )}
                </div>
            </div>
        </div>
    );
}
