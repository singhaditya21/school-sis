import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { evaluateCapability } from '@/lib/capabilities/evaluator';
import { hasPermission, UserRole } from '@/lib/rbac/permissions';
import Link from 'next/link';
import { CalendarCheck, GraduationCap, Home, IndianRupee, LineChart, type LucideIcon } from 'lucide-react';

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

    const paymentsAvailable = evaluateCapability('payments', {
        activeModules: session.activeModules || [],
        institutionType: session.institutionType,
        hasPermission: (permission) => hasPermission(session.role as UserRole, permission),
    }).available;

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
            {/* Top Bar */}
            <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-50">
                <div className="px-4 py-3">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                                <GraduationCap className="h-5 w-5 text-white" aria-hidden="true" />
                            </div>
                            <div className="text-lg font-bold text-gray-900">ScholarMind</div>
                        </div>
                        <div className="text-sm text-gray-700">{session.email}</div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="p-4 pb-20">{children}</main>

            {/* Bottom Navigation (Mobile-First) */}
            <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 safe-area-pb">
                <div className="flex justify-around items-center max-w-lg mx-auto">
                    <NavItem href="/overview" icon={Home} label="Home" />
                    <NavItem href="/my-attendance" icon={CalendarCheck} label="Attendance" />
                    <NavItem href="/my-results" icon={LineChart} label="Results" />
                    {paymentsAvailable ? <NavItem href="/my-fees" icon={IndianRupee} label="Fees" /> : null}
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
        <Link href={href} className="flex flex-col items-center gap-1 text-gray-600 hover:text-blue-600 transition-colors">
            <Icon className="h-6 w-6" aria-hidden="true" />
            <span className="text-xs font-medium">{label}</span>
        </Link>
    );
}
