import Link from 'next/link';
import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { LayoutDashboard, Building2, CreditCard, BarChart3 } from 'lucide-react';
import { logoutAction } from '@/lib/actions/auth';
import { getSession } from '@/lib/auth/session';
import { isPlatformRole } from '@/lib/auth/page-access';
import { ScholarMindCrest } from '@/components/brand/ScholarMindCrest';

export default async function PlatformLayout({ children }: { children: ReactNode }) {
    const session = await getSession();

    if (!session.isLoggedIn) {
        redirect('/login');
    }

    if (!isPlatformRole(session.role)) {
        redirect('/unauthorized');
    }

    return (
        <div className="min-h-screen bg-muted flex">
            <aside className="w-72 bg-card text-foreground min-h-screen border-r border-border shadow-sm flex flex-col">
                <div className="h-[2px] w-full bg-gradient-to-r from-primary via-brass to-primary" />
                <div className="p-6 border-b border-border">
                    <div className="flex items-center gap-3">
                        <ScholarMindCrest size="md" />
                        <div>
                            <h1 className="font-bold text-lg tracking-tight">ScholarMind HQ</h1>
                            <p className="text-xs text-muted-foreground font-medium">
                                Platform Administration
                            </p>
                        </div>
                    </div>
                </div>

                <nav className="p-4 flex-1 space-y-1.5">
                    <Link
                        href="/platform"
                        className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-accent text-accent-foreground font-semibold border border-brass/25 text-sm"
                    >
                        <LayoutDashboard className="w-4 h-4 text-brass" />
                        Global Dashboard
                    </Link>
                    <Link
                        href="/platform/tenants"
                        className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors text-sm font-medium"
                    >
                        <Building2 className="w-4 h-4" />
                        Tenant Schools
                    </Link>
                    <Link
                        href="/platform/billing"
                        className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors text-sm font-medium"
                    >
                        <CreditCard className="w-4 h-4" />
                        Commercial Billing
                    </Link>
                    <Link
                        href="/platform/analytics"
                        className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors text-sm font-medium"
                    >
                        <BarChart3 className="w-4 h-4" />
                        Platform Analytics
                    </Link>
                </nav>
            </aside>

            <main className="flex-1 overflow-x-hidden">
                <header className="bg-card border-b border-border h-16 px-8 flex items-center justify-between sticky top-0 z-10">
                    <div className="flex items-center gap-4">
                        <input
                            type="text"
                            placeholder="Search school workspace code (e.g., DPSN)..."
                            className="w-80 px-4 py-2 bg-muted border border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-ring transition"
                        />
                    </div>
                    <div className="flex items-center gap-5">
                        <div className="flex flex-col items-end">
                            <span className="text-sm font-semibold text-foreground">{session.email}</span>
                            <span className="text-xs text-muted-foreground">Platform Super Admin</span>
                        </div>
                        <form action={logoutAction}>
                            <button
                                type="submit"
                                className="px-3.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive-subtle border border-border rounded-lg transition"
                            >
                                Sign Out
                            </button>
                        </form>
                    </div>
                </header>
                <div className="p-8">{children}</div>
            </main>
        </div>
    );
}
