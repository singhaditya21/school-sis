export interface HomeworkAssignmentRow {
    id: string;
    title: string;
    description: string | null;
    dueDate: string;
    maxMarks: number | null;
    createdAt: string;
    gradeId: string | null;
    sectionId: string | null;
    subjectId: string | null;
    gradeName: string | null;
    sectionName: string | null;
    subjectName: string | null;
    assignedByName: string | null;
    submissionCount: number;
    gradedCount: number;
    expectedCount: number | null;
}

export interface HomeworkSubmissionRow {
    submissionId: string;
    studentId: string;
    studentName: string | null;
    rollNumber: number | null;
    admissionNumber: string | null;
    submittedAt: string;
    content: string | null;
    marks: number | null;
    feedback: string | null;
    gradedAt: string | null;
    gradedByName: string | null;
}

export interface HomeworkPendingStudentRow {
    studentId: string;
    studentName: string | null;
    rollNumber: number | null;
    admissionNumber: string | null;
}

export interface HomeworkStats {
    totalAssignments: number;
    dueThisWeek: number;
    totalSubmissions: number;
    gradedSubmissions: number;
    pendingGrading: number;
}

export interface GradeOption {
    gradeId: string;
    gradeName: string;
    sections: { sectionId: string; sectionName: string }[];
}

export interface SubjectOption {
    subjectId: string;
    subjectName: string;
    code: string | null;
}

export interface HomeworkOptions {
    grades: GradeOption[];
    subjects: SubjectOption[];
}
