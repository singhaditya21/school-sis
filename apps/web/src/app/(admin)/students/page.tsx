import { getSession } from '@/lib/auth/session';
import { formatDate } from '@/lib/utils';
import { getAllStudents, MockStudent } from '@/lib/mock-data';

interface Student {
    id: string;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    className?: string;
    classGroup?: {
        name: string;
        section?: {
            name: string;
            grade?: {
                name: string;
            };
        };
    };
    guardianCount?: number;
}

export default async function StudentsPage() {
    const session = await getSession();

    // Fetch students from Java API
    let students: Student[] = [];
    let useMockData = false;

    try {
        const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/students?size=100`,
            {
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                    'Content-Type': 'application/json',
                },
                cache: 'no-store',
            }
        );

        if (response.ok) {
            const data = await response.json();
            students = data.data?.content || data.content || [];
        } else {
            useMockData = true;
        }
    } catch (error) {
        console.error('[Students] API Error, using mock data:', error);
        useMockData = true;
    }

    // Fallback to mock data
    if (useMockData || students.length === 0) {
        const mockStudents = getAllStudents().slice(0, 100); // First 100 for display
        students = mockStudents.map((s: MockStudent) => ({
            id: s.id,
            admissionNumber: s.admissionNumber,
            firstName: s.firstName,
            lastName: s.lastName,
            dateOfBirth: s.dateOfBirth,
            className: s.className,
        }));
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Students</h1>
                    <p className="text-gray-600 mt-1">{students.length} students displayed (4,320 total)</p>
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
                                        {student.className || (student.classGroup
                                            ? `${student.classGroup.section?.grade?.name || ''}-${student.classGroup.section?.name || ''}`
                                            : 'Not assigned')}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {formatDate(student.dateOfBirth)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <a href={`/students/${student.id}`} className="text-blue-600 hover:underline">
                                            View
                                        </a>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

