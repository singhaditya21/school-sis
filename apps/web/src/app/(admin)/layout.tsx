import { getSession } from '@/lib/auth/session';
import { isStaff } from '@/lib/rbac/permissions';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { returnToHQAction } from '@/lib/actions/platform';
import PlatformBroadcastTicker from '@/components/platform/PlatformBroadcastTicker';
import { pool } from '@/lib/db';

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSession();

    if (!session.isLoggedIn) {
        redirect('/login');
    }

    // Check if user has staff/admin access
    if (!isStaff(session.role as any)) {
        redirect('/unauthorized');
    }

    const isImpersonating = session.token?.startsWith('impersonating:');

    // Safe DB fetch to prevent UUID parsing errors for Platform Admins without immediate tenants
    let institutionType = 'K12';
    if (session.tenantId && session.tenantId.trim() !== '') {
        const tenantRes = await pool.query(`SELECT institution_type AS type FROM tenants WHERE id = $1 LIMIT 1`, [session.tenantId]);
        const tenantRows = tenantRes.rows;
        if (tenantRows.length > 0) {
            institutionType = tenantRows[0].type;
        }
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {isImpersonating && (
                <div className="bg-rose-600 text-white px-4 py-2 flex items-center justify-between sticky top-0 z-[60]">
                    <div className="flex items-center gap-2">
                        <span className="animate-pulse">🔴</span>
                        <span className="text-sm font-bold tracking-wider">IMPERSONATION ACTIVE</span>
                        <span className="text-xs opacity-80 border-l border-white/20 pl-2 ml-2">You are viewing {session.email}&apos;s dashboard</span>
                    </div>
                    <form action={async () => {
                        'use server';
                        await returnToHQAction();
                    }}>
                        <button type="submit" className="text-xs bg-white text-rose-600 font-bold px-3 py-1 rounded-md hover:bg-rose-50 transition shadow-sm">
                            Return to HQ
                        </button>
                    </form>
                </div>
            )}
            
            <PlatformBroadcastTicker />

            {/* Header */}
            <header className={`bg-white border-b border-gray-200 sticky ${isImpersonating ? 'top-10' : 'top-0'} z-50`}>
                <div className="px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                                <span className="text-white text-xl">🎓</span>
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-gray-900">
                                    School SIS
                                </h1>
                                <p className="text-sm text-gray-500">
                                    Administration Portal
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-sm text-gray-600">
                                {session.email}
                            </span>
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                                {session.role}
                            </span>
                            <form action="/api/logout" method="POST">
                                <button
                                    type="submit"
                                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    Logout
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex">
                {/* Sidebar Navigation */}
                <aside data-testid="sidebar" className="w-64 bg-white border-r border-gray-200 min-h-screen sticky top-16">
                    <nav className="p-4 space-y-1">
                        {/* --- CORE / SHARED MODULES --- */}
                        <NavLink href="/dashboard" icon="📊">
                            Dashboard
                        </NavLink>
                        <NavLink href="/chat" icon="🤖">
                            AI Agent Chat
                        </NavLink>
                        <NavLink href="/approvals" icon="✅">
                            Action Approvals
                        </NavLink>
                        <NavLink href="/fees" icon="💰">
                            Fee Collections
                        </NavLink>
                        <NavLink href="/app/invoice" icon="🧾">
                            Invoices
                        </NavLink>
                        <NavLink href="/treasury" icon="🏦">
                            Treasury
                        </NavLink>
                        <NavLink href="/app/student" icon="👥">
                            Students
                        </NavLink>
                        <NavLink href="/attendance" icon="✅">
                            Attendance
                        </NavLink>
                        <NavLink href="/exams" icon="📝">
                            Exams
                        </NavLink>
                        <NavLink href="/admissions" icon="🎓">
                            Admissions
                        </NavLink>
                        <NavLink href="/messages/templates" icon="✉️">
                            Messages
                        </NavLink>
                        <NavLink href="/app/staff" icon="👥">
                            Faculty & Staff
                        </NavLink>
                        <NavLink href="/analytics" icon="📊">
                            Analytics
                        </NavLink>
                        <NavLink href="/reports" icon="📑">
                            Reports Engine
                        </NavLink>
                        <NavLink href="/credentials" icon="📜">
                            Trust Registry
                        </NavLink>
                        <NavLink href="/integrations/tally" icon="📈">
                            Tally ERP Sync
                        </NavLink>

                        {/* --- K-12 SPECIFIC MODULES --- */}
                        {(institutionType === 'K12' || institutionType === 'HYBRID') && (
                            <div className="pt-2 mt-2 border-t border-gray-100">
                                <p className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">K-12 School</p>
                                <NavLink href="/timetable" icon="📅">Timetable</NavLink>
                                <NavLink href="/transport" icon="🚌">Transport</NavLink>
                                <NavLink href="/homework" icon="📝">Homework</NavLink>
                                <NavLink href="/lesson-plans" icon="📚">Lesson Plans</NavLink>
                                <NavLink href="/diary" icon="📓">Digital Diary</NavLink>
                                <NavLink href="/health" icon="🏥">Health Records</NavLink>
                            </div>
                        )}

                        {/* --- HIGHER EDUCATION MODULES --- */}
                        {(institutionType === 'COLLEGE' || institutionType === 'UNIVERSITY' || institutionType === 'HYBRID') && (
                            <div className="pt-2 mt-2 border-t border-gray-100">
                                <p className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Higher Ed</p>
                                <NavLink href="/university/courses" icon="🎓">Course Registration</NavLink>
                                <NavLink href="/university/advising" icon="👨‍🏫">Academic Advising</NavLink>
                                <NavLink href="/university/research" icon="🔬">Research Grants</NavLink>
                                <NavLink href="/university/placement" icon="💼">Placements</NavLink>
                            </div>
                        )}

                        {/* --- COACHING MODULES --- */}
                        {(institutionType === 'COACHING' || institutionType === 'HYBRID') && (
                            <div className="pt-2 mt-2 border-t border-gray-100">
                                <p className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Coaching</p>
                                <NavLink href="/coaching/batches" icon="📚">Batches</NavLink>
                                <NavLink href="/coaching/tests" icon="📋">Test Series</NavLink>
                                <NavLink href="/coaching/doubts" icon="❓">Doubt Portal</NavLink>
                            </div>
                        )}

                        {/* --- HQ COMMAND CENTER --- */}
                        {session.role === 'PLATFORM_ADMIN' || session.role === 'SUPER_ADMIN' || session.role === 'GROUP_EXECUTIVE' ? (
                            <div className="pt-2 mt-2 border-t border-gray-100">
                                <p className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Group HQ</p>
                                <NavLink href="/hq-overview" icon="🏢">Command Center</NavLink>
                                <NavLink href="/procurement" icon="🔐">Trust Center</NavLink>
                                <NavLink href="/international" icon="🌍">International Ops</NavLink>
                                <NavLink href="/schools" icon="🏫">Campuses</NavLink>
                                <NavLink href="/settings/users" icon="👤">Users & Roles</NavLink>
                            </div>
                        ) : null}
                    </nav>
                </aside>

                {/* Main Content */}
                <main className="flex-1 p-6 lg:p-8" suppressHydrationWarning>
                    <div suppressHydrationWarning>{children}</div>
                </main>
            </div>
        </div>
    );
}

function NavLink({
    href,
    icon,
    children,
}: {
    href: string;
    icon: string;
    children: React.ReactNode;
}) {
    return (
        <Link
            href={href}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
        >
            <span>{icon}</span>
            <span className="text-sm font-medium">{children}</span>
        </Link>
    );
}
