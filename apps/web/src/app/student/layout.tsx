import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { ScholarMindCrest } from '@/components/brand/ScholarMindCrest';
import { resolveStudentSelf } from './_lib/queries';
import { StudentNav, type StudentNavLink } from './_components/StudentNav';

/** Nav targets live here so scripts/check-navigation-targets.mjs keeps verifying them. */
const STUDENT_NAV_LINKS: StudentNavLink[] = [
    { href: '/student', icon: 'overview', label: 'Overview' },
    { href: '/student/attendance', icon: 'attendance', label: 'Attendance' },
    { href: '/student/results', icon: 'results', label: 'Results' },
    { href: '/student/homework', icon: 'homework', label: 'Homework' },
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

    const student = await resolveStudentSelf('profile:read:own');

    return (
        <div className="min-h-screen bg-muted">
            <header className="bg-card border-b border-border sticky top-0 z-50">
                <div className="h-[2px] w-full bg-gradient-to-r from-primary via-brass to-primary" />
                <div className="px-4 py-3 md:px-6 md:py-3.5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <ScholarMindCrest size="md" />
                            <div>
                                <h1 className="text-lg font-bold text-foreground leading-tight">
                                    ScholarMind
                                </h1>
                                <p className="text-xs text-muted-foreground font-medium">
                                    Student Scholar Portal
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {student && (
                                <>
                                    <div className="hidden md:flex flex-col items-end mr-1">
                                        <span className="text-sm font-semibold text-foreground">
                                            {student.fullName}
                                        </span>
                                        <span className="text-xs text-accent-foreground font-semibold bg-accent border border-brass/25 px-2 py-0.5 rounded">
                                            {student.gradeName} · {student.sectionName}
                                        </span>
                                    </div>
                                    <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-accent flex items-center justify-center text-accent-foreground font-bold border border-brass/30 shadow-sm text-sm">
                                        {initials(student.fullName)}
                                    </div>
                                </>
                            )}
                            <form action="/api/logout" method="POST">
                                <button
                                    type="submit"
                                    className="px-3 py-1.5 text-xs md:text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg border border-border transition-colors"
                                >
                                    Sign Out
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex flex-col md:flex-row min-h-[calc(100vh-65px)]">
                <aside className="fixed bottom-0 left-0 right-0 md:relative md:w-64 bg-card border-t md:border-t-0 md:border-r border-border z-40">
                    <StudentNav links={STUDENT_NAV_LINKS} />
                </aside>

                <main className="flex-1 p-4 md:p-6 lg:p-8 pb-20 md:pb-8">{children}</main>
            </div>
        </div>
    );
}
