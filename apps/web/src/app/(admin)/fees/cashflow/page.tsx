import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { getCashflowForecast } from '@/lib/actions/cashflow';
import CashflowForecastChart from '@/components/fees/cashflow-forecast';
import Link from 'next/link';

export default async function CashflowPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const forecast = await getCashflowForecast(6);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div />
                <Link href="/fees" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">
                    ← Back to Fees
                </Link>
            </div>
            <CashflowForecastChart forecast={forecast} />
        </div>
    );
}
