import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { KpiCards, ModuleGrid, RecentActivity } from '@/components/dashboard';
import { ROLE_LABELS } from '@/lib/constants';
import { isAdminRole, getDashboardType } from '@/lib/rbac';
import { getDashboardStats, getTenantInfo } from '@/lib/actions/dashboard';
import { listCapabilityDecisions } from '@/lib/capabilities/evaluator';
import { configuredProviderRequirements } from '@/lib/capabilities/providers';
import type { CapabilityId } from '@/lib/capabilities/types';
import { hasPermission, UserRole } from '@/lib/rbac/permissions';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function DashboardPage() {
    const session = await getSession();

    if (!session.isLoggedIn) {
        redirect('/login');
    }

    const role = session.role || 'STUDENT';
    const dashboardType = getDashboardType(role);
    const capabilityDecisions = listCapabilityDecisions({
        activeModules: session.activeModules || [],
        institutionType: session.institutionType,
        configuredProviders: configuredProviderRequirements(),
        hasPermission: (permission) => hasPermission(role as UserRole, permission),
        allowInternal: role === 'PLATFORM_ADMIN'
            && process.env.CAPABILITIES_INTERNAL_ACCESS === 'true',
    });
    const availableCapabilities = capabilityDecisions
        .filter(({ available }) => available)
        .map(({ id }) => id) as CapabilityId[];
    const paymentsAvailable = availableCapabilities.includes('payments');

    // Fetch real data from database
    let kpiData = {
        overdueAmount: 0,
        dueSoon: 0,
        collectionRate: 0,
        consentBlocked: 0,
    };

    let tenant = { name: 'School', slug: 'SCH' };

    if (isAdminRole(role) && paymentsAvailable) {
        try {
            const stats = await getDashboardStats();
            kpiData = {
                overdueAmount: stats.overdueAmount,
                dueSoon: stats.feesPending,
                collectionRate: stats.collectionRate,
                consentBlocked: 0, // TODO: implement consent tracking
            };
        } catch (error) {
            console.error('[Dashboard] Stats error:', error);
        }
    }

    try {
        const tenantInfo = await getTenantInfo();
        tenant = { name: tenantInfo.name, slug: tenantInfo.code };
        
        if (isAdminRole(role) && !tenantInfo.hasAcademicYear) {
            redirect('/onboarding');
        }
    } catch (error) {
        console.error('[Dashboard] Tenant error:', error);
    }

    // Get greeting based on time
    const hour = new Date().getHours();
    const greeting =
        hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">
                        {greeting}, {session.email?.split('@')[0] || 'User'}
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Here&apos;s what&apos;s happening at your school today
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <p className="text-sm font-medium text-foreground">
                            {tenant.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {tenant.slug.toUpperCase()}
                        </p>
                    </div>
                    <Badge variant="secondary">
                        {ROLE_LABELS[role] || role}
                    </Badge>
                </div>
            </div>

            <Separator />

            {/* Admin Dashboard */}
            {dashboardType === 'admin' && (
                <>
                    {/* KPI Cards */}
                    {paymentsAvailable ? (
                        <section>
                            <h2 className="mb-4 text-lg font-semibold text-foreground">
                                Fee Intelligence
                            </h2>
                            <KpiCards data={kpiData} />
                        </section>
                    ) : null}

                    {/* Modules Grid */}
                    <section>
                        <h2 className="mb-4 text-lg font-semibold text-foreground">
                            Quick Access
                        </h2>
                        <ModuleGrid role={role} availableCapabilities={availableCapabilities} />
                    </section>

                    {/* Recent Activity */}
                    <section>
                        <RecentActivity />
                    </section>
                </>
            )}

            {/* Teacher Dashboard */}
            {dashboardType === 'teacher' && (
                <>
                    <section>
                        <h2 className="mb-4 text-lg font-semibold text-foreground">
                            Today&apos;s Schedule
                        </h2>
                        <ModuleGrid role={role} availableCapabilities={availableCapabilities} />
                    </section>
                </>
            )}

            {/* Parent Dashboard */}
            {dashboardType === 'parent' && (
                <>
                    <section>
                        <h2 className="mb-4 text-lg font-semibold text-foreground">
                            Quick Actions
                        </h2>
                        <ModuleGrid role={role} availableCapabilities={availableCapabilities} />
                    </section>
                </>
            )}

            {/* Student Dashboard */}
            {dashboardType === 'student' && (
                <>
                    <section>
                        <ModuleGrid role={role} availableCapabilities={availableCapabilities} />
                    </section>
                </>
            )}
        </div>
    );
}
