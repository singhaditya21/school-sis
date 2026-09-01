import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';

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
        <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
            {/* Sidebar */}
            <aside data-testid="sidebar" className="fixed left-0 top-0 h-full w-64 bg-card border-r border-border z-40 hidden lg:block">
                <div className="p-4 border-b border-border">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
                            <span className="text-white text-xl">👨‍🏫</span>
                        </div>
                        <div>
                            <h1 className="font-bold text-foreground">Teacher Portal</h1>
                            <p className="text-xs text-muted-foreground">School SIS</p>
                        </div>
                    </div>
                </div>

                <nav className="p-3 space-y-1">
                    <NavLink href="/teacher" icon="🏠" label="Dashboard" />
                    <NavLink href="/teacher/my-classes" icon="📚" label="My Classes" />
                    <NavLink href="/teacher/gradebook" icon="📝" label="Gradebook" />

                    <div className="pt-4 mt-4 border-t border-border">
                        <NavLink href="/teacher/schedule" icon="📅" label="My Schedule" />
                    </div>
                </nav>

                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border bg-muted">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                            <span className="text-emerald-600 font-semibold">
                                {session.email?.charAt(0).toUpperCase() || 'T'}
                            </span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{session.email}</p>
                            <p className="text-xs text-muted-foreground">Teacher</p>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Mobile Header */}
            <header className="lg:hidden bg-card/80 backdrop-blur-sm border-b border-border sticky top-0 z-50">
                <div className="px-4 py-3">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
                                <span className="text-white text-lg">👨‍🏫</span>
                            </div>
                            <h1 className="text-lg font-bold text-foreground">Teacher Portal</h1>
                        </div>
                        <div className="text-sm text-foreground">{session.email}</div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="lg:ml-64 min-h-screen">
                <div className="p-4 lg:p-6 pb-20 lg:pb-6">{children}</div>
            </main>

            {/* Mobile Bottom Navigation */}
            <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border px-2 py-2 safe-area-pb">
                <div className="flex justify-around items-center max-w-lg mx-auto">
                    <MobileNavItem href="/teacher" icon="🏠" label="Home" />
                    <MobileNavItem href="/teacher/my-classes" icon="📚" label="Classes" />
                    <MobileNavItem href="/teacher/gradebook" icon="📝" label="Grades" />
                </div>
            </nav>
        </div>
    );
}

function NavLink({
    href,
    icon,
    label,
}: {
    href: string;
    icon: string;
    label: string;
}) {
    return (
        <Link
            href={href}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-foreground hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
        >
            <span className="text-xl">{icon}</span>
            <span className="font-medium">{label}</span>
        </Link>
    );
}

function MobileNavItem({
    href,
    icon,
    label,
}: {
    href: string;
    icon: string;
    label: string;
}) {
    return (
        <Link href={href} className="flex flex-col items-center gap-0.5 text-muted-foreground hover:text-emerald-600 transition-colors px-2">
            <span className="text-xl">{icon}</span>
            <span className="text-[10px] font-medium">{label}</span>
        </Link>
    );
}
