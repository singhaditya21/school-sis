'use server';
/**
 * Consolidated detail queries for sub-pages.
 * All queries are tenant-scoped via requireAuth() middleware.
 */

import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { eq, and, asc, desc, count } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';

// ─── Student Detail ───────────────────────────────────────
export async function getStudentDetail(studentId: string) {
    const { tenantId } = await requireAuth('students:read');

    const [student] = await db
        .select({
            id: schema.students.id,
            admissionNumber: schema.students.admissionNumber,
            firstName: schema.students.firstName,
            lastName: schema.students.lastName,
            dateOfBirth: schema.students.dateOfBirth,
            gender: schema.students.gender,
            bloodGroup: schema.students.bloodGroup,
            address: schema.students.address,
            city: schema.students.city,
            state: schema.students.state,
            pincode: schema.students.pincode,
            rollNumber: schema.students.rollNumber,
            admissionDate: schema.students.admissionDate,
            status: schema.students.status,
            gradeName: schema.grades.name,
            sectionName: schema.sections.name,
        })
        .from(schema.students)
        .innerJoin(schema.grades, eq(schema.students.gradeId, schema.grades.id))
        .innerJoin(schema.sections, eq(schema.students.sectionId, schema.sections.id))
        .where(and(eq(schema.students.id, studentId), eq(schema.students.tenantId, tenantId)));

    if (!student) return null;

    const studentGuardians = await db
        .select({
            id: schema.guardians.id,
            firstName: schema.guardians.firstName,
            lastName: schema.guardians.lastName,
            relation: schema.guardians.relation,
            phone: schema.guardians.phone,
            email: schema.guardians.email,
            occupation: schema.guardians.occupation,
            isPrimary: schema.guardians.isPrimary,
        })
        .from(schema.guardians)
        .where(and(eq(schema.guardians.studentId, studentId), eq(schema.guardians.tenantId, tenantId)));

    return { ...student, guardians: studentGuardians };
}

// ─── Students by Section (for attendance, timetable) ──────
export async function getStudentsBySection(sectionId: string) {
    const { tenantId } = await requireAuth('students:read');

    return db
        .select({
            id: schema.students.id,
            admissionNumber: schema.students.admissionNumber,
            firstName: schema.students.firstName,
            lastName: schema.students.lastName,
            rollNumber: schema.students.rollNumber,
        })
        .from(schema.students)
        .where(and(
            eq(schema.students.sectionId, sectionId),
            eq(schema.students.tenantId, tenantId),
            eq(schema.students.status, 'ACTIVE')
        ))
        .orderBy(asc(schema.students.rollNumber), asc(schema.students.firstName));
}

// ─── Invoice Detail ───────────────────────────────────────
export async function getInvoiceDetail(invoiceId: string) {
    const { tenantId } = await requireAuth('fees:read');

    const [invoice] = await db
        .select({
            id: schema.invoices.id,
            invoiceNumber: schema.invoices.invoiceNumber,
            totalAmount: schema.invoices.totalAmount,
            paidAmount: schema.invoices.paidAmount,
            dueDate: schema.invoices.dueDate,
            status: schema.invoices.status,
            description: schema.invoices.description,
            studentFirstName: schema.students.firstName,
            studentLastName: schema.students.lastName,
            studentId: schema.students.id,
            feePlanId: schema.invoices.feePlanId,
        })
        .from(schema.invoices)
        .innerJoin(schema.students, eq(schema.invoices.studentId, schema.students.id))
        .where(and(eq(schema.invoices.id, invoiceId), eq(schema.invoices.tenantId, tenantId)));

    if (!invoice) return null;

    // Get fee components (line items)
    const components = await db
        .select({
            name: schema.feeComponents.name,
            amount: schema.feeComponents.amount,
            frequency: schema.feeComponents.frequency,
            isOptional: schema.feeComponents.isOptional,
        })
        .from(schema.feeComponents)
        .where(eq(schema.feeComponents.feePlanId, invoice.feePlanId))
        .orderBy(asc(schema.feeComponents.createdAt));

    // Get payments
    const payments = await db
        .select({
            id: schema.payments.id,
            amount: schema.payments.amount,
            method: schema.payments.method,
            status: schema.payments.status,
            createdAt: schema.payments.createdAt,
        })
        .from(schema.payments)
        .where(and(eq(schema.payments.invoiceId, invoiceId), eq(schema.payments.tenantId, tenantId)))
        .orderBy(desc(schema.payments.createdAt));

    return {
        ...invoice,
        studentName: `${invoice.studentFirstName} ${invoice.studentLastName}`,
        dueAmount: String(Number(invoice.totalAmount) - Number(invoice.paidAmount)),
        lineItems: components,
        payments,
    };
}

// ─── Receipt Detail ───────────────────────────────────────
export async function getReceiptDetail(receiptId: string) {
    const { tenantId } = await requireAuth('fees:read');

    const [receipt] = await db
        .select({
            id: schema.receipts.id,
            receiptNumber: schema.receipts.receiptNumber,
            amount: schema.payments.amount,
            method: schema.payments.method,
            paymentDate: schema.payments.createdAt,
            invoiceId: schema.payments.invoiceId,
            studentFirstName: schema.students.firstName,
            studentLastName: schema.students.lastName,
        })
        .from(schema.receipts)
        .innerJoin(schema.payments, eq(schema.receipts.paymentId, schema.payments.id))
        .innerJoin(schema.invoices, eq(schema.payments.invoiceId, schema.invoices.id))
        .innerJoin(schema.students, eq(schema.invoices.studentId, schema.students.id))
        .where(and(eq(schema.receipts.id, receiptId), eq(schema.receipts.tenantId, tenantId)));

    return receipt || null;
}

