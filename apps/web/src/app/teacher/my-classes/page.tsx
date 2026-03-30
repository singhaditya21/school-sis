import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getSectionsForTimetable } from '@/lib/actions/timetable';

export default async function TeacherClassesPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const sections = await getSectionsForTimetable();

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">My Classes</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sections.map(sec => (
                    <div key={sec.id} className="bg-white rounded-xl shadow-sm border p-6">
                        <h3 className="font-semibold text-lg">{sec.gradeName} - {sec.sectionName}</h3>
                        <div className="mt-3 flex gap-2">
                            <a href={`/attendance/mark/${sec.id}`} className="text-sm text-blue-600 hover:underline">Mark Attendance</a>
                            <a href={`/timetable/${sec.id}`} className="text-sm text-purple-600 hover:underline">Timetable</a>
                        </div>
                    </div>
                ))}
                {sections.length === 0 && (
                    <div className="col-span-full bg-white rounded-xl shadow-sm border p-8 text-center text-gray-500">
                        No classes assigned yet.
                    </div>
                )}
            </div>
        </div>
    );
}
