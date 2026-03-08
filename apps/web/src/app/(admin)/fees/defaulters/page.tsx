import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { getDefaulterStats, getFeeAgeingBreakdown, getDefaulterList } from '@/lib/actions/fees';
import DefaulterDashboard from '@/components/fees/defaulter-dashboard';
import Link from 'next/link';

export default async function DefaultersPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const [stats, ageing, defaulters] = await Promise.all([
        getDefaulterStats(),
        getFeeAgeingBreakdown(),
        getDefaulterList({ sortBy: 'amount', limit: 100 }),
    ]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div />
                <Link href="/fees" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">
                    ← Back to Fees
                </Link>
            </div>
            <DefaulterDashboard
                initialStats={stats}
                initialAgeing={ageing}
                initialDefaulters={defaulters}
            />
        </div>
    );
}
