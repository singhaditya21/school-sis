import Link from 'next/link';
import {
    BookOpen,
    CalendarDays,
    ClipboardList,
    GraduationCap,
    LogOut,
    UserRound,
    Users,
} from 'lucide-react';
import { requireAuth } from '@/lib/auth/middleware';
import { pool } from '@/lib/db';

interface TeacherProfileRow {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    employeeId: string | null;
    departmentName: string | null;
    designationName: string | null;
    joiningDate: string | Date | null;
    qualification: string | null;
    specialization: string | null;
    staffStatus: string | null;
}

interface TeacherAssignmentRow {
    subjectName: string;
    className: string;
}

function provided(value: string | null | undefined): string {
    return value?.trim() || 'Not provided';
}

function formatDate(value: string | Date | null): string {
    if (!value) return 'Not provided';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not provided';
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function initialsFor(firstName: string, lastName: string): string {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || 'T';
}

export default async function TeacherProfilePage() {
    const { tenantId, userId } = await requireAuth('profile:read:own');

    let profile: TeacherProfileRow | undefined;
    let assignments: TeacherAssignmentRow[] = [];
    let loadFailed = false;

    try {
        const [profileResult, assignmentResult] = await Promise.all([
            pool.query(`
                SELECT
                    u.first_name AS "firstName",
                    u.last_name AS "lastName",
                    u.email,
                    u.phone,
                    sp.employee_id AS "employeeId",
                    sd.name AS "departmentName",
                    d.name AS "designationName",
                    sp.joining_date AS "joiningDate",
                    sp.qualification,
                    sp.specialization,
                    sp.status AS "staffStatus"
                FROM users u
                LEFT JOIN staff_profiles sp
                    ON sp.user_id = u.id AND sp.tenant_id = u.tenant_id
                LEFT JOIN staff_departments sd
                    ON sd.id = sp.department_id AND sd.tenant_id = u.tenant_id
                LEFT JOIN designations d
                    ON d.id = sp.designation_id AND d.tenant_id = u.tenant_id
                WHERE u.id = $1 AND u.tenant_id = $2
                LIMIT 1
            `, [userId, tenantId]),
            pool.query(`
                SELECT DISTINCT
                    sub.name AS "subjectName",
                    g.name || ' – ' || sec.name AS "className"
                FROM timetable_entries te
                INNER JOIN subjects sub
                    ON sub.id = te.subject_id AND sub.tenant_id = te.tenant_id
                INNER JOIN sections sec
                    ON sec.id = te.section_id AND sec.tenant_id = te.tenant_id
                INNER JOIN grades g
                    ON g.id = sec.grade_id AND g.tenant_id = te.tenant_id
                WHERE te.teacher_id = $1 AND te.tenant_id = $2
                ORDER BY "subjectName", "className"
            `, [userId, tenantId]),
        ]);

        profile = profileResult.rows[0] as TeacherProfileRow | undefined;
        assignments = assignmentResult.rows as TeacherAssignmentRow[];
    } catch (error) {
        console.error('Unable to load teacher profile:', error);
        loadFailed = true;
    }

    if (loadFailed) {
        return (
            <div role="alert" className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-red-50 p-6 text-red-900">
                <h1 className="text-lg font-semibold">Teacher profile unavailable</h1>
                <p className="mt-2 text-sm">The profile could not be loaded from the school database. Try again later or contact an administrator.</p>
            </div>
        );
    }

    if (!profile) {
        return (
            <div role="status" className="mx-auto max-w-3xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
                <h1 className="text-lg font-semibold">Teacher account not found</h1>
                <p className="mt-2 text-sm">This signed-in account does not have a user record in the active institution.</p>
            </div>
        );
    }

    const fullName = `${profile.firstName} ${profile.lastName}`.trim() || profile.email;
    const subjects = [...new Set(assignments.map(assignment => assignment.subjectName).filter(Boolean))];
    const classesAssigned = [...new Set(assignments.map(assignment => assignment.className).filter(Boolean))];
    const hasStaffProfile = Boolean(profile.employeeId);

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-6 text-white">
                <div className="flex items-center gap-6">
                    <div
                        aria-label={`${fullName} profile`}
                        className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center text-3xl font-bold"
                    >
                        {initialsFor(profile.firstName, profile.lastName)}
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">{fullName}</h1>
                        <p className="text-emerald-100">{provided(profile.designationName)}</p>
                        <p className="text-emerald-200 text-sm mt-1">
                            {hasStaffProfile ? provided(profile.departmentName) : 'Staff profile not linked'}
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-2 p-4 border-b border-gray-100">
                    <ClipboardList className="h-5 w-5 text-emerald-700" aria-hidden="true" />
                    <h2 className="font-semibold text-gray-900">Personal Information</h2>
                </div>
                <div className="p-4 space-y-4">
                    <InfoRow label="Employee ID" value={provided(profile.employeeId)} />
                    <InfoRow label="Email" value={profile.email} />
                    <InfoRow label="Phone" value={provided(profile.phone)} />
                    <InfoRow label="Joining Date" value={formatDate(profile.joiningDate)} />
                    <InfoRow label="Staff Status" value={provided(profile.staffStatus)} />
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-2 p-4 border-b border-gray-100">
                    <GraduationCap className="h-5 w-5 text-blue-700" aria-hidden="true" />
                    <h2 className="font-semibold text-gray-900">Professional Details</h2>
                </div>
                <div className="p-4 space-y-4">
                    <InfoRow label="Qualification" value={provided(profile.qualification)} />
                    <InfoRow label="Specialization" value={provided(profile.specialization)} />
                    <InfoRow label="Department" value={provided(profile.departmentName)} />
                    <InfoRow label="Designation" value={provided(profile.designationName)} />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AssignmentCard
                    icon={<BookOpen className="h-5 w-5 text-purple-700" aria-hidden="true" />}
                    title="Subjects"
                    values={subjects}
                    emptyMessage="No timetable subjects are assigned."
                    className="bg-purple-50 text-purple-700"
                />
                <AssignmentCard
                    icon={<Users className="h-5 w-5 text-emerald-700" aria-hidden="true" />}
                    title="Classes Assigned"
                    values={classesAssigned}
                    emptyMessage="No timetable classes are assigned."
                    className="bg-emerald-50 text-emerald-700"
                />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Link
                    href="/teacher/schedule"
                    className="flex items-center justify-center gap-2 bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow text-center"
                >
                    <CalendarDays className="h-5 w-5 text-emerald-700" aria-hidden="true" />
                    <span className="font-medium">View Schedule</span>
                </Link>
                <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-4 text-center text-gray-600">
                    <UserRound className="h-5 w-5" aria-hidden="true" />
                    <span className="text-sm">Profile editing is not currently available.</span>
                </div>
            </div>

            <form action="/api/logout" method="POST" className="text-center">
                <button type="submit" className="inline-flex items-center gap-2 text-sm text-red-600 hover:underline">
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    Sign out
                </button>
            </form>
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-4 items-center py-2 border-b border-gray-50 last:border-0">
            <span className="text-gray-500">{label}</span>
            <span className="font-medium text-gray-900 text-right">{value}</span>
        </div>
    );
}

function AssignmentCard({
    icon,
    title,
    values,
    emptyMessage,
    className,
}: {
    icon: React.ReactNode;
    title: string;
    values: string[];
    emptyMessage: string;
    className: string;
}) {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 p-4 border-b border-gray-100">
                {icon}
                <h2 className="font-semibold text-gray-900">{title}</h2>
            </div>
            <div className="p-4">
                {values.length === 0 ? (
                    <p className="text-sm text-gray-500">{emptyMessage}</p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {values.map(value => (
                            <span key={value} className={`px-3 py-1.5 rounded-full text-sm ${className}`}>
                                {value}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
