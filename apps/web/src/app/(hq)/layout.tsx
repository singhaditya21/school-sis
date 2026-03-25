import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function HQLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSession();

    if (!session.isLoggedIn) {
        redirect('/login');
    }

    // Check if user has PLATFORM_ADMIN access
    if (session.role !== 'PLATFORM_ADMIN') {
        redirect('/unauthorized');
    }

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100">
            {/* Header */}
            <header className="bg-slate-950 border-b border-slate-800 sticky top-0 z-50">
                <div className="px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-cyan-400 rounded-xl flex items-center justify-center">
                                <span className="text-white text-xl">🌐</span>
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-white tracking-tight">
                                    ScholarMind HQ
                                </h1>
                                <p className="text-sm text-slate-400">
                                    Global Command Center
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-sm text-slate-400">
                                {session.email}
                            </span>
                            <span className="px-2 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-medium rounded-full">
                                PLATFORM ADMIN
                            </span>
                            <form action="/api/logout" method="POST">
                                <button
                                    type="submit"
                                    className="px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                                >
                                    Log Out
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex">
                {/* Sidebar Navigation */}
                <aside className="w-64 bg-slate-950 border-r border-slate-800 min-h-[calc(100vh-73px)] sticky top-[73px]">
                    <nav className="p-4 space-y-2">
                        <div className="pb-4 mb-2 border-b border-slate-800">
                            <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Orchestration</p>
                            <NavLink href="/hq" icon="🌍">
                                Global Dashboard
                            </NavLink>
                            <NavLink href="/hq/tenants" icon="🏢">
                                Campus Management
                            </NavLink>
                            <NavLink href="/hq/ai-governance" icon="🧠">
                                AI Governance
                            </NavLink>
                        </div>

                        <div className="pb-4 mb-2 border-b border-slate-800">
                            <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Operations</p>
                            <NavLink href="/hq/treasury" icon="🏦">
                                Treasury Routing
                            </NavLink>
                            <NavLink href="/hq/compliance" icon="⚖️">
                                Global Compliance
                            </NavLink>
                        </div>

                        <div>
                            <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">System</p>
                            <NavLink href="/hq/settings" icon="⚙️">
                                Global Policy Engine
                            </NavLink>
                            <NavLink href="/hq/audit" icon="🛡️">
                                Security Audit Logs
                            </NavLink>
                        </div>
                        
                        <div className="mt-8 pt-4">
                             <Link href="/dashboard" className="flex items-center justify-center p-3 rounded-lg border border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white transition-all text-sm font-medium">
                                ← Switch to Campus Admin
                             </Link>
                        </div>
                    </nav>
                </aside>

                {/* Main Content */}
                <main className="flex-1 p-6 lg:p-8 bg-slate-900">{children}</main>
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
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
        >
            <span className="text-lg">{icon}</span>
            <span className="text-sm font-medium">{children}</span>
        </Link>
    );
}
