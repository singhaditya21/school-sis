import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { formatDate } from '@/lib/utils';
import { getStudents } from '@/lib/actions/students';

export default async function StudentsPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    // Fetch real students from database
    const { students, total } = await getStudents({ limit: 100 });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Students</h1>
                    <p className="text-gray-600 mt-1">{total} students enrolled</p>
                </div>
                <a href="/students/new" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Add Student
                </a>
            </div>

            <div className="bg-white rounded-xl shadow-sm border">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Admission No</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Class</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">DOB</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {students.map((student) => (
                                <tr key={student.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {student.admissionNumber}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <a href={`/students/${student.id}`} className="text-blue-600 hover:underline font-medium">
                                            {student.firstName} {student.lastName}
                                        </a>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {student.className}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {formatDate(student.dateOfBirth)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${student.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                                                student.status === 'INACTIVE' ? 'bg-gray-100 text-gray-700' :
                                                    'bg-yellow-100 text-yellow-700'
                                            }`}>
                                            {student.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <a href={`/students/${student.id}`} className="text-blue-600 hover:underline">
                                            View
                                        </a>
                                    </td>
                                </tr>
                            ))}
                            {students.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                        No students found. Add your first student to get started.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
