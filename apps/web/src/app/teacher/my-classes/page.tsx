import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { pool } from '@/lib/db';
import Link from 'next/link';

export default async function TeacherClassesPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const { rows: sections } = await pool.query<{
        id: string;
        sectionName: string;
        gradeName: string;
    }>(
        `SELECT DISTINCT
            sec.id,
            sec.name AS "sectionName",
            g.name AS "gradeName"
         FROM timetable_entries te
         INNER JOIN sections sec
            ON sec.id = te.section_id
           AND sec.tenant_id = te.tenant_id
         INNER JOIN grades g
            ON g.id = sec.grade_id
           AND g.tenant_id = te.tenant_id
         WHERE te.tenant_id = $1 AND te.teacher_id = $2
         ORDER BY g.name, sec.name`,
        [session.tenantId, session.userId],
    );

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">My Classes</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sections.map(sec => (
                    <div key={sec.id} className="bg-white rounded-xl shadow-sm border p-6">
                        <h3 className="font-semibold text-lg">{sec.gradeName} - {sec.sectionName}</h3>
                        <div className="mt-3 flex gap-2">
                            <Link href={`/attendance/mark/${sec.id}`} className="text-sm text-blue-600 hover:underline">Mark Attendance</Link>
                            <Link href={`/timetable/${sec.id}`} className="text-sm text-purple-600 hover:underline">Timetable</Link>
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
