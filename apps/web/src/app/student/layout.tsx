import { getSession } from '@/lib/auth/session';
import { pool } from '@/lib/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { GraduationCap, Home } from 'lucide-react';

interface StudentIdentity {
    name: string;
    academicContext: string;
    initials: string;
}

function initialsFor(name: string): string {
    const initials = name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part.charAt(0).toUpperCase())
        .join('');

    return initials || 'S';
}

async function loadStudentIdentity(input: {
    userId: string;
    tenantId: string;
    displayName?: string;
    email: string;
}): Promise<StudentIdentity> {
    const accountName = input.displayName?.trim() || input.email || 'Student account';

    try {
        const { rows } = await pool.query(`
            SELECT
                TRIM(CONCAT(s.first_name, ' ', s.last_name)) AS name,
                g.name AS "gradeName",
                sec.name AS "sectionName"
            FROM students s
            LEFT JOIN grades g ON g.id = s.grade_id AND g.tenant_id = s.tenant_id
            LEFT JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = s.tenant_id
            WHERE s.user_id = $1 AND s.tenant_id = $2
            LIMIT 1
        `, [input.userId, input.tenantId]);

        const profile = rows[0] as { name?: string; gradeName?: string | null; sectionName?: string | null } | undefined;
        if (!profile) {
            return {
                name: accountName,
                academicContext: 'Student profile not linked',
                initials: initialsFor(accountName),
            };
        }

        const name = profile.name?.trim() || accountName;
        const academicContext = [profile.gradeName, profile.sectionName]
            .filter(Boolean)
            .join(' • ') || 'Academic placement not provided';

        return { name, academicContext, initials: initialsFor(name) };
    } catch (error) {
        console.error('Unable to load student identity:', error);
        return {
            name: accountName,
            academicContext: 'Student profile unavailable',
            initials: initialsFor(accountName),
        };
    }
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

    if (!session.userId || !session.tenantId) {
        redirect('/unauthorized');
    }

    const identity = await loadStudentIdentity({
        userId: session.userId,
        tenantId: session.tenantId,
        displayName: session.displayName,
        email: session.email,
    });

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Mobile-first Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
                <div className="px-4 py-3 md:px-6 md:py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center">
                                <GraduationCap className="h-5 w-5 text-white md:h-6 md:w-6" aria-hidden="true" />
                            </div>
                            <div>
                                <h1 className="text-lg md:text-xl font-bold text-gray-900 leading-tight">
                                    ScholarMind
                                </h1>
                                <p className="text-xs text-gray-500 font-medium">
                                    Student Workspace
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="hidden md:flex flex-col items-end mr-2">
                                <span className="text-sm font-semibold text-gray-700">{identity.name}</span>
                                <span className="text-xs text-violet-600 font-medium bg-violet-50 px-2 py-0.5 rounded">{identity.academicContext}</span>
                            </div>
                            <div
                                aria-label={`${identity.name} profile`}
                                className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-bold border border-violet-200 shadow-sm"
                            >
                                {identity.initials}
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex flex-col md:flex-row min-h-[calc(100vh-65px)]">
                {/* Mobile Bottom Nav / Desktop Sidebar Navigation */}
                <aside className="fixed bottom-0 left-0 right-0 md:relative md:w-64 bg-white border-t md:border-t-0 md:border-r border-gray-200 z-40">
                    <nav className="flex md:flex-col justify-around md:justify-start p-2 md:p-4 space-x-1 md:space-x-0 md:space-y-1 overflow-x-auto md:overflow-visible">
                        <NavLink href="/student" icon={Home}>
                            Home
                        </NavLink>
                    </nav>
                </aside>

                {/* Main Content */}
                <main className="flex-1 p-4 md:p-6 lg:p-8 pb-20 md:pb-8">{children}</main>
            </div>
        </div>
    );
}

function NavLink({
    href,
    icon: Icon,
    children,
}: {
    href: string;
    icon: typeof Home;
    children: React.ReactNode;
}) {
    return (
        <Link
            href={href}
            className="flex min-w-[72px] flex-col items-center gap-1 rounded-lg px-3 py-2 text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 md:min-w-0 md:flex-row md:gap-3 md:py-3"
        >
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span className="text-[10px] font-medium md:text-sm">{children}</span>
        </Link>
    );
}
