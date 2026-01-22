import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { KpiCards, ModuleGrid, RecentActivity } from '@/components/dashboard';
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/constants';
import { isAdminRole, getDashboardType } from '@/lib/rbac';
import { createApiClient } from '@/lib/api';

export default async function DashboardPage() {
    const session = await getSession();

    if (!session.isLoggedIn) {
        redirect('/login');
    }

    const role = session.role || 'STUDENT';
    const dashboardType = getDashboardType(role);

    // Create API client with session token
    const apiClient = createApiClient(session.token);

    // Default KPI data - mock values for demo
    let kpiData = {
        overdueAmount: 4250000, // ₹42.5L
        dueSoon: 1500000, // ₹15L
        collectionRate: 87,
        consentBlocked: 23,
    };

    // Default tenant info
    let tenant = {
        name: 'Greenwood International School',
        slug: 'GWD',
    };

    // Fetch data from Java API for admin roles
    if (isAdminRole(role)) {
        try {
            // Fetch dashboard stats
            const statsResponse = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/dashboard/stats`,
                {
                    headers: {
                        'Authorization': `Bearer ${session.token}`,
                        'Content-Type': 'application/json',
                    },
                    cache: 'no-store',
                }
            );

            if (statsResponse.ok) {
                const statsData = await statsResponse.json();
                if (statsData.data) {
                    kpiData = {
                        overdueAmount: statsData.data.overdueAmount || kpiData.overdueAmount,
                        dueSoon: statsData.data.dueSoon || kpiData.dueSoon,
                        collectionRate: statsData.data.collectionRate || kpiData.collectionRate,
                        consentBlocked: statsData.data.consentBlocked || kpiData.consentBlocked,
                    };
                }
            }

            // Fetch tenant info
            const tenantResponse = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/tenants/current`,
                {
                    headers: {
                        'Authorization': `Bearer ${session.token}`,
                        'Content-Type': 'application/json',
                    },
                    cache: 'no-store',
                }
            );

            if (tenantResponse.ok) {
                const tenantData = await tenantResponse.json();
                if (tenantData.data) {
                    tenant = {
                        name: tenantData.data.name || tenant.name,
                        slug: tenantData.data.slug || tenant.slug,
                    };
                }
            }
        } catch (error) {
            console.error('[Dashboard] API Error, using mock data:', error);
            // Use default mock values on error (already set above)
        }
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

                    <section>
                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
                            <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                                📅 Upcoming Classes
                            </h3>
                            <div className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
                                <p>• Period 3: Mathematics - Grade 8A (10:30 AM)</p>
                                <p>• Period 5: Mathematics - Grade 7B (12:30 PM)</p>
                                <p>• Period 7: Extra Class - Grade 8A (3:00 PM)</p>
                            </div>
                        </div>
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

                    <section>
                        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-6 border border-amber-200 dark:border-amber-800">
                            <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-2">
                                💰 Pending Dues
                            </h3>
                            <p className="text-2xl font-bold text-amber-700 dark:text-amber-300 mb-2">
                                ₹12,500
                            </p>
                            <p className="text-sm text-amber-600 dark:text-amber-400">
                                Q3 Tuition Fee due in 5 days
                            </p>
                        </div>
                    </section>
                </>
            )}

            {/* Student Dashboard */}
            {dashboardType === 'student' && (
                <>
                    <section>
                        <ModuleGrid role={role} />
                    </section>

                    <section>
                        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-6 border border-purple-200 dark:border-purple-800">
                            <h3 className="font-semibold text-purple-900 dark:text-purple-100 mb-2">
                                📚 Today&apos;s Classes
                            </h3>
                            <div className="space-y-2 text-sm text-purple-800 dark:text-purple-200">
                                <p>• Period 1: English (8:00 AM - 8:45 AM)</p>
                                <p>• Period 2: Mathematics (8:45 AM - 9:30 AM)</p>
                                <p>• Period 3: Science (10:00 AM - 10:45 AM)</p>
                            </div>
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}
