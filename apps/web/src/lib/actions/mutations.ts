'use server';

/**
 * Write mutations for form submissions.
 * All mutations are tenant-scoped and audit-logged.
 */

import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { randomUUID } from 'crypto';

// ─── Create Student ───────────────────────────────────────
export async function createStudent(formData: FormData) {
    const { tenantId, userId } = await requireAuth('students:write');

    const admissionNumber = `ADM-${Date.now().toString(36).toUpperCase()}`;

    const [student] = await db.insert(schema.students).values({
        id: randomUUID(),
        tenantId,
        admissionNumber,
        firstName: formData.get('firstName') as string,
        lastName: formData.get('lastName') as string,
        dateOfBirth: formData.get('dateOfBirth') as string,
        gender: (formData.get('gender') as string) as any,
        bloodGroup: (formData.get('bloodGroup') as string as any) || null,
        gradeId: formData.get('gradeId') as string,
        sectionId: formData.get('sectionId') as string,
        rollNumber: formData.get('rollNumber') ? parseInt(formData.get('rollNumber') as string) : null,
        admissionDate: (formData.get('admissionDate') as string) || new Date().toISOString().split('T')[0],
        address: (formData.get('address') as string) || null,
        city: (formData.get('city') as string) || null,
        state: (formData.get('state') as string) || null,
        pincode: (formData.get('pincode') as string) || null,
        status: 'ACTIVE',
    }).returning({ id: schema.students.id });

    // Audit log
    await db.insert(schema.auditLogs).values({
        id: randomUUID(),
        tenantId,
        userId,
        action: 'CREATE',
        entityType: 'students',
        entityId: student.id,
        afterState: { firstName: formData.get('firstName'), lastName: formData.get('lastName') },
    });

    return { success: true, studentId: student.id };
}

// ─── Save Attendance ──────────────────────────────────────
export async function saveAttendance(formData: FormData) {
    const { tenantId, userId } = await requireAuth('attendance:write');

    const sectionId = formData.get('sectionId') as string;
    const date = formData.get('date') as string;

    // Extract status entries from form
    const entries: { studentId: string; status: string }[] = [];
    for (const [key, value] of formData.entries()) {
        const match = key.match(/^status\[(.+)\]$/);
        if (match) {
            entries.push({ studentId: match[1], status: value as string });
        }
    }

    if (entries.length === 0) {
        return { success: true, count: 0 };
    }

    const studentIds = entries.map(e => e.studentId);

    await db.transaction(async (tx) => {
        // Fetch all existing attendance records for the given students and date
        const existingRecords = await tx
            .select({ id: schema.attendanceRecords.id, studentId: schema.attendanceRecords.studentId })
            .from(schema.attendanceRecords)
            .where(and(
                inArray(schema.attendanceRecords.studentId, studentIds),
                eq(schema.attendanceRecords.date, date),
                eq(schema.attendanceRecords.tenantId, tenantId)
            ));

        const existingMap = new Map(existingRecords.map(r => [r.studentId, r.id]));

        const toInsert = [];
        const toUpdate = [];

        for (const entry of entries) {
            const existingId = existingMap.get(entry.studentId);
            if (existingId) {
                toUpdate.push({ id: existingId, status: entry.status as any, markedBy: userId });
            } else {
                toInsert.push({
                    id: randomUUID(),
                    tenantId,
                    studentId: entry.studentId,
                    sectionId,
                    date,
                    status: entry.status as any,
                    markedBy: userId,
                });
            }
        }

        if (toInsert.length > 0) {
            await tx.insert(schema.attendanceRecords).values(toInsert);
        }

        if (toUpdate.length > 0) {
            await Promise.all(
                toUpdate.map(updateData =>
                    tx.update(schema.attendanceRecords)
                        .set({ status: updateData.status, markedBy: updateData.markedBy })
                        .where(eq(schema.attendanceRecords.id, updateData.id))
                )
            );
        }
    });

    return { success: true, count: entries.length };
}

