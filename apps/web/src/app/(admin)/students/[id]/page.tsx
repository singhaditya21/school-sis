import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';
import { getStudentDetail } from '@/lib/actions/queries';

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const student = await getStudentDetail(id);

    if (!student) {
        return <div className="p-8 text-center text-gray-500">Student not found.</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">{student.firstName} {student.lastName}</h1>
                    <p className="text-gray-600">{student.admissionNumber}</p>
                </div>
                <Link href="/students" className="text-blue-600 hover:underline">← Back to Students</Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h2 className="font-semibold text-gray-900 mb-4">Basic Information</h2>
                    <dl className="space-y-2 text-sm">
                        <div className="flex justify-between"><dt className="text-gray-500">Class</dt><dd>{student.gradeName} - {student.sectionName}</dd></div>
                        <div className="flex justify-between"><dt className="text-gray-500">Roll No</dt><dd>{student.rollNumber || 'N/A'}</dd></div>
                        <div className="flex justify-between"><dt className="text-gray-500">Date of Birth</dt><dd>{formatDate(student.dateOfBirth)}</dd></div>
                        <div className="flex justify-between"><dt className="text-gray-500">Gender</dt><dd>{student.gender}</dd></div>
                        <div className="flex justify-between"><dt className="text-gray-500">Blood Group</dt><dd>{student.bloodGroup || 'N/A'}</dd></div>
                        <div className="flex justify-between"><dt className="text-gray-500">Status</dt><dd>
                            <span className={`px-2 py-0.5 rounded text-xs ${student.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>{student.status}</span>
                        </dd></div>
                        <div className="flex justify-between"><dt className="text-gray-500">Admission Date</dt><dd>{formatDate(student.admissionDate)}</dd></div>
                    </dl>
                </div>

                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h2 className="font-semibold text-gray-900 mb-4">Contact & Address</h2>
                    <dl className="space-y-2 text-sm">
                        <div className="flex justify-between"><dt className="text-gray-500">Phone</dt><dd>{student.phone || 'N/A'}</dd></div>
                        <div className="flex justify-between"><dt className="text-gray-500">Email</dt><dd>{student.email || 'N/A'}</dd></div>
                        <div className="flex justify-between"><dt className="text-gray-500">Address</dt><dd>{student.address || 'N/A'}</dd></div>
                        <div className="flex justify-between"><dt className="text-gray-500">City</dt><dd>{student.city || 'N/A'}</dd></div>
                        <div className="flex justify-between"><dt className="text-gray-500">State</dt><dd>{student.state || 'N/A'}</dd></div>
                        <div className="flex justify-between"><dt className="text-gray-500">Pincode</dt><dd>{student.pincode || 'N/A'}</dd></div>
                    </dl>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6">
                <h2 className="font-semibold text-gray-900 mb-4">Guardians ({student.guardians.length})</h2>
                {student.guardians.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {student.guardians.map((g) => (
                            <div key={g.id} className="p-4 bg-gray-50 rounded-lg">
                                <p className="font-medium">{g.firstName} {g.lastName}</p>
                                <p className="text-sm text-gray-500">{g.relation} {g.isPrimary ? '(Primary)' : ''}</p>
                                <p className="text-sm text-gray-600">{g.phone}</p>
                                {g.email && <p className="text-sm text-gray-600">{g.email}</p>}
                                {g.occupation && <p className="text-sm text-gray-400">{g.occupation}</p>}
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-gray-500">No guardians linked.</p>
                )}
            </div>
        </div>
    );
}
