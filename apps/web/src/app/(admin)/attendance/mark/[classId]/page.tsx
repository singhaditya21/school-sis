import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';
import { getStudentsBySection, getSectionInfo, getAttendanceForSection } from '@/lib/actions/queries';

export default async function MarkAttendancePage({ params }: { params: Promise<{ classId: string }> }) {
    const { classId: sectionId } = await params;
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const today = new Date().toISOString().split('T')[0];

    const sectionInfo = await getSectionInfo(sectionId);
    const students = await getStudentsBySection(sectionId);
    const existing = await getAttendanceForSection(sectionId, today);

    const existingMap = new Map(existing.map(r => [r.studentId, r.status]));

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Mark Attendance</h1>
                    <p className="text-gray-600">
                        {sectionInfo ? `${sectionInfo.gradeName} - ${sectionInfo.sectionName}` : 'Section'} • {formatDate(new Date())}
                    </p>
                </div>
                <Link href="/attendance" className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <form action="/api/attendance" method="POST" className="bg-white rounded-xl shadow-sm border">
                <input type="hidden" name="sectionId" value={sectionId} />
                <input type="hidden" name="date" value={today} />

                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Roll</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Admission No</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Name</th>
                            <th className="px-4 py-3 text-center text-sm font-medium text-gray-500">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {students.map((student) => {
                            const currentStatus = existingMap.get(student.id) || 'PRESENT';
                            return (
                                <tr key={student.id}>
                                    <td className="px-4 py-3 text-sm">{student.rollNumber || '—'}</td>
                                    <td className="px-4 py-3 text-sm">{student.admissionNumber}</td>
                                    <td className="px-4 py-3 text-sm font-medium">{student.firstName} {student.lastName}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex justify-center gap-3">
                                            {['PRESENT', 'ABSENT', 'LATE'].map((status) => (
                                                <label key={status} className="flex items-center gap-1 cursor-pointer">
                                                    <input
                                                        type="radio"
                                                        name={`status[${student.id}]`}
                                                        value={status}
                                                        defaultChecked={currentStatus === status}
                                                    />
                                                    <span className={`text-xs px-1.5 py-0.5 rounded ${status === 'PRESENT' ? 'text-green-700' :
                                                            status === 'ABSENT' ? 'text-red-700' :
                                                                'text-yellow-700'
                                                        }`}>{status}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {students.length === 0 && (
                            <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No students in this section.</td></tr>
                        )}
                    </tbody>
                </table>

                <div className="p-4 border-t">
                    <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                        Save Attendance
                    </button>
                </div>
            </form>
        </div>
    );
}
