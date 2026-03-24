'use server';

import { db } from '@/lib/db';
import { exams, examSchedules, studentResults, academicYears, grades, subjects, students, sections } from '@/lib/db/schema';
import { eq, and, count, asc, desc, sql, avg } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { randomUUID } from 'crypto';
import { redirect } from 'next/navigation';

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

// ─── Create Exam ─────────────────────────────────────────────

export async function createExam(formData: FormData): Promise<void> {
    const { tenantId } = await requireAuth('exams:write');

    const name = formData.get('name') as string;
    const type = formData.get('type') as string;
    const academicYearId = formData.get('academicYearId') as string;
    const startDate = formData.get('startDate') as string;
    const endDate = formData.get('endDate') as string;
    const description = formData.get('description') as string | null;

    if (!name || !type || !academicYearId || !startDate || !endDate) {
        throw new Error('Missing required fields');
    }

    const examId = randomUUID();
    await db.insert(exams).values({
        id: examId,
        tenantId,
        academicYearId,
        name,
        type: type as any,
        startDate,
        endDate,
        description,
    });

    redirect(`/exams/${examId}`);
}

// ─── Add Exam Schedule ───────────────────────────────────────

export async function addExamSchedule(data: {
    examId: string;
    gradeId: string;
    subjectId: string;
    examDate: string;
    startTime: string;
    endTime: string;
    maxMarks: number;
    passingMarks: number;
    roomNumber?: string;
}) {
    await requireAuth('exams:write');

    await db.insert(examSchedules).values({
        id: randomUUID(),
        examId: data.examId,
        gradeId: data.gradeId,
        subjectId: data.subjectId,
        examDate: data.examDate,
        startTime: data.startTime,
        endTime: data.endTime,
        maxMarks: String(data.maxMarks),
        passingMarks: String(data.passingMarks),
        roomNumber: data.roomNumber,
    });

    return { success: true };
}

// ─── Save Marks ──────────────────────────────────────────────

function calculateGrade(percentage: number): string {
    if (percentage >= 90) return 'A+';
    if (percentage >= 80) return 'A';
    if (percentage >= 70) return 'B+';
    if (percentage >= 60) return 'B';
    if (percentage >= 50) return 'C';
    if (percentage >= 40) return 'D';
    return 'F';
}

export async function saveMarks(
    examScheduleId: string,
    marks: { studentId: string; marksObtained: number | null; isAbsent: boolean; remarks?: string }[],
) {
    const { tenantId, userId } = await requireAuth('exams:write');

    // Get max marks for this schedule
    const [schedule] = await db
        .select({ maxMarks: examSchedules.maxMarks })
        .from(examSchedules)
        .where(eq(examSchedules.id, examScheduleId));

    const maxMarks = Number(schedule?.maxMarks || 100);

    for (const entry of marks) {
        const percentage = entry.marksObtained !== null ? (entry.marksObtained / maxMarks) * 100 : 0;
        const grade = entry.isAbsent ? 'AB' : calculateGrade(percentage);

        // Check if result already exists
        const [existing] = await db
            .select({ id: studentResults.id })
            .from(studentResults)
            .where(and(
                eq(studentResults.examScheduleId, examScheduleId),
                eq(studentResults.studentId, entry.studentId),
            ));

        if (existing) {
            await db.update(studentResults)
                .set({
                    marksObtained: entry.marksObtained !== null ? String(entry.marksObtained) : null,
                    grade,
                    isAbsent: entry.isAbsent,
                    remarks: entry.remarks,
                    enteredBy: userId,
                    updatedAt: new Date(),
                })
                .where(eq(studentResults.id, existing.id));
        } else {
            await db.insert(studentResults).values({
                id: randomUUID(),
                tenantId,
                examScheduleId,
                studentId: entry.studentId,
                marksObtained: entry.marksObtained !== null ? String(entry.marksObtained) : null,
                grade,
                isAbsent: entry.isAbsent,
                remarks: entry.remarks,
                enteredBy: userId,
            });
        }
    }

    return { success: true };
}

// ─── Exam Analytics ──────────────────────────────────────────

export interface ExamAnalytics {
    examName: string;
    totalStudents: number;
    appeared: number;
    passed: number;
    failed: number;
    passRate: number;
    classAverage: number;
    topScore: number;
    subjectBreakdown: {
        subjectName: string;
        gradeName: string;
        average: number;
        passRate: number;
        topMarks: number;
        maxMarks: number;
    }[];
}

export async function getExamAnalytics(examId: string): Promise<ExamAnalytics | null> {
    const { tenantId } = await requireAuth('exams:read');

    const [exam] = await db
        .select({ name: exams.name })
        .from(exams)
        .where(and(eq(exams.id, examId), eq(exams.tenantId, tenantId)));

    if (!exam) return null;

    const schedules = await db
        .select({
            id: examSchedules.id,
            gradeName: grades.name,
            subjectName: subjects.name,
            maxMarks: examSchedules.maxMarks,
            passingMarks: examSchedules.passingMarks,
        })
        .from(examSchedules)
        .innerJoin(grades, eq(examSchedules.gradeId, grades.id))
        .innerJoin(subjects, eq(examSchedules.subjectId, subjects.id))
        .where(eq(examSchedules.examId, examId));

    let totalStudents = 0;
    let appeared = 0;
    let passed = 0;
    let allMarks: number[] = [];
    const subjectBreakdown: ExamAnalytics['subjectBreakdown'] = [];

    for (const sched of schedules) {
        const results = await db
            .select({
                marksObtained: studentResults.marksObtained,
                isAbsent: studentResults.isAbsent,
            })
            .from(studentResults)
            .where(eq(studentResults.examScheduleId, sched.id));

        totalStudents += results.length;
        const schedAppeared = results.filter(r => !r.isAbsent);
        appeared += schedAppeared.length;

        const marks = schedAppeared
            .filter(r => r.marksObtained !== null)
            .map(r => Number(r.marksObtained));

        const passingMarks = Number(sched.passingMarks);
        const schedPassed = marks.filter(m => m >= passingMarks).length;
        passed += schedPassed;

        allMarks = [...allMarks, ...marks];

        const maxMarks = Number(sched.maxMarks);
        subjectBreakdown.push({
            subjectName: sched.subjectName,
            gradeName: sched.gradeName,
            average: marks.length > 0 ? Math.round(marks.reduce((s, m) => s + m, 0) / marks.length * 10) / 10 : 0,
            passRate: schedAppeared.length > 0 ? Math.round((schedPassed / schedAppeared.length) * 100) : 0,
            topMarks: marks.length > 0 ? Math.max(...marks) : 0,
            maxMarks,
        });
    }

    const failed = appeared - passed;

    return {
        examName: exam.name,
        totalStudents,
        appeared,
        passed,
        failed,
        passRate: appeared > 0 ? Math.round((passed / appeared) * 100) : 0,
        classAverage: allMarks.length > 0 ? Math.round(allMarks.reduce((s, m) => s + m, 0) / allMarks.length * 10) / 10 : 0,
        topScore: allMarks.length > 0 ? Math.max(...allMarks) : 0,
        subjectBreakdown,
    };
}

