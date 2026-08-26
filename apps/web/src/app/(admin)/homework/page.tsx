import { getHomeworkOptions, getHomeworkOverview, listHomeworkAssignments } from './actions';
import HomeworkDashboardClient from './homework-dashboard';

export const dynamic = 'force-dynamic';

type Scope = 'all' | 'open' | 'overdue';

function parseScope(value: string | undefined): Scope {
    return value === 'open' || value === 'overdue' ? value : 'all';
}

export default async function HomeworkPage({
    searchParams,
}: {
    searchParams: Promise<{ gradeId?: string; subjectId?: string; scope?: string }>;
}) {
    const { gradeId = '', subjectId = '', scope: scopeParam } = await searchParams;
    const scope = parseScope(scopeParam);

    const [assignments, stats, options] = await Promise.all([
        listHomeworkAssignments({ gradeId, subjectId, scope }),
        getHomeworkOverview(),
        getHomeworkOptions(),
    ]);

    return (
        <HomeworkDashboardClient
            assignments={assignments}
            stats={stats}
            options={options}
            filters={{ gradeId, subjectId, scope }}
        />
    );
}
