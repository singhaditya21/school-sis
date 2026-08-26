import Link from 'next/link';
import { getDefaulterAlertStats, getDefaulterList } from '@/lib/actions/fees';
import DefaulterAlertsView from './defaulter-alerts-view';

export const metadata = {
    title: 'Overdue Fee Watchlist | ScholarMind',
};

export default async function DefaulterAlertsPage() {
    const [stats, defaulters] = await Promise.all([
        getDefaulterAlertStats(),
        getDefaulterList({ sortBy: 'days', limit: 100 }),
    ]);

    return (
        <div className="p-6 space-y-4">
            <div className="flex justify-end">
                <Link href="/fees" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">
                    ← Back to Fees
                </Link>
            </div>
            <DefaulterAlertsView stats={stats} defaulters={defaulters} />
        </div>
    );
}
