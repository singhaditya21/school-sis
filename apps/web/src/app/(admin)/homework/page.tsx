import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { getAssignments, getHomeworkStats } from '@/lib/actions/homework';
import HomeworkDashboardClient from './homework-dashboard';

export default async function HomeworkPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const [assignments, stats] = await Promise.all([
        getAssignments(),
        getHomeworkStats(),
    ]);

    return (
        <HomeworkDashboardClient
            assignments={assignments}
            stats={stats}
        />
    );
}
