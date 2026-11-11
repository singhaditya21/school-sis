import Link from 'next/link';
import {
    LayoutDashboard,
    Users,
    Database,
    Store,
    Upload,
    BarChart3,
} from 'lucide-react';
import { runWithTenantContext, sql } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { isTenantStaffRole } from '@/lib/auth/page-access';
import { ScholarMindCrest } from '@/components/brand/ScholarMindCrest';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSession();
    let schoolName = 'ScholarMind Campus';

    if (!session.isLoggedIn) {
        redirect('/login');
    }

    if (!isTenantStaffRole(session.role)) {
        redirect('/unauthorized');
    }

    if (session.tenantId) {
        try {
            const rows = await runWithTenantContext(session.tenantId, async () =>
                sql<{ name: string }>`SELECT name FROM tenants WHERE id = ${session.tenantId} LIMIT 1`,
            );
            if (rows[0]?.name) {
                schoolName = rows[0].name;
            }
        } catch (e) {
            console.error('Failed to resolve tenant name dynamically:', e);
        }
    }

    return (
        <div className="min-h-screen bg-muted">
            <header className="bg-card border-b border-border sticky top-0 z-50">
                <div className="h-[2px] w-full bg-gradient-to-r from-primary via-brass to-primary" />
                <div className="px-6 py-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-3.5">
                        <ScholarMindCrest size="md" />
                        <div>
                            <div className="text-lg font-bold tracking-tight text-foreground">
                                ScholarMind
                            </div>
                            <p className="text-xs text-muted-foreground font-medium">
                                {schoolName}
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
            </header>

            <div className="flex">
                <aside
                    data-testid="sidebar"
                    className="w-64 bg-card border-r border-border min-h-[calc(100vh-65px)] sticky top-16"
                >
                    <nav className="p-3.5 space-y-1">
                        <p className="px-3 pt-1 pb-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                            Registry &amp; Studio
                        </p>
                        <Link
                            href="/dashboard"
                            className="group flex items-center gap-3 px-3 py-2 rounded-lg text-foreground/90 hover:bg-accent hover:text-accent-foreground transition-colors"
                        >
                            <LayoutDashboard className="w-4 h-4 text-muted-foreground group-hover:text-brass shrink-0" />
                            <span className="text-sm font-medium">Campus Dashboard</span>
                        </Link>
                        <Link
                            href="/executive"
                            className="group flex items-center gap-3 px-3 py-2 rounded-lg text-foreground/90 hover:bg-accent hover:text-accent-foreground transition-colors"
                        >
                            <BarChart3 className="w-4 h-4 text-muted-foreground group-hover:text-brass shrink-0" />
                            <span className="text-sm font-medium">Executive Overview</span>
                        </Link>
                        <Link
                            href="/students"
                            className="group flex items-center gap-3 px-3 py-2 rounded-lg text-foreground/90 hover:bg-accent hover:text-accent-foreground transition-colors"
                        >
                            <Users className="w-4 h-4 text-muted-foreground group-hover:text-brass shrink-0" />
                            <span className="text-sm font-medium">Student Directory</span>
                        </Link>
                        <Link
                            href="/settings/import"
                            className="group flex items-center gap-3 px-3 py-2 rounded-lg text-foreground/90 hover:bg-accent hover:text-accent-foreground transition-colors"
                        >
                            <Upload className="w-4 h-4 text-muted-foreground group-hover:text-brass shrink-0" />
                            <span className="text-sm font-medium">48h ERP Data Import</span>
                        </Link>
                        <Link
                            href="/data"
                            className="group flex items-center gap-3 px-3 py-2 rounded-lg text-foreground/90 hover:bg-accent hover:text-accent-foreground transition-colors"
                        >
                            <Database className="w-4 h-4 text-muted-foreground group-hover:text-brass shrink-0" />
                            <span className="text-sm font-medium">Metadata Engine</span>
                        </Link>
                        <div className="pt-3 mt-3 border-t border-border">
                            <Link
                                href="/appexchange"
                                className="group flex items-center gap-3 px-3 py-2 rounded-lg text-foreground/90 hover:bg-accent hover:text-accent-foreground transition-colors"
                            >
                                <Store className="w-4 h-4 text-brass shrink-0" />
                                <span className="text-sm font-medium">AppExchange</span>
                            </Link>
                        </div>
                    </nav>
                </aside>

                <main className="flex-1 p-6 lg:p-8">{children}</main>
            </div>
        </div>
    );
}
