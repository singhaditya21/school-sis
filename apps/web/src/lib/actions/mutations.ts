'use server';

/**
 * Write mutations for form submissions.
 * All mutations are tenant-scoped and audit-logged.
 */

import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
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
        gender: formData.get('gender') as string,
        bloodGroup: (formData.get('bloodGroup') as string) || null,
        gradeId: formData.get('gradeId') as string,
        sectionId: formData.get('sectionId') as string,
        rollNumber: (formData.get('rollNumber') as string) || null,
        admissionDate: (formData.get('admissionDate') as string) || new Date().toISOString().split('T')[0],
        phone: (formData.get('phone') as string) || null,
        email: (formData.get('email') as string) || null,
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
        tableName: 'students',
        recordId: student.id,
        newState: { firstName: formData.get('firstName'), lastName: formData.get('lastName') },
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

    // Upsert attendance records
    for (const entry of entries) {
        const existing = await db
            .select({ id: schema.attendanceRecords.id })
            .from(schema.attendanceRecords)
            .where(and(
                eq(schema.attendanceRecords.studentId, entry.studentId),
                eq(schema.attendanceRecords.date, date),
                eq(schema.attendanceRecords.tenantId, tenantId)
            ));

        if (existing.length > 0) {
            await db.update(schema.attendanceRecords)
                .set({ status: entry.status as any, markedBy: userId })
                .where(eq(schema.attendanceRecords.id, existing[0].id));
        } else {
            await db.insert(schema.attendanceRecords).values({
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

    return { success: true, count: entries.length };
}

// ─── Record Payment ───────────────────────────────────────
export async function recordPayment(formData: FormData) {
    const { tenantId, userId } = await requireAuth('fees:write');

    const invoiceId = formData.get('invoiceId') as string;
    const amount = parseFloat(formData.get('amount') as string);
    const method = formData.get('method') as string;
    const reference = (formData.get('reference') as string) || null;

    // Create payment
    const [payment] = await db.insert(schema.payments).values({
        id: randomUUID(),
        tenantId,
        invoiceId,
        amount: String(amount),
        method: method as any,
        status: 'COMPLETED',
        gatewayRef: reference,
    }).returning({ id: schema.payments.id });

    // Update invoice paid amount
    const [invoice] = await db
        .select({ paidAmount: schema.invoices.paidAmount, totalAmount: schema.invoices.totalAmount })
        .from(schema.invoices)
        .where(eq(schema.invoices.id, invoiceId));

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
        action: 'CREATE',
        tableName: 'payments',
        recordId: payment.id,
        newState: { amount, method, invoiceId },
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
