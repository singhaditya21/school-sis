import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/lib/utils';
import {
    getFeePlans,
    getFeePlanComponents,
    getFeeOverview,
    getCollectionTrend,
    getDefaulterStats,
    getFeeAgeingBreakdown,
    getDefaulterList,
} from '@/lib/actions/fees';
import { FeeOverviewCards, CollectionRateBar, CollectionTrendChart } from '@/components/fees/fee-analytics';
import DefaulterDashboard from '@/components/fees/defaulter-dashboard';

export default async function FeesPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    // Fetch all data in parallel
    const [
        feePlans,
        overview,
        collectionTrend,
        defaulterStats,
        ageing,
        defaulters,
    ] = await Promise.all([
        getFeePlans(),
        getFeeOverview(),
        getCollectionTrend(6),
        getDefaulterStats(),
        getFeeAgeingBreakdown(),
        getDefaulterList({ sortBy: 'amount', limit: 50 }),
    ]);

    // Get components for each plan
    const plansWithComponents = await Promise.all(
        feePlans.map(async (plan) => {
            const components = await getFeePlanComponents(plan.id);
            return { ...plan, components };
        })
    );

    return (
        <div className="space-y-8">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Fee Management</h1>
                    <p className="text-muted-foreground mt-1">
                        Fee intelligence, collections tracking, and defaulter management
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <a
                        href="/fees/generate"
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm"
                    >
                        Generate Invoices
                    </a>
                    <a
                        href="/fees/cashflow"
                        className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors font-medium text-sm"
                    >
                        Cashflow
                    </a>
                    <a
                        href="/fees/defaulters"
                        className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors font-medium text-sm"
                    >
                        Defaulters
                    </a>
                    <a
                        href="/fees/plans/new"
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
                    >
                        + New Fee Plan
                    </a>
                </div>
            </div>

            {/* Fee Overview Cards */}
            <FeeOverviewCards overview={overview} />

            {/* Collection Rate + Trend Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-6">
                    <CollectionRateBar rate={overview.collectionRate} />
                </div>
                <div className="lg:col-span-2">
                    <CollectionTrendChart data={collectionTrend} />
                </div>
            </div>

            <Separator />

            {/* Defaulter Dashboard */}
            <DefaulterDashboard
                initialStats={defaulterStats}
                initialAgeing={ageing}
                initialDefaulters={defaulters}
            />

            <Separator />

            {/* Fee Plans */}
            <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                    Fee Plans
                </h2>

                <div className="space-y-4">
                    {plansWithComponents.map((plan) => (
                        <div key={plan.id} className="bg-white dark:bg-gray-950 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800">
                            <div className="p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{plan.name}</h3>
                                        <p className="text-sm text-muted-foreground">
                                            {plan.academicYearName} • {plan.invoiceCount} invoices
                                        </p>
                                    </div>
                                    <span
                                        className={`px-3 py-1 rounded-full text-xs font-medium ${plan.isActive
                                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                            : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                                            }`}
                                    >
                                        {plan.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </div>

                                {plan.description && (
                                    <p className="text-sm text-muted-foreground mb-4">{plan.description}</p>
                                )}

                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 dark:bg-gray-900/50">
                                            <tr>
                                                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Component</th>
                                                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Amount</th>
                                                <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground uppercase">Frequency</th>
                                                <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground uppercase">Type</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                                            {plan.components.map((comp) => (
                                                <tr key={comp.id}>
                                                    <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">{comp.name}</td>
                                                    <td className="px-4 py-2 text-right">{formatCurrency(Number(comp.amount))}</td>
                                                    <td className="px-4 py-2 text-center capitalize">{comp.frequency.toLowerCase().replace('_', ' ')}</td>
                                                    <td className="px-4 py-2 text-center">
                                                        <span
                                                            className={`px-2 py-0.5 rounded text-xs ${comp.isOptional
                                                                ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                                                                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                                                }`}
                                                        >
                                                            {comp.isOptional ? 'Optional' : 'Mandatory'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
                                    <p className="text-sm text-muted-foreground">
                                        Collected:{' '}
                                        <span className="font-semibold text-green-600 dark:text-green-400">
                                            {formatCurrency(plan.totalCollected)}
                                        </span>
                                    </p>
                                    <a
                                        href={`/fees/invoices?planId=${plan.id}`}
                                        className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                                    >
                                        View Invoices →
                                    </a>
                                </div>
                            </div>
                        </div>
                    ))}

                    {plansWithComponents.length === 0 && (
                        <div className="bg-white dark:bg-gray-950 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-12 text-center text-muted-foreground">
                            No fee plans configured yet. Create your first fee plan to get started.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
