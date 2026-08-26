import { getMyLessonPlans, getMyLessonPlanTargets } from '../_actions/lesson-plans';
import { LessonPlanBoard } from '../_components/LessonPlanBoard';

export const dynamic = 'force-dynamic';

/**
 * This page used to show an "AI Lesson Planning Engine": a scripted chat with a
 * model that is not wired up, a fabricated 14-week CS301 syllabus and an
 * "Export to Moodle (LTI)" button with no integration behind it. None of that
 * exists. What does exist is the `lesson_plans` table, so that is what is here.
 */
export default async function TeacherLessonPlansPage() {
    const [plans, targets] = await Promise.all([getMyLessonPlans(), getMyLessonPlanTargets()]);

    return (
        <div className="space-y-6 max-w-5xl">
            <div>
                <h1 className="text-2xl font-bold">Lesson Plans</h1>
                <p className="text-gray-600">
                    Plans you have filed for the grades and subjects on your timetable. A plan is approved by
                    the office, not from this page.
                </p>
            </div>

            <LessonPlanBoard plans={plans} targets={targets} />
        </div>
    );
}