// ─── Exam Detail ──────────────────────────────────────────
export async function getExamDetail(examId: string) {
    const { tenantId } = await requireAuth('exams:read');

    const [exam] = await db
        .select({
            id: schema.exams.id,
            name: schema.exams.name,
            type: schema.exams.type,
            startDate: schema.exams.startDate,
            endDate: schema.exams.endDate,
            description: schema.exams.description,
            academicYearName: schema.academicYears.name,
        })
        .from(schema.exams)
        .innerJoin(schema.academicYears, eq(schema.exams.academicYearId, schema.academicYears.id))
        .where(and(eq(schema.exams.id, examId), eq(schema.exams.tenantId, tenantId)));

    if (!exam) return null;

    const schedules = await db
        .select({
            id: schema.examSchedules.id,
            gradeName: schema.grades.name,
            gradeId: schema.grades.id,
            subjectName: schema.subjects.name,
            examDate: schema.examSchedules.examDate,
            startTime: schema.examSchedules.startTime,
            endTime: schema.examSchedules.endTime,
            maxMarks: schema.examSchedules.maxMarks,
            passingMarks: schema.examSchedules.passingMarks,
        })
        .from(schema.examSchedules)
        .innerJoin(schema.grades, eq(schema.examSchedules.gradeId, schema.grades.id))
        .innerJoin(schema.subjects, eq(schema.examSchedules.subjectId, schema.subjects.id))
        .where(eq(schema.examSchedules.examId, examId))
        .orderBy(asc(schema.examSchedules.examDate));

    return { ...exam, schedules };
}

// ─── Admission Lead Detail ────────────────────────────────
export async function getAdmissionLeadDetail(leadId: string) {
    const { tenantId } = await requireAuth('admissions:read');

    const [lead] = await db
        .select({
            id: schema.admissionLeads.id,
            childFirstName: schema.admissionLeads.childFirstName,
            childLastName: schema.admissionLeads.childLastName,
            childDob: schema.admissionLeads.childDob,
            applyingForGrade: schema.admissionLeads.applyingForGrade,
            parentName: schema.admissionLeads.parentName,
            parentEmail: schema.admissionLeads.parentEmail,
            parentPhone: schema.admissionLeads.parentPhone,
            source: schema.admissionLeads.source,
            stage: schema.admissionLeads.stage,
            notes: schema.admissionLeads.notes,
            createdAt: schema.admissionLeads.createdAt,
        })
        .from(schema.admissionLeads)
        .where(and(eq(schema.admissionLeads.id, leadId), eq(schema.admissionLeads.tenantId, tenantId)));

    if (!lead) return null;

    // Get documents
    const applications = await db
        .select({
            id: schema.admissionApplications.id,
            applicationNumber: schema.admissionApplications.applicationNumber,
            submittedAt: schema.admissionApplications.submittedAt,
            createdAt: schema.admissionApplications.createdAt,
        })
        .from(schema.admissionApplications)
        .where(eq(schema.admissionApplications.leadId, leadId))
        .orderBy(desc(schema.admissionApplications.createdAt));

    return { ...lead, applications };
}

// ─── Section Info (for attendance marking) ────────────────
export async function getSectionInfo(sectionId: string) {
    const { tenantId } = await requireAuth();

    const [section] = await db
        .select({
            id: schema.sections.id,
            sectionName: schema.sections.name,
            gradeName: schema.grades.name,
        })
        .from(schema.sections)
        .innerJoin(schema.grades, eq(schema.sections.gradeId, schema.grades.id))
        .where(and(eq(schema.sections.id, sectionId), eq(schema.sections.tenantId, tenantId)));

    return section || null;
}

// ─── Attendance for section on date ───────────────────────
export async function getAttendanceForSection(sectionId: string, date: string) {
    const { tenantId } = await requireAuth('attendance:read');

    return db
        .select({
            studentId: schema.attendanceRecords.studentId,
            status: schema.attendanceRecords.status,
        })
        .from(schema.attendanceRecords)
        .where(and(
            eq(schema.attendanceRecords.sectionId, sectionId),
            eq(schema.attendanceRecords.tenantId, tenantId),
            eq(schema.attendanceRecords.date, date)
        ));
}

// ─── Academic Years (for dropdowns) ───────────────────────
export async function getAcademicYears() {
    const { tenantId } = await requireAuth();

    return db
        .select({
            id: schema.academicYears.id,
            name: schema.academicYears.name,
            isCurrent: schema.academicYears.isCurrent,
        })
        .from(schema.academicYears)
        .where(eq(schema.academicYears.tenantId, tenantId))
        .orderBy(desc(schema.academicYears.startDate));
}

// ─── Terms (for dropdowns) ────────────────────────────────
export async function getTerms() {
    const { tenantId } = await requireAuth();

    return db
        .select({
            id: schema.terms.id,
            name: schema.terms.name,
            type: schema.terms.type,
            academicYearId: schema.terms.academicYearId,
        })
        .from(schema.terms)
        .where(eq(schema.terms.tenantId, tenantId))
        .orderBy(asc(schema.terms.startDate));
}

// ─── Subjects list (for dropdowns) ────────────────────────
export async function getSubjects() {
    const { tenantId } = await requireAuth();

    return db
        .select({
            id: schema.subjects.id,
            name: schema.subjects.name,
            code: schema.subjects.code,
        })
        .from(schema.subjects)
        .where(eq(schema.subjects.tenantId, tenantId))
        .orderBy(asc(schema.subjects.name));
}
