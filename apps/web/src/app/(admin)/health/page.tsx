import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { getHealthStats, getIncidents } from '@/lib/actions/health';
import HealthClient from './health-client';

export default async function HealthPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const [stats, incidents] = await Promise.all([
        getHealthStats(),
        getIncidents(),
    ]);

    return (
        <HealthClient
            stats={stats}
            incidents={incidents}
        />
    );
}
