import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
    Globe,
    Building2,
    Inbox,
    Cpu,
    Landmark,
    Scale,
    Megaphone,
    Sliders,
    ShieldCheck,
    ArrowLeft,
    type LucideIcon,
} from 'lucide-react';
import { ScholarMindCrest } from '@/components/brand/ScholarMindCrest';

export default async function HQLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSession();

    if (!session.isLoggedIn) {
        redirect('/login');
    }

    if (session.role !== 'PLATFORM_ADMIN') {
        redirect('/unauthorized');
    }

    return (
        <div className="dark min-h-screen bg-background text-foreground">
            <header className="bg-card border-b border-border sticky top-0 z-50">
                <div className="h-[2px] w-full bg-brass" />
                <div className="px-6 py-3.5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3.5">
                            <ScholarMindCrest size="md" variant="midnight" />
                            <div>
                                <h1 className="text-lg font-bold text-foreground tracking-tight">
                                    ScholarMind HQ
                                </h1>
                                <p className="text-xs text-muted-foreground font-medium">
                                    Platform Command Center
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3.5">
                            <span className="hidden sm:inline text-sm text-muted-foreground">
                                {session.email}
                            </span>
                            <span className="px-2.5 py-1 bg-accent text-accent-foreground border border-brass/40 text-xs font-semibold tracking-wider rounded-md">
                                PLATFORM ADMIN
                            </span>
                            <form action="/api/logout" method="POST">
                                <button
                                    type="submit"
                                    className="px-3.5 py-1.5 text-sm font-medium text-foreground/90 hover:text-foreground hover:bg-muted border border-border rounded-lg transition-colors"
                                >
                                    Sign Out
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex">
                <aside className="w-64 bg-card border-r border-border min-h-[calc(100vh-67px)] sticky top-[67px]">
                    <nav className="p-4 space-y-2">
                        <div className="pb-3 mb-2 border-b border-border">
                            <p className="px-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                                Orchestration
                            </p>
                            <NavLink href="/hq" icon={Globe}>
                                Global Dashboard
                            </NavLink>
                            <NavLink href="/hq/tenants" icon={Building2}>
                                Campus Management
                            </NavLink>
                            <NavLink href="/hq/leads" icon={Inbox}>
                                Lead Pipeline
                            </NavLink>
                            <NavLink href="/hq/ai-governance" icon={Cpu}>
                                AI Governance
                            </NavLink>
                        </div>

                        <div className="pb-3 mb-2 border-b border-border">
                            <p className="px-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                                Operations
                            </p>
                            <NavLink href="/hq/treasury" icon={Landmark}>
                                Cross-Campus Finance
                            </NavLink>
                            <NavLink href="/hq/compliance" icon={Scale}>
                                Data Residency
                            </NavLink>
                            <NavLink href="/hq/broadcasts" icon={Megaphone}>
                                Broadcasts
                            </NavLink>
                        </div>

                        <div>
                            <p className="px-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                                System
                            </p>
                            <NavLink href="/hq/policies" icon={Sliders}>
                                Global Policy Engine
                            </NavLink>
                            <NavLink href="/hq/audit" icon={ShieldCheck}>
                                Platform Audit Log
                            </NavLink>
                        </div>

                        <div className="mt-6 pt-4 border-t border-border">
                            <Link
                                href="/dashboard"
                                className="flex items-center justify-center gap-2 p-2.5 rounded-lg border border-border bg-muted text-foreground hover:bg-accent hover:text-accent-foreground transition-all text-xs font-semibold"
                            >
                                <ArrowLeft className="w-3.5 h-3.5" />
                                Switch to Campus Admin
                            </Link>
                        </div>
                    </nav>
                </aside>

                <main className="flex-1 p-6 lg:p-8 bg-background">{children}</main>
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
            className="group flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
            <Icon className="w-4 h-4 text-muted-foreground group-hover:text-brass shrink-0" />
            <span className="text-sm font-medium">{children}</span>
        </Link>
    );
}
