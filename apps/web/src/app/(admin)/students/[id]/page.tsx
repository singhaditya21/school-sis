import { getSession } from '@/lib/auth/session';
import Link from 'next/link';

interface Student {
    id: string;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    gender?: string;
    bloodGroup?: string;
    classGroup?: { name: string; section: { name: string; grade: { name: string } } };
    guardians: { name: string; phone: string; relationship: string }[];
}

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getSession();

    let student: Student | null = null;

    try {
        const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/students/${id}`,
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
            student = data.data || data;
        }
    } catch (error) {
        console.error('[Student] API Error:', error);
    }

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
                        <div className="flex justify-between">
                            <dt className="text-gray-500">Class</dt>
                            <dd className="text-gray-900">{student.classGroup?.section?.grade?.name || 'Not assigned'}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-gray-500">Date of Birth</dt>
                            <dd className="text-gray-900">{student.dateOfBirth || 'N/A'}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-gray-500">Gender</dt>
                            <dd className="text-gray-900">{student.gender || 'N/A'}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-gray-500">Blood Group</dt>
                            <dd className="text-gray-900">{student.bloodGroup || 'N/A'}</dd>
                        </div>
                    </dl>
                </div>

                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h2 className="font-semibold text-gray-900 mb-4">Guardians</h2>
                    {student.guardians?.length > 0 ? (
                        <div className="space-y-3">
                            {student.guardians.map((g, i) => (
                                <div key={i} className="p-3 bg-gray-50 rounded-lg">
                                    <p className="font-medium">{g.name}</p>
                                    <p className="text-sm text-gray-500">{g.relationship} • {g.phone}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-gray-500">No guardians linked.</p>
                    )}
                </div>
            </div>
        </div>
    );
}