// ─── Record Payment ───────────────────────────────────────
export async function recordPayment(formData: FormData) {
    const { tenantId, userId } = await requireAuth('fees:write');

    const invoiceId = formData.get('invoiceId') as string;
    const amountStr = formData.get('amount') as string;
    const method = formData.get('method') as string;

    // Validate inputs
    if (!invoiceId || typeof invoiceId !== 'string') {
        return { success: false, error: 'Invoice ID is required' };
    }
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
        return { success: false, error: 'Amount must be a positive number' };
    }
    const validMethods = ['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'ONLINE'];
    if (!validMethods.includes(method)) {
        return { success: false, error: `Invalid payment method. Must be one of: ${validMethods.join(', ')}` };
    }

    // Look up the invoice — tenant-scoped
    const [invoice] = await db
        .select({ studentId: schema.invoices.studentId, paidAmount: schema.invoices.paidAmount, totalAmount: schema.invoices.totalAmount })
        .from(schema.invoices)
        .where(and(eq(schema.invoices.id, invoiceId), eq(schema.invoices.tenantId, tenantId)));

    if (!invoice) throw new Error('Invoice not found');

    // Create payment
    const [payment] = await db.insert(schema.payments).values({
        id: randomUUID(),
        tenantId,
        invoiceId,
        studentId: invoice.studentId,
        amount: String(amount),
        method: method as any,
        status: 'COMPLETED',
    }).returning({ id: schema.payments.id });

    // Update invoice paid amount
    const newPaid = Number(invoice.paidAmount) + amount;
    const newStatus = newPaid >= Number(invoice.totalAmount) ? 'PAID' : 'PARTIAL';

    await db.update(schema.invoices)
        .set({ paidAmount: String(newPaid), status: newStatus as any })
        .where(eq(schema.invoices.id, invoiceId));

    // Create receipt
    const receiptNumber = `RCP-${Date.now().toString(36).toUpperCase()}`;
    await db.insert(schema.receipts).values({
        id: randomUUID(),
        tenantId,
        paymentId: payment.id,
        receiptNumber,
    });

    // Audit
    await db.insert(schema.auditLogs).values({
        id: randomUUID(),
        tenantId,
        userId,
        action: 'PAYMENT',
        entityType: 'payments',
        entityId: payment.id,
        afterState: { amount, method, invoiceId },
    });

    return { success: true, paymentId: payment.id };
}

// ─── Create Fee Plan ──────────────────────────────────────
export async function createFeePlan(formData: FormData) {
    const { tenantId } = await requireAuth('fees:write');

    const [plan] = await db.insert(schema.feePlans).values({
        id: randomUUID(),
        tenantId,
        name: formData.get('name') as string,
        academicYearId: formData.get('academicYearId') as string,
        description: (formData.get('description') as string) || null,
    }).returning({ id: schema.feePlans.id });

    return { success: true, feePlanId: plan.id };
}

// ─── Create Exam ──────────────────────────────────────────
export async function createExam(formData: FormData) {
    const { tenantId } = await requireAuth('exams:write');

    const [exam] = await db.insert(schema.exams).values({
        id: randomUUID(),
        tenantId,
        name: formData.get('name') as string,
        type: (formData.get('type') as string) as any,
        academicYearId: formData.get('academicYearId') as string,
        startDate: formData.get('startDate') as string,
        endDate: formData.get('endDate') as string,
        description: (formData.get('description') as string) || null,
    }).returning({ id: schema.exams.id });

    return { success: true, examId: exam.id };
}

