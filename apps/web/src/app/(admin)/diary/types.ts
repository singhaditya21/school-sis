export const DIARY_TYPES = ['HOMEWORK', 'ANNOUNCEMENT', 'REMINDER', 'NOTE'] as const;

export type DiaryType = (typeof DIARY_TYPES)[number];

export interface DiaryEntryRow {
    id: string;
    title: string;
    content: string;
    date: string;
    type: string | null;
    gradeId: string | null;
    sectionId: string | null;
    subjectId: string | null;
    teacherId: string | null;
    gradeName: string | null;
    sectionName: string | null;
    subjectName: string | null;
    teacherName: string | null;
    createdAt: string | null;
}

export interface DiaryOptions {
    grades: { gradeId: string; gradeName: string; sections: { sectionId: string; sectionName: string }[] }[];
    subjects: { subjectId: string; subjectName: string }[];
    teachers: { teacherId: string; teacherName: string }[];
}
