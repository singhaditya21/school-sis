import { getSession } from '@/lib/auth/session';
import Link from 'next/link';

export default async function TeacherProfilePage() {
    const session = await getSession();

    // Mock teacher profile data
    const profile = {
        name: 'Dr. Ramesh Kumar',
        email: session.email || 'teacher@school.edu',
        employeeId: 'EMP-2019-0042',
        department: 'Mathematics',
        designation: 'Senior Teacher',
        joiningDate: '2019-06-15',
        phone: '+91 98765 43210',
        qualifications: ['Ph.D. Mathematics', 'M.Sc. Mathematics', 'B.Ed.'],
        subjects: ['Mathematics', 'Statistics'],
        classesAssigned: ['10-A', '10-B', '11-A', '11-B', '12-A', '9-A'],
    };

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            {/* Profile Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-6 text-white">
                <div className="flex items-center gap-6">
                    <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center text-4xl">
                        👨‍🏫
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">{profile.name}</h1>
                        <p className="text-emerald-100">{profile.designation}</p>
                        <p className="text-emerald-200 text-sm mt-1">{profile.department}</p>
                    </div>
                </div>
            </div>

            {/* Profile Details */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100">
                <div className="p-4 border-b border-gray-100">
                    <h2 className="font-semibold text-gray-900">📋 Personal Information</h2>
                </div>
                <div className="p-4 space-y-4">
                    <InfoRow label="Employee ID" value={profile.employeeId} />
                    <InfoRow label="Email" value={profile.email} />
                    <InfoRow label="Phone" value={profile.phone} />
                    <InfoRow label="Joining Date" value={new Date(profile.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} />
                </div>
            </div>

            {/* Qualifications */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100">
                <div className="p-4 border-b border-gray-100">
                    <h2 className="font-semibold text-gray-900">🎓 Qualifications</h2>
                </div>
                <div className="p-4">
                    <div className="flex flex-wrap gap-2">
                        {profile.qualifications.map((qual, idx) => (
                            <span
                                key={idx}
                                className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-sm"
                            >
                                {qual}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* Subjects & Classes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100">
                    <div className="p-4 border-b border-gray-100">
                        <h2 className="font-semibold text-gray-900">📚 Subjects</h2>
                    </div>
                    <div className="p-4">
                        <div className="flex flex-wrap gap-2">
                            {profile.subjects.map((subject, idx) => (
                                <span
                                    key={idx}
                                    className="px-3 py-1.5 bg-purple-50 text-purple-700 rounded-full text-sm"
                                >
                                    {subject}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100">
                    <div className="p-4 border-b border-gray-100">
                        <h2 className="font-semibold text-gray-900">👥 Classes Assigned</h2>
                    </div>
                    <div className="p-4">
                        <div className="flex flex-wrap gap-2">
                            {profile.classesAssigned.map((cls, idx) => (
                                <span
                                    key={idx}
                                    className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-sm"
                                >
                                    {cls}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-4">
                <Link
                    href="/teacher/schedule"
                    className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow text-center"
                >
                    <span className="text-3xl">📅</span>
                    <p className="font-medium mt-2">View Schedule</p>
                </Link>
                <button className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow text-center">
                    <span className="text-3xl">✏️</span>
                    <p className="font-medium mt-2">Edit Profile</p>
                </button>
            </div>

            {/* Logout */}
            <div className="text-center">
                <Link
                    href="/login"
                    className="text-red-600 hover:underline text-sm"
                >
                    🚪 Logout
                </Link>
            </div>
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
            <span className="text-gray-500">{label}</span>
            <span className="font-medium text-gray-900">{value}</span>
        </div>
    );
}
