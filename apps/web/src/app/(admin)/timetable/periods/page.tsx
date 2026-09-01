import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { listGridPeriods, listPeriodUsage } from '../_actions/grid';
import PeriodManager from './PeriodManager';

export default async function TimetablePeriodsPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const [periods, usage] = await Promise.all([listGridPeriods(), listPeriodUsage()]);
    const usageByPeriod = new Map(usage.map((row) => [row.periodId, row.entryCount]));

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Periods</h1>
                    <p className="text-muted-foreground mt-1">The daily bell schedule every class timetable is built on</p>
                </div>
                <Link href="/timetable" className="px-4 py-2 border border-border rounded-lg hover:bg-muted">
                    ← Back to Timetable
                </Link>
            </div>

            <PeriodManager
                periods={periods.map((period) => ({
                    ...period,
                    entryCount: usageByPeriod.get(period.id) ?? 0,
                }))}
            />
        </div>
    );
}
