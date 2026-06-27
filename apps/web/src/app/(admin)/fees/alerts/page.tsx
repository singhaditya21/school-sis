import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { getDefaulterAlertStats, getDefaulterList } from '@/lib/actions/fees';
import DefaulterAlerts from '@/components/fees/defaulter-alerts';
import Link from 'next/link';

export default async function DefaulterAlertsPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const [stats, defaulters] = await Promise.all([
        getDefaulterAlertStats(),
        getDefaulterList({ sortBy: 'days', limit: 100 }),
    ]);

    return (
        <div className="p-6">
            <div className="flex justify-end mb-2">
                <Link href="/fees" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">
                    ← Back to Fees
                </Link>
            </div>
            <DefaulterAlerts
                stats={stats}
                defaulters={defaulters}
            />
        </div>
    );
}
