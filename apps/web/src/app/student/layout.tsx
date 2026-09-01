import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { resolveStudentSelf } from './_lib/queries';
import { StudentNav, type StudentNavLink } from './_components/StudentNav';

/** Nav targets live here so scripts/check-navigation-targets.mjs keeps verifying them. */
const STUDENT_NAV_LINKS: StudentNavLink[] = [
    { href: '/student', icon: '📊', label: 'Overview' },
    { href: '/student/attendance', icon: '🗓️', label: 'Attendance' },
    { href: '/student/results', icon: '📄', label: 'Results' },
    { href: '/student/homework', icon: '📝', label: 'Homework' },
];

function initials(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('');
}

export default async function StudentLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSession();

    if (!session.isLoggedIn) {
        redirect('/login');
    }

    if (session.role !== 'STUDENT') {
        redirect('/unauthorized');
    }

    // Real identity, or nothing. The header used to hard-code "Aarav Sharma /
    // B.Tech CS - Yr 2" for every signed-in student.
    const student = await resolveStudentSelf('profile:read:own');

    return (
        <div className="min-h-screen bg-muted">
            <header className="bg-white border-b border-border sticky top-0 z-50">
                <div className="px-4 py-3 md:px-6 md:py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-xl flex items-center justify-center">
                                <span className="text-white text-lg md:text-xl">🎓</span>
                            </div>
                            <div>
                                <h1 className="text-lg md:text-xl font-bold text-foreground leading-tight">
                                    ScholarMind
                                </h1>
                                <p className="text-xs text-muted-foreground font-medium">Student Portal</p>
                            </div>
                        </div>
                        {student && (
                            <div className="flex items-center gap-3">
                                <div className="hidden md:flex flex-col items-end mr-2">
                                    <span className="text-sm font-semibold text-foreground">{student.fullName}</span>
                                    <span className="text-xs text-accent-foreground font-medium bg-accent px-2 py-0.5 rounded">
                                        {student.gradeName} · {student.sectionName}
                                    </span>
                                </div>
                                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-accent flex items-center justify-center text-accent-foreground font-bold border border-border shadow-sm">
                                    {initials(student.fullName)}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <div className="flex flex-col md:flex-row min-h-[calc(100vh-65px)]">
                <aside className="fixed bottom-0 left-0 right-0 md:relative md:w-64 bg-white border-t md:border-t-0 md:border-r border-border z-40">
                    <StudentNav links={STUDENT_NAV_LINKS} />
                </aside>

                <main className="flex-1 p-4 md:p-6 lg:p-8 pb-20 md:pb-8">{children}</main>
            </div>
        </div>
    );
}
