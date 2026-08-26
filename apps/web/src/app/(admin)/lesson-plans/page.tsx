import { getLessonPlanOptions, getLessonPlanStats, listLessonPlans } from './actions';
import LessonPlansClient from './lesson-plans-client';

export const dynamic = 'force-dynamic';

export default async function LessonPlansPage({
    searchParams,
}: {
    searchParams: Promise<{ status?: string; teacherId?: string; gradeId?: string; subjectId?: string }>;
}) {
    const { status = '', teacherId = '', gradeId = '', subjectId = '' } = await searchParams;

    const [plans, stats, options] = await Promise.all([
        listLessonPlans({ status, teacherId, gradeId, subjectId }),
        getLessonPlanStats(),
        getLessonPlanOptions(),
    ]);

    return (
        <LessonPlansClient
            plans={plans}
            stats={stats}
            options={options}
            filters={{ status, teacherId, gradeId, subjectId }}
        />
    );
}
