import { getSession } from '@/lib/auth/session';
import { hasPermission, isStaff, UserRole } from '@/lib/rbac/permissions';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { returnToHQAction } from '@/lib/actions/platform';
import PlatformBroadcastTicker from '@/components/platform/PlatformBroadcastTicker';
import { AICopilot } from '@/components/ui/ai-copilot';
import { evaluateCapability } from '@/lib/capabilities/evaluator';
import { configuredProviderRequirements } from '@/lib/capabilities/providers';
import {
    buildAdminNavigation,
    type AdminNavigationIconId,
} from '@/lib/capabilities/admin-navigation';
import {
    Building2,
    CalendarCheck,
    CalendarDays,
    Circle,
    ClipboardCheck,
    FileCheck,
    GraduationCap,
    Landmark,
    LayoutDashboard,
    ListChecks,
    Mail,
    Plug,
    ReceiptText,
    School,
    ShieldCheck,
    UserRoundCog,
    Users,
    WalletCards,
    type LucideIcon,
} from 'lucide-react';

const ADMIN_NAVIGATION_ICONS: Readonly<Record<AdminNavigationIconId, LucideIcon>> = {
    'layout-dashboard': LayoutDashboard,
    'clipboard-check': ClipboardCheck,
    users: Users,
    'user-round-cog': UserRoundCog,
    'graduation-cap': GraduationCap,
    'calendar-check': CalendarCheck,
    'file-check': FileCheck,
    'calendar-days': CalendarDays,
    'wallet-cards': WalletCards,
    'receipt-text': ReceiptText,
    landmark: Landmark,
    mail: Mail,
    plug: Plug,
    'list-checks': ListChecks,
    'shield-check': ShieldCheck,
    school: School,
    'building-two': Building2,
};

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSession();

    if (!session.isLoggedIn) {
        redirect('/login');
    }

    // Check if user has staff/admin access
    if (!isStaff(session.role as UserRole)) {
        redirect('/unauthorized');
    }

    const isImpersonating = Boolean(session.impersonation?.actorUserId) || session.token?.startsWith('impersonating:');

    const capabilityContext = {
        activeModules: session.activeModules || [],
        institutionType: session.institutionType,
        configuredProviders: configuredProviderRequirements(),
        hasPermission: (permission: string) => hasPermission(session.role as UserRole, permission),
        allowInternal: session.role === 'PLATFORM_ADMIN'
            && process.env.CAPABILITIES_INTERNAL_ACCESS === 'true',
    };
    const navigationGroups = buildAdminNavigation(capabilityContext, session.role);
    const aiAvailable = evaluateCapability('ai', capabilityContext).available;

    return (
        <div className="min-h-screen bg-gray-50">
            {isImpersonating && (
                <div className="bg-rose-600 text-white px-4 py-2 flex items-center justify-between sticky top-0 z-[60]">
                    <div className="flex items-center gap-2">
                        <Circle className="h-3 w-3 animate-pulse fill-current" aria-hidden="true" />
                        <span className="text-sm font-bold tracking-wider">IMPERSONATION ACTIVE</span>
                        <span className="text-xs opacity-80 border-l border-white/20 pl-2 ml-2">You are viewing {session.email}&apos;s dashboard</span>
                    </div>
                    <form action={async () => {
                        'use server';
                        await returnToHQAction();
                    }}>
                        <button type="submit" className="text-xs bg-white text-rose-600 font-bold px-3 py-1 rounded-md hover:bg-rose-50 transition shadow-sm">
                            Return to HQ
                        </button>
                    </form>
                </div>
            )}
            
            <PlatformBroadcastTicker />

            {/* Header */}
            <header className={`bg-white border-b border-gray-200 sticky ${isImpersonating ? 'top-10' : 'top-0'} z-50`}>
                <div className="px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                                <GraduationCap className="h-6 w-6 text-white" aria-hidden="true" />
                            </div>
                            <div>
                                <div className="text-xl font-bold text-gray-900">
                                    ScholarMind
                                </div>
                                <p className="text-sm text-gray-500">
                                    Administration Portal
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-sm text-gray-600">
                                {session.email}
                            </span>
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                                {session.role}
                            </span>
                            <form action="/api/logout" method="POST">
                                <button
                                    type="submit"
                                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    Logout
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex">
                {/* Sidebar Navigation */}
                <aside data-testid="sidebar" className="w-64 bg-white border-r border-gray-200 min-h-screen sticky top-16">
                    <nav className="p-4 space-y-2" aria-label="Administration">
                        {navigationGroups.map((group, index) => (
                            <div
                                key={group.id}
                                className={index === 0 ? 'space-y-1' : 'space-y-1 border-t border-gray-100 pt-3 mt-3'}
                            >
                                {group.label ? (
                                    <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                                        {group.label}
                                    </p>
                                ) : null}
                                {group.items.map((item) => (
                                    <NavLink
                                        key={item.id}
                                        href={item.href}
                                        icon={item.icon}
                                        label={item.label}
                                    />
                                ))}
                            </div>
                        ))}
                    </nav>
                </aside>

                {/* Main Content */}
                <main className="flex-1 p-6 lg:p-8" suppressHydrationWarning>
                    <div suppressHydrationWarning>{children}</div>
                </main>
            </div>
            {aiAvailable ? <AICopilot /> : null}
        </div>
    );
}

function NavLink({
    href,
    icon,
    label,
}: {
    href: string;
    icon: AdminNavigationIconId;
    label: string;
}) {
    const Icon = ADMIN_NAVIGATION_ICONS[icon];

    return (
        <Link
            href={href}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
        >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="text-sm font-medium">{label}</span>
        </Link>
    );
}
