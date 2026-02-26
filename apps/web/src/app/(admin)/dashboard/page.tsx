import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { KpiCards, ModuleGrid, RecentActivity } from '@/components/dashboard';
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/constants';
import { isAdminRole, getDashboardType } from '@/lib/rbac';
import { getDashboardStats, getTenantInfo } from '@/lib/actions/dashboard';

export default async function DashboardPage() {
    const session = await getSession();

    if (!session.isLoggedIn) {
        redirect('/login');
    }

    const role = session.role || 'STUDENT';
    const dashboardType = getDashboardType(role);

    // Fetch real data from database
    let kpiData = {
        overdueAmount: 0,
        dueSoon: 0,
        collectionRate: 0,
        consentBlocked: 0,
    };

    let tenant = { name: 'School', slug: 'SCH' };

    if (isAdminRole(role)) {
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
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        {greeting}, {session.email?.split('@')[0] || 'User'}
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Here&apos;s what&apos;s happening at your school today
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {tenant.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {tenant.slug.toUpperCase()}
                        </p>
                    </div>
                    <Badge className={ROLE_COLORS[role] || 'bg-slate-100'}>
                        {ROLE_LABELS[role] || role}
                    </Badge>
                </div>
            </div>

            <Separator />

            {/* Admin Dashboard */}
            {dashboardType === 'admin' && (
                <>
                    {/* KPI Cards */}
                    <section>
                        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                            Fee Intelligence
                        </h2>
                        <KpiCards data={kpiData} />
                    </section>

                    {/* Modules Grid */}
                    <section>
                        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                            Quick Access
                        </h2>
                        <ModuleGrid role={role} />
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
                        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                            Today&apos;s Schedule
                        </h2>
                        <ModuleGrid role={role} />
                    </section>
                </>
            )}

            {/* Parent Dashboard */}
            {dashboardType === 'parent' && (
                <>
                    <section>
                        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                            Quick Actions
                        </h2>
                        <ModuleGrid role={role} />
                    </section>
                </>
            )}

            {/* Student Dashboard */}
            {dashboardType === 'student' && (
                <>
                    <section>
                        <ModuleGrid role={role} />
                    </section>
                </>
            )}
        </div>
    );
}