// ─── Mark Class Attendance (for attendance-form.tsx) ──────
export async function markClassAttendance(
    sectionId: string,
    date: Date,
    attendanceData: { studentId: string; status: string; remarks?: string }[]
) {
    const { tenantId, userId } = await requireAuth('attendance:write');
    const dateStr = date.toISOString().split('T')[0];

    if (attendanceData.length === 0) {
        return { success: true as const, error: undefined as string | undefined };
    }

    const studentIds = attendanceData.map(e => e.studentId);

    await db.transaction(async (tx) => {
        const existingRecords = await tx
            .select({ id: schema.attendanceRecords.id, studentId: schema.attendanceRecords.studentId })
            .from(schema.attendanceRecords)
            .where(and(
                inArray(schema.attendanceRecords.studentId, studentIds),
                eq(schema.attendanceRecords.date, dateStr),
                eq(schema.attendanceRecords.tenantId, tenantId)
            ));

        const existingMap = new Map(existingRecords.map(r => [r.studentId, r.id]));

        const toInsert = [];
        const toUpdate = [];

        for (const entry of attendanceData) {
            const existingId = existingMap.get(entry.studentId);
            if (existingId) {
                toUpdate.push({ id: existingId, status: entry.status as any, markedBy: userId, remarks: entry.remarks });
            } else {
                toInsert.push({
                    id: randomUUID(),
                    tenantId,
                    studentId: entry.studentId,
                    sectionId,
                    date: dateStr,
                    status: entry.status as any,
                    markedBy: userId,
                    remarks: entry.remarks,
                });
            }
        }

        if (toInsert.length > 0) {
            await tx.insert(schema.attendanceRecords).values(toInsert);
        }

        if (toUpdate.length > 0) {
            await Promise.all(
                toUpdate.map(updateData =>
                    tx.update(schema.attendanceRecords)
                        .set({ status: updateData.status, markedBy: updateData.markedBy, remarks: updateData.remarks })
                        .where(eq(schema.attendanceRecords.id, updateData.id))
                )
            );
        }
    });

    return { success: true as const, error: undefined as string | undefined };
}

// ─── Enter Exam Marks (for marks-entry-form.tsx) ──────────
export async function enterMarks(
    examId: string,
    marksData: { studentId: string; subjectId: string; marksObtained: number; isAbsent: boolean }[]
) {
    const { tenantId } = await requireAuth('exams:write');

    if (marksData.length === 0) {
        return { success: true as const, error: undefined as string | undefined };
    }

    await db.transaction(async (tx) => {
        // Fetch all relevant schedules for this exam and the subjects provided
        const subjectIds = Array.from(new Set(marksData.map(e => e.subjectId)));
        const schedules = await tx
            .select({ id: schema.examSchedules.id, subjectId: schema.examSchedules.subjectId })
            .from(schema.examSchedules)
            .where(and(
                eq(schema.examSchedules.examId, examId),
                inArray(schema.examSchedules.subjectId, subjectIds)
            ));

        const scheduleMap = new Map(schedules.map(s => [s.subjectId, s.id]));
        const validMarksData = marksData.filter(entry => scheduleMap.has(entry.subjectId));

        if (validMarksData.length === 0) {
            return;
        }

        const studentIds = Array.from(new Set(validMarksData.map(e => e.studentId)));
        const scheduleIds = Array.from(new Set(schedules.map(s => s.id)));

        // Fetch existing results for these students and schedules
        const existingResults = await tx
            .select({
                id: schema.studentResults.id,
                studentId: schema.studentResults.studentId,
                examScheduleId: schema.studentResults.examScheduleId
            })
            .from(schema.studentResults)
            .where(and(
                inArray(schema.studentResults.examScheduleId, scheduleIds),
                inArray(schema.studentResults.studentId, studentIds),
                eq(schema.studentResults.tenantId, tenantId)
            ));

        // Create a lookup key based on studentId and examScheduleId
        const existingMap = new Map(existingResults.map(r => [`${r.studentId}_${r.examScheduleId}`, r.id]));

        const toInsert = [];
        const toUpdate = [];

        for (const entry of validMarksData) {
            const scheduleId = scheduleMap.get(entry.subjectId)!;
            const lookupKey = `${entry.studentId}_${scheduleId}`;
            const existingId = existingMap.get(lookupKey);

            if (existingId) {
                toUpdate.push({ id: existingId, marksObtained: String(entry.marksObtained), isAbsent: entry.isAbsent });
            } else {
                toInsert.push({
                    id: randomUUID(),
                    tenantId,
                    examScheduleId: scheduleId,
                    studentId: entry.studentId,
                    marksObtained: String(entry.marksObtained),
                    isAbsent: entry.isAbsent,
                });
            }
        }

        if (toInsert.length > 0) {
            await tx.insert(schema.studentResults).values(toInsert);
        }

        if (toUpdate.length > 0) {
            await Promise.all(
                toUpdate.map(updateData =>
                    tx.update(schema.studentResults)
                        .set({ marksObtained: updateData.marksObtained, isAbsent: updateData.isAbsent })
                        .where(eq(schema.studentResults.id, updateData.id))
                )
            );
        }
    });

    return { success: true as const, error: undefined as string | undefined };
}
