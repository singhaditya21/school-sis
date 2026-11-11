import { getSession } from '@/lib/auth/session';
import { isStaff, UserRole } from '@/lib/rbac/permissions';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
    LayoutDashboard,
    ShieldCheck,
    IndianRupee,
    FileSpreadsheet,
    Users,
    CalendarCheck,
    GraduationCap,
    UserPlus,
    Mail,
    Briefcase,
    BarChart3,
    RefreshCw,
    Clock,
    Bus,
    BookOpen,
    NotebookText,
    Upload,
    CreditCard,
    Sliders,
    Workflow,
    Plug,
    Blocks,
    Building2,
    UserCog,
    type LucideIcon,
} from 'lucide-react';
import { returnToHQAction } from '@/lib/actions/platform';
import PlatformBroadcastTicker from '@/components/platform/PlatformBroadcastTicker';
import { ScholarMindCrest } from '@/components/brand/ScholarMindCrest';
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

    if (!isStaff(session.role as UserRole)) {
        redirect('/unauthorized');
    }

    const isImpersonating =
        Boolean(session.impersonation?.actorUserId) || session.token?.startsWith('impersonating:');

    let institutionType = 'K12';
    if (session.tenantId && session.tenantId.trim() !== '') {
        const tenantRes = await pool.query(
            `SELECT institution_type AS type FROM tenants WHERE id = $1 LIMIT 1`,
            [session.tenantId],
        );
        const tenantRows = tenantRes.rows;
        if (tenantRows.length > 0) {
            institutionType = tenantRows[0].type;
        }
    }

    return (
        <div className="min-h-screen bg-muted">
            {isImpersonating && (
                <div className="bg-destructive text-destructive-foreground px-4 py-2 flex items-center justify-between sticky top-0 z-[60]">
                    <div className="flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-destructive-foreground animate-pulse" />
                        <span className="text-sm font-bold tracking-wider">IMPERSONATION ACTIVE</span>
                        <span className="text-xs opacity-80 border-l border-destructive-foreground/30 pl-2 ml-2">
                            Viewing {session.email}&apos;s workspace
                        </span>
                    </div>
                    <form
                        action={async () => {
                            'use server';
                            await returnToHQAction();
                        }}
                    >
                        <button
                            type="submit"
                            className="text-xs bg-card text-destructive font-bold px-3 py-1 rounded-md hover:bg-destructive-subtle transition shadow-sm"
                        >
                            Return to HQ
                        </button>
                    </form>
                </div>
            )}

            <PlatformBroadcastTicker />

            {/* Top Institutional Header */}
            <header
                className={`bg-card border-b border-border sticky ${
                    isImpersonating ? 'top-10' : 'top-0'
                } z-50`}
            >
                <div className="h-[2px] w-full bg-gradient-to-r from-primary via-brass to-primary" />
                <div className="px-6 py-3.5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3.5">
                            <ScholarMindCrest size="md" />
                            <div>
                                <div className="text-lg font-bold tracking-tight text-foreground">
                                    ScholarMind
                                </div>
                                <p className="text-xs text-muted-foreground font-medium">
                                    Institutional Administration
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="hidden sm:inline text-sm text-muted-foreground">
                                {session.email}
                            </span>
                            <span className="px-2.5 py-1 bg-accent text-accent-foreground border border-brass/25 text-xs font-semibold tracking-wide rounded-md">
                                {session.role}
                            </span>
                            <form action="/api/logout" method="POST">
                                <button
                                    type="submit"
                                    className="px-3.5 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted border border-border rounded-lg transition-colors"
                                >
                                    Sign Out
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex">
                {/* Sidebar Navigation */}
                <aside
                    data-testid="sidebar"
                    className="w-64 bg-card border-r border-border min-h-screen sticky top-16"
                >
                    <nav className="p-3.5 space-y-0.5">
                        <p className="px-3 pt-1 pb-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                            Core Operations
                        </p>
                        <NavLink href="/dashboard" icon={LayoutDashboard}>
                            Dashboard
                        </NavLink>
                        <NavLink href="/approvals" icon={ShieldCheck}>
                            Action Approvals
                        </NavLink>
                        <NavLink href="/fees" icon={IndianRupee}>
                            Fee Collections
                        </NavLink>
                        <NavLink href="/invoices" icon={FileSpreadsheet}>
                            Invoices
                        </NavLink>
                        <NavLink href="/students" icon={Users}>
                            Students
                        </NavLink>
                        <NavLink href="/attendance" icon={CalendarCheck}>
                            Attendance
                        </NavLink>
                        <NavLink href="/exams" icon={GraduationCap}>
                            Exams
                        </NavLink>
                        <NavLink href="/admissions" icon={UserPlus}>
                            Admissions
                        </NavLink>
                        <NavLink href="/messages" icon={Mail}>
                            Messages
                        </NavLink>
                        <NavLink href="/hr" icon={Briefcase}>
                            Faculty &amp; Staff
                        </NavLink>
                        <NavLink href="/analytics" icon={BarChart3}>
                            Analytics
                        </NavLink>
                        <NavLink href="/integrations/tally" icon={RefreshCw}>
                            Tally ERP Sync
                        </NavLink>

                        {(institutionType === 'K12' || institutionType === 'HYBRID') && (
                            <div className="pt-3 mt-3 border-t border-border">
                                <p className="px-3 pb-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                    Academic Campus
                                </p>
                                <NavLink href="/timetable" icon={Clock}>Timetable</NavLink>
                                <NavLink href="/transport" icon={Bus}>Transport</NavLink>
                                <NavLink href="/lesson-plans" icon={BookOpen}>Lesson Plans</NavLink>
                                <NavLink href="/diary" icon={NotebookText}>Digital Diary</NavLink>
                            </div>
                        )}

                        <div className="pt-3 mt-3 border-t border-border">
                            <p className="px-3 pb-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                Governance &amp; Setup
                            </p>
                            <NavLink href="/settings/import" icon={Upload}>ERP Data Import</NavLink>
                            <NavLink href="/settings/payments" icon={CreditCard}>Payment Gateways</NavLink>
                            <NavLink href="/settings/objects" icon={Sliders}>Object Manager</NavLink>
                            <NavLink href="/automation" icon={Workflow}>Automations</NavLink>
                            <NavLink href="/settings/integrations" icon={Plug}>Integrations &amp; Outbox</NavLink>
                            <NavLink href="/marketplace" icon={Blocks}>Marketplace</NavLink>
                        </div>

                        {session.role === 'PLATFORM_ADMIN' ||
                        session.role === 'SUPER_ADMIN' ||
                        session.role === 'GROUP_EXECUTIVE' ? (
                            <div className="pt-3 mt-3 border-t border-border">
                                <p className="px-3 pb-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                    Group Governance
                                </p>
                                <NavLink href="/hq-overview" icon={Building2}>Command Center</NavLink>
                                <NavLink href="/settings/users" icon={UserCog}>Users &amp; Roles</NavLink>
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
    icon: Icon,
    children,
}: {
    href: string;
    icon: LucideIcon;
    children: React.ReactNode;
}) {
    return (
        <Link
            href={href}
            className="group flex items-center gap-3 px-3 py-2 rounded-lg text-foreground/90 hover:bg-accent hover:text-accent-foreground transition-colors"
        >
            <Icon className="w-4 h-4 text-muted-foreground group-hover:text-brass shrink-0 transition-colors" />
            <span className="text-sm font-medium">{children}</span>
        </Link>
    );
}
