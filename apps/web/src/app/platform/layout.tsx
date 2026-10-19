import Link from 'next/link';
import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { logoutAction } from '@/lib/actions/auth';
import { getSession } from '@/lib/auth/session';
import { isPlatformRole } from '@/lib/auth/page-access';

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
            {/* Sidebar */}
            <aside className="w-72 bg-card text-foreground min-h-screen border-r border-border shadow-xl flex flex-col">
                <div className="p-8 border-b border-border">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary text-primary-foreground rounded-xl flex items-center justify-center text-xl shadow-lg">
                            🌍
                        </div>
                        <div>
                            <h1 className="font-bold text-lg tracking-tight">ScholarMind HQ</h1>
                            <p className="text-xs text-muted-foreground font-medium">Platform Administration</p>
                        </div>
                    </div>
                </div>

                <nav className="p-6 flex-1 space-y-2">
                    <Link href="/platform" className="flex items-center gap-4 px-4 py-3 rounded-xl bg-accent text-accent-foreground font-medium border border-primary/20">
                        <span className="text-xl">📊</span> Global Dashboard
                    </Link>
                    <Link href="/platform/tenants" className="flex items-center gap-4 px-4 py-3 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                        <span className="text-xl">🏫</span> Tenant Schools
                    </Link>
                    <Link href="/platform/billing" className="flex items-center gap-4 px-4 py-3 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                        <span className="text-xl">💳</span> Stripe Billing
                    </Link>
                    <Link href="/platform/analytics" className="flex items-center gap-4 px-4 py-3 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                        <span className="text-xl">🤖</span> AI Analytics
                    </Link>
                </nav>
            </aside>

            {/* Main Layout Area */}
            <main className="flex-1 overflow-x-hidden">
                <header className="bg-card border-b border-border h-20 px-10 flex items-center justify-between sticky top-0 z-10">
                    <div className="flex items-center gap-4">
                        <input 
                            type="text" 
                            placeholder="Find a school tenant (e.g., DPSN)..."
                            className="w-96 px-5 py-2.5 bg-muted border-none rounded-full text-sm outline-none focus:ring-2 focus:ring-ring transition"
                        />
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col items-end">
                            <span className="text-sm font-semibold text-foreground">{session.email}</span>
                            <span className="text-xs text-muted-foreground">Platform Super Admin</span>
                        </div>
                        <form action={logoutAction}>
                            <button
                                type="submit"
                                className="p-2.5 text-muted-foreground hover:text-destructive hover:bg-destructive-subtle rounded-xl transition"
                            >
                                Log Out
                            </button>
                        </form>
                    </div>
                </header>
                <div className="p-10">
                    {children}
                </div>
            </main>
        </div>
    );
}
