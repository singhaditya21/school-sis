export const LESSON_PLAN_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'COMPLETED'] as const;

export type LessonPlanStatus = (typeof LESSON_PLAN_STATUSES)[number];

export interface LessonPlanRow {
    id: string;
    topic: string;
    objectives: string | null;
    activities: string | null;
    resources: string | null;
    assessmentPlan: string | null;
    duration: number | null;
    weekNumber: number | null;
    status: LessonPlanStatus;
    subjectId: string | null;
    gradeId: string | null;
    teacherId: string | null;
    subjectName: string | null;
    gradeName: string | null;
    teacherName: string | null;
    approvedByName: string | null;
    approvedAt: string | null;
    completedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface LessonPlanOptions {
    grades: { gradeId: string; gradeName: string }[];
    subjects: { subjectId: string; subjectName: string }[];
    teachers: { teacherId: string; teacherName: string }[];
}

export interface LessonPlanStats {
    total: number;
    draft: number;
    submitted: number;
    approved: number;
    completed: number;
}
