import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
    LayoutDashboard,
    BookOpen,
    ClipboardCheck,
    CalendarDays,
    type LucideIcon,
} from 'lucide-react';
import { ScholarMindCrest } from '@/components/brand/ScholarMindCrest';

export default async function TeacherLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSession();

    if (!session.isLoggedIn) {
        redirect('/login');
    }

    if (session.role !== 'TEACHER' && session.role !== 'SUPER_ADMIN') {
        redirect('/unauthorized');
    }

    return (
        <div className="min-h-screen bg-muted">
            {/* Desktop Sidebar */}
            <aside
                data-testid="sidebar"
                className="fixed left-0 top-0 h-full w-64 bg-card border-r border-border z-40 hidden lg:block"
            >
                <div className="h-[2px] w-full bg-gradient-to-r from-primary via-brass to-primary" />
                <div className="p-4 border-b border-border">
                    <div className="flex items-center gap-3">
                        <ScholarMindCrest size="md" />
                        <div>
                            <h1 className="font-bold text-foreground">Faculty Portal</h1>
                            <p className="text-xs text-muted-foreground font-medium">ScholarMind</p>
                        </div>
                    </div>
                </div>

                <nav className="p-3.5 space-y-1">
                    <NavLink href="/teacher" icon={LayoutDashboard} label="Dashboard" />
                    <NavLink href="/teacher/my-classes" icon={BookOpen} label="My Classes" />
                    <NavLink href="/teacher/gradebook" icon={ClipboardCheck} label="Gradebook" />

                    <div className="pt-3 mt-3 border-t border-border">
                        <NavLink href="/teacher/schedule" icon={CalendarDays} label="My Schedule" />
                    </div>
                </nav>

                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border bg-muted/60 space-y-3">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-accent border border-brass/30 rounded-full flex items-center justify-center">
                            <span className="text-accent-foreground font-semibold text-sm">
                                {session.email?.charAt(0).toUpperCase() || 'T'}
                            </span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{session.email}</p>
                            <p className="text-xs text-muted-foreground">Faculty Member</p>
                        </div>
                    </div>
                    <form action="/api/logout" method="POST">
                        <button
                            type="submit"
                            className="w-full px-3 py-2 text-xs font-medium text-foreground hover:bg-card rounded-lg border border-border transition-colors"
                        >
                            Sign Out
                        </button>
                    </form>
                </div>
            </aside>

            {/* Mobile Header */}
            <header className="lg:hidden bg-card/95 backdrop-blur-sm border-b border-border sticky top-0 z-50">
                <div className="h-[2px] w-full bg-gradient-to-r from-primary via-brass to-primary" />
                <div className="px-4 py-3">
                    <div className="flex justify-between items-center gap-2">
                        <div className="flex items-center gap-2.5">
                            <ScholarMindCrest size="sm" />
                            <h1 className="text-base font-bold text-foreground">Faculty Portal</h1>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                                {session.email}
                            </span>
                            <form action="/api/logout" method="POST">
                                <button
                                    type="submit"
                                    className="px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted rounded-md border border-border transition-colors"
                                >
                                    Sign Out
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="lg:ml-64 min-h-screen">
                <div className="p-4 lg:p-8 pb-20 lg:pb-8">{children}</div>
            </main>

            {/* Mobile Bottom Navigation */}
            <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border px-2 py-2 safe-area-pb">
                <div className="flex justify-around items-center max-w-lg mx-auto">
                    <MobileNavItem href="/teacher" icon={LayoutDashboard} label="Home" />
                    <MobileNavItem href="/teacher/my-classes" icon={BookOpen} label="Classes" />
                    <MobileNavItem href="/teacher/gradebook" icon={ClipboardCheck} label="Grades" />
                </div>
            </nav>
        </div>
    );
}

function NavLink({
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
            className="group flex items-center gap-3 px-3 py-2.5 rounded-lg text-foreground/90 hover:bg-accent hover:text-accent-foreground transition-colors"
        >
            <Icon className="w-4 h-4 text-muted-foreground group-hover:text-brass shrink-0" />
            <span className="font-medium text-sm">{label}</span>
        </Link>
    );
}

function MobileNavItem({
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
            className="flex flex-col items-center gap-1 text-muted-foreground hover:text-primary transition-colors px-3 py-1"
        >
            <Icon className="w-5 h-5" />
            <span className="text-xs font-medium">{label}</span>
        </Link>
    );
}
