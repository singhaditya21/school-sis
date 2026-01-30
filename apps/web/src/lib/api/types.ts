/**
 * TypeScript types matching Java API DTOs.
 */

// Common types
export type UUID = string;

// Auth types
export interface LoginRequest {
    email: string;
    password: string;
    schoolCode?: string;
}

export interface LoginResponse {
    accessToken: string;
    refreshToken: string;
    userId: string;
    tenantId: string | null;
    role: string;
    email: string;
    name: string;
}

export interface User {
    id: UUID;
    email: string;
    name: string;
    role: UserRole;
    schoolId?: UUID;
}

export type UserRole =
    | 'SUPER_ADMIN'
    | 'SCHOOL_ADMIN'
    | 'PRINCIPAL'
    | 'TEACHER'
    | 'ACCOUNTANT'
    | 'ADMISSION_COUNSELOR'
    | 'PARENT'
    | 'STUDENT';

// Student types
export interface Student {
    id: UUID;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    fullName: string;
    dateOfBirth: string;
    gender: string;
    bloodGroup: string;
    classGroupId: UUID;
    active: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface CreateStudentRequest {
    admissionNumber: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    gender?: string;
    bloodGroup?: string;
    classGroupId?: UUID;
}

// Fee types
export interface FeeInvoice {
    id: UUID;
    invoiceNumber: string;
    studentId: UUID;
    totalAmount: number;
    paidAmount: number;
    dueDate: string;
    status: 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE';
    createdAt: string;
}

export interface Payment {
    id: UUID;
    invoiceId: UUID;
    amount: number;
    paymentMethod: string;
    paymentDate: string;
    receiptNumber: string;
}

// Attendance types
export interface AttendanceRecord {
    id: UUID;
    studentId: UUID;
    date: string;
    status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
    remarks?: string;
}

// Exam types
export interface Exam {
    id: UUID;
    name: string;
    termId: UUID;
    startDate: string;
    endDate: string;
    status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED';
}

export interface Mark {
    id: UUID;
    examId: UUID;
    studentId: UUID;
    subjectId: UUID;
    marksObtained: number;
    maxMarks: number;
    grade?: string;
}

// Admission types
export interface AdmissionLead {
    id: UUID;
    childName: string;
    parentName: string;
    parentPhone: string;
    parentEmail?: string;
    gradeId?: UUID;
    source?: string;
    status: 'NEW' | 'CONTACTED' | 'SCHEDULED' | 'VISITED' | 'APPLIED' | 'ENROLLED' | 'REJECTED';
    notes?: string;
    createdAt: string;
}

// Transport types
export interface Route {
    id: UUID;
    name: string;
    description?: string;
    vehicleId?: UUID;
    driverId?: UUID;
    active: boolean;
}

// Timetable types
export interface TimetableSlot {
    id: UUID;
    classGroupId: UUID;
    subjectId: UUID;
    teacherId: UUID;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
}

// Communication types
export interface MessageTemplate {
    id: UUID;
    name: string;
    channel: 'SMS' | 'WHATSAPP' | 'EMAIL';
    subject?: string;
    body: string;
    active: boolean;
}
