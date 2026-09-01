import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMyProfile } from '../_actions/profile';
import { getMyClasses } from '../_actions/classes';
import { logoutAction } from '@/lib/actions/auth';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * The teacher's real record.
 *
 * This page used to show a hard-coded "Dr. Ramesh Kumar", an invented employee
 * id, three invented degrees and six invented class assignments to whoever
 * logged in. Everything below comes from `users` and `staff_profiles`; where HR
 * has not filled a field in, the page says it is not recorded.
 */
export default async function TeacherProfilePage() {
    const [profile, classes] = await Promise.all([getMyProfile(), getMyClasses()]);
    if (!profile) notFound();

    const subjects = Array.from(
        new Set(
            classes
                .flatMap((cls) => cls.subjects.split(', '))
                .map((name) => name.trim())
                .filter(Boolean)
        )
    ).sort();

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-6 text-white">
                <h1 className="text-2xl font-bold">
                    {profile.firstName} {profile.lastName}
                </h1>
                <p className="text-emerald-100">
                    {profile.designationName ?? 'Designation not recorded'}
                    {profile.departmentName ? ` · ${profile.departmentName}` : ''}
                </p>
                <p className="text-emerald-200 text-sm mt-1">{profile.email}</p>
            </div>

            {!profile.hasStaffRecord && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                    HR has not created a staff record for this account yet, so employee id, department,
                    designation, joining date and qualifications are all blank below. They are not hidden —
                    they genuinely have no value in the system.
                </div>
            )}

            <div className="bg-card rounded-xl shadow-sm border border-border">
                <div className="p-4 border-b border-border">
                    <h2 className="font-semibold text-foreground">Account</h2>
                </div>
                <div className="p-4 space-y-1">
                    <InfoRow label="Email" value={profile.email} />
                    <InfoRow label="Phone" value={profile.phone} />
                    <InfoRow label="Role" value={profile.role} />
                    <InfoRow label="Account active" value={profile.isActive ? 'Yes' : 'No'} />
                    <InfoRow
                        label="Last sign-in"
                        value={profile.lastLoginAt ? formatDate(profile.lastLoginAt) : null}
                    />
                </div>
            </div>

            <div className="bg-card rounded-xl shadow-sm border border-border">
                <div className="p-4 border-b border-border">
                    <h2 className="font-semibold text-foreground">Staff record</h2>
                </div>
                <div className="p-4 space-y-1">
                    <InfoRow label="Employee ID" value={profile.employeeId} />
                    <InfoRow label="Department" value={profile.departmentName} />
                    <InfoRow label="Designation" value={profile.designationName} />
                    <InfoRow label="Employment type" value={profile.employmentType} />
                    <InfoRow label="Staff status" value={profile.staffStatus} />
                    <InfoRow
                        label="Joining date"
                        value={profile.joiningDate ? formatDate(profile.joiningDate) : null}
                    />
                    <InfoRow label="Qualification" value={profile.qualification} />
                    <InfoRow label="Specialisation" value={profile.specialization} />
                    <InfoRow
                        label="Experience"
                        value={
                            profile.experienceYears !== null
                                ? `${profile.experienceYears} year(s)`
                                : null
                        }
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-card rounded-xl shadow-sm border border-border">
                    <div className="p-4 border-b border-border">
                        <h2 className="font-semibold text-foreground">Subjects on your timetable</h2>
                    </div>
                    <div className="p-4">
                        {subjects.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No timetabled subjects.</p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {subjects.map((subject) => (
                                    <span
                                        key={subject}
                                        className="px-3 py-1.5 bg-purple-50 text-purple-700 rounded-full text-sm"
                                    >
                                        {subject}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-card rounded-xl shadow-sm border border-border">
                    <div className="p-4 border-b border-border">
                        <h2 className="font-semibold text-foreground">Classes assigned</h2>
                    </div>
                    <div className="p-4">
                        {classes.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No classes assigned.</p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {classes.map((cls) => (
                                    <span
                                        key={cls.sectionId}
                                        className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-sm"
                                    >
                                        {cls.gradeName}-{cls.sectionName}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <Link href="/teacher/schedule" className="text-sm text-primary hover:underline">
                    View my schedule →
                </Link>
                <form action={logoutAction}>
                    <button type="submit" className="text-red-600 hover:underline text-sm">
                        Sign out
                    </button>
                </form>
            </div>

            <p className="text-xs text-muted-foreground text-center">
                Staff details are maintained by the school office. There is no self-service edit for them, so
                this page does not offer one.
            </p>
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
    return (
        <div className="flex justify-between items-center gap-4 py-2 border-b border-gray-50 last:border-0">
            <span className="text-muted-foreground text-sm">{label}</span>
            <span className={value ? 'font-medium text-foreground text-sm' : 'text-muted-foreground text-sm italic'}>
                {value ?? 'Not recorded'}
            </span>
        </div>
    );
}
