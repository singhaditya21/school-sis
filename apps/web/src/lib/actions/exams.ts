'use server';

import { db } from '@/lib/db';
import { exams, examSchedules, studentResults, academicYears, grades, subjects, students } from '@/lib/db/schema';
import { eq, and, count, asc, desc } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';

export interface ExamListItem {
    id: string;
    name: string;
    type: string;
    startDate: string;
    endDate: string;
    description: string | null;
    academicYearName: string;
    scheduleCount: number;
}

export interface ExamScheduleItem {
    id: string;
    gradeName: string;
    subjectName: string;
    examDate: string;
    startTime: string;
    endTime: string;
    maxMarks: string;
    passingMarks: string;
    roomNumber: string | null;
    resultCount: number;
}

export async function getExams(): Promise<ExamListItem[]> {
    const { tenantId } = await requireAuth('exams:read');

    const rows = await db
        .select({
            id: exams.id,
            name: exams.name,
            type: exams.type,
            startDate: exams.startDate,
            endDate: exams.endDate,
            description: exams.description,
            academicYearName: academicYears.name,
        })
        .from(exams)
        .innerJoin(academicYears, eq(exams.academicYearId, academicYears.id))
        .where(eq(exams.tenantId, tenantId))
        .orderBy(desc(exams.startDate));

    const result: ExamListItem[] = [];
    for (const exam of rows) {
        const [schedCount] = await db
            .select({ count: count() })
            .from(examSchedules)
            .where(eq(examSchedules.examId, exam.id));

        result.push({ ...exam, scheduleCount: schedCount.count });
    }

    return result;
}

export async function getExamSchedules(examId: string): Promise<ExamScheduleItem[]> {
    await requireAuth('exams:read');

    const rows = await db
        .select({
            id: examSchedules.id,
            gradeName: grades.name,
            subjectName: subjects.name,
            examDate: examSchedules.examDate,
            startTime: examSchedules.startTime,
            endTime: examSchedules.endTime,
            maxMarks: examSchedules.maxMarks,
            passingMarks: examSchedules.passingMarks,
            roomNumber: examSchedules.roomNumber,
        })
        .from(examSchedules)
        .innerJoin(grades, eq(examSchedules.gradeId, grades.id))
        .innerJoin(subjects, eq(examSchedules.subjectId, subjects.id))
        .where(eq(examSchedules.examId, examId))
        .orderBy(asc(examSchedules.examDate), asc(grades.displayOrder));

    const result: ExamScheduleItem[] = [];
    for (const sched of rows) {
        const [resultCount] = await db
            .select({ count: count() })
            .from(studentResults)
            .where(eq(studentResults.examScheduleId, sched.id));

        result.push({ ...sched, resultCount: resultCount.count });
    }

    return result;
}

export async function getExamResults(examScheduleId: string) {
    await requireAuth('exams:read');

    return db
        .select({
            id: studentResults.id,
            studentFirstName: students.firstName,
            studentLastName: students.lastName,
            admissionNumber: students.admissionNumber,
            marksObtained: studentResults.marksObtained,
            grade: studentResults.grade,
            remarks: studentResults.remarks,
            isAbsent: studentResults.isAbsent,
        })
        .from(studentResults)
        .innerJoin(students, eq(studentResults.studentId, students.id))
        .where(eq(studentResults.examScheduleId, examScheduleId))
        .orderBy(asc(students.firstName));
}
