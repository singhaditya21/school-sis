import Link from 'next/link';
import {
    Home,
    CalendarCheck,
    Award,
    IndianRupee,
    Bus,
    type LucideIcon,
} from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { ScholarMindCrest } from '@/components/brand/ScholarMindCrest';
import { redirect } from 'next/navigation';

export default async function ParentLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSession();

    if (!session.isLoggedIn) {
        redirect('/login');
    }

    if (session.role !== 'PARENT') {
        redirect('/unauthorized');
    }

    return (
        <div className="min-h-screen bg-muted">
            <header className="bg-card/95 backdrop-blur-sm border-b border-border sticky top-0 z-50">
                <div className="h-[2px] w-full bg-gradient-to-r from-primary via-brass to-primary" />
                <div className="px-4 py-3 max-w-6xl mx-auto">
                    <div className="flex justify-between items-center gap-3">
                        <div className="flex items-center gap-2.5">
                            <ScholarMindCrest size="sm" />
                            <div>
                                <div className="text-base font-bold text-foreground leading-tight">
                                    ScholarMind
                                </div>
                                <p className="text-[11px] text-muted-foreground font-medium">
                                    Parent &amp; Guardian Portal
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="hidden sm:inline text-xs text-muted-foreground">
                                {session.email}
                            </span>
                            <form action="/api/logout" method="POST">
                                <button
                                    type="submit"
                                    className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg border border-border transition-colors"
                                >
                                    Sign Out
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </header>

            <main className="p-4 sm:p-6 pb-24 max-w-6xl mx-auto">{children}</main>

            <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border px-4 py-2.5 safe-area-pb z-40">
                <div className="flex justify-around items-center max-w-lg mx-auto">
                    <NavItem href="/overview" icon={Home} label="Home" />
                    <NavItem href="/my-attendance" icon={CalendarCheck} label="Attendance" />
                    <NavItem href="/my-results" icon={Award} label="Results" />
                    <NavItem href="/my-fees" icon={IndianRupee} label="Fees" />
                    <NavItem href="/my-transport" icon={Bus} label="Transport" />
                </div>
            </nav>
        </div>
    );
}

function NavItem({
    href,
    icon: Icon,
    label,
}: {
    href: string;
    icon: LucideIcon;
    label: string;
}) {
    return (
        <Link
            href={href}
            className="flex flex-col items-center gap-1 text-muted-foreground hover:text-primary transition-colors px-2 py-0.5"
        >
            <Icon className="w-5 h-5" />
            <span className="text-[11px] font-medium">{label}</span>
        </Link>
    );
}
