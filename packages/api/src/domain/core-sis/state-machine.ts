import type { DomainStateMachine, DomainTransition } from './types';

export class InvalidDomainTransitionError extends Error {
    constructor(machineId: string, from: string, to: string) {
        super(`Invalid ${machineId} transition: ${from} -> ${to}`);
        this.name = 'InvalidDomainTransitionError';
    }
}

function defineStateMachine<const State extends string>(machine: DomainStateMachine<State>): DomainStateMachine<State> {
    return machine;
}

const admissionLead = defineStateMachine({
    id: 'admissionLead',
    entity: 'admission_leads',
    states: ['NEW', 'CONTACTED', 'FORM_SUBMITTED', 'DOCUMENTS_PENDING', 'INTERVIEW_SCHEDULED', 'INTERVIEW_DONE', 'OFFERED', 'ACCEPTED', 'ENROLLED', 'REJECTED', 'WITHDRAWN'],
    initialStates: ['NEW'],
    terminalStates: ['ENROLLED', 'REJECTED', 'WITHDRAWN'],
    transitions: [
        { from: 'NEW', to: 'CONTACTED', action: 'contact', description: 'Lead has been contacted.', requiredPermission: 'admissions:update', auditAction: 'admissions.lead.contacted', emits: ['core_sis.admissions.lead_contacted.v1'] },
        { from: 'NEW', to: 'FORM_SUBMITTED', action: 'submit_form', description: 'Application form was submitted directly.', requiredPermission: 'admissions:update', auditAction: 'admissions.form.submitted', emits: ['core_sis.admissions.form_submitted.v1'] },
        { from: 'NEW', to: 'WITHDRAWN', action: 'withdraw', description: 'Family withdrew before engagement.', requiredPermission: 'admissions:update', auditAction: 'admissions.lead.withdrawn', emits: ['core_sis.admissions.lead_withdrawn.v1'], requiresReason: true },
        { from: 'CONTACTED', to: 'FORM_SUBMITTED', action: 'submit_form', description: 'Application form was submitted.', requiredPermission: 'admissions:update', auditAction: 'admissions.form.submitted', emits: ['core_sis.admissions.form_submitted.v1'] },
        { from: 'CONTACTED', to: 'INTERVIEW_SCHEDULED', action: 'schedule_interview', description: 'Interview was scheduled after contact.', requiredPermission: 'admissions:update', auditAction: 'admissions.interview.scheduled', emits: ['core_sis.admissions.interview_scheduled.v1'] },
        { from: 'CONTACTED', to: 'REJECTED', action: 'reject', description: 'Lead was rejected after contact.', requiredPermission: 'admissions:review', auditAction: 'admissions.lead.rejected', emits: ['core_sis.admissions.lead_rejected.v1'], requiresReason: true },
        { from: 'CONTACTED', to: 'WITHDRAWN', action: 'withdraw', description: 'Family withdrew after contact.', requiredPermission: 'admissions:update', auditAction: 'admissions.lead.withdrawn', emits: ['core_sis.admissions.lead_withdrawn.v1'], requiresReason: true },
        { from: 'FORM_SUBMITTED', to: 'DOCUMENTS_PENDING', action: 'request_documents', description: 'Required documents are missing or pending.', requiredPermission: 'admissions:update', auditAction: 'admissions.documents.requested', emits: ['core_sis.admissions.documents_requested.v1'] },
        { from: 'FORM_SUBMITTED', to: 'INTERVIEW_SCHEDULED', action: 'schedule_interview', description: 'Interview was scheduled after form review.', requiredPermission: 'admissions:update', auditAction: 'admissions.interview.scheduled', emits: ['core_sis.admissions.interview_scheduled.v1'] },
        { from: 'DOCUMENTS_PENDING', to: 'INTERVIEW_SCHEDULED', action: 'schedule_interview', description: 'Documents were accepted and interview was scheduled.', requiredPermission: 'admissions:update', auditAction: 'admissions.interview.scheduled', emits: ['core_sis.admissions.interview_scheduled.v1'] },
        { from: 'DOCUMENTS_PENDING', to: 'REJECTED', action: 'reject', description: 'Application was rejected due to document or eligibility review.', requiredPermission: 'admissions:review', auditAction: 'admissions.lead.rejected', emits: ['core_sis.admissions.lead_rejected.v1'], requiresReason: true },
        { from: 'DOCUMENTS_PENDING', to: 'WITHDRAWN', action: 'withdraw', description: 'Family withdrew while documents were pending.', requiredPermission: 'admissions:update', auditAction: 'admissions.lead.withdrawn', emits: ['core_sis.admissions.lead_withdrawn.v1'], requiresReason: true },
        { from: 'INTERVIEW_SCHEDULED', to: 'INTERVIEW_DONE', action: 'complete_interview', description: 'Interview was completed.', requiredPermission: 'admissions:update', auditAction: 'admissions.interview.completed', emits: ['core_sis.admissions.interview_completed.v1'] },
        { from: 'INTERVIEW_SCHEDULED', to: 'WITHDRAWN', action: 'withdraw', description: 'Family withdrew before interview completion.', requiredPermission: 'admissions:update', auditAction: 'admissions.lead.withdrawn', emits: ['core_sis.admissions.lead_withdrawn.v1'], requiresReason: true },
        { from: 'INTERVIEW_DONE', to: 'OFFERED', action: 'offer_seat', description: 'Seat was offered.', requiredPermission: 'admissions:review', auditAction: 'admissions.offer.created', emits: ['core_sis.admissions.offer_created.v1'] },
        { from: 'INTERVIEW_DONE', to: 'REJECTED', action: 'reject', description: 'Application was rejected after interview.', requiredPermission: 'admissions:review', auditAction: 'admissions.lead.rejected', emits: ['core_sis.admissions.lead_rejected.v1'], requiresReason: true },
        { from: 'OFFERED', to: 'ACCEPTED', action: 'accept_offer', description: 'Family accepted the admission offer.', requiredPermission: 'admissions:update', auditAction: 'admissions.offer.accepted', emits: ['core_sis.admissions.offer_accepted.v1'] },
        { from: 'OFFERED', to: 'REJECTED', action: 'reject', description: 'Offer was rescinded or rejected.', requiredPermission: 'admissions:review', auditAction: 'admissions.lead.rejected', emits: ['core_sis.admissions.lead_rejected.v1'], requiresReason: true },
        { from: 'OFFERED', to: 'WITHDRAWN', action: 'withdraw', description: 'Family withdrew after offer.', requiredPermission: 'admissions:update', auditAction: 'admissions.lead.withdrawn', emits: ['core_sis.admissions.lead_withdrawn.v1'], requiresReason: true },
        { from: 'ACCEPTED', to: 'ENROLLED', action: 'enroll_student', description: 'Accepted applicant was converted into an enrolled student.', requiredPermission: 'students:create', auditAction: 'admissions.student.enrolled', emits: ['core_sis.enrollment.student_enrolled.v1'] },
        { from: 'ACCEPTED', to: 'WITHDRAWN', action: 'withdraw', description: 'Family withdrew after accepting.', requiredPermission: 'admissions:update', auditAction: 'admissions.lead.withdrawn', emits: ['core_sis.admissions.lead_withdrawn.v1'], requiresReason: true },
    ],
});

const studentEnrollment = defineStateMachine({
    id: 'studentEnrollment',
    entity: 'students',
    states: ['ACTIVE', 'INACTIVE', 'ALUMNI', 'TRANSFERRED', 'SUSPENDED'],
    initialStates: ['ACTIVE'],
    terminalStates: ['ALUMNI', 'TRANSFERRED'],
    transitions: [
        { from: 'ACTIVE', to: 'SUSPENDED', action: 'suspend', description: 'Student is temporarily suspended.', requiredPermission: 'students:update', auditAction: 'students.suspended', emits: ['core_sis.enrollment.student_suspended.v1'], requiresReason: true },
        { from: 'ACTIVE', to: 'INACTIVE', action: 'deactivate', description: 'Student is made inactive without transfer or graduation.', requiredPermission: 'students:update', auditAction: 'students.inactive', emits: ['core_sis.enrollment.student_inactivated.v1'], requiresReason: true },
        { from: 'ACTIVE', to: 'TRANSFERRED', action: 'transfer_out', description: 'Student transferred out of the school.', requiredPermission: 'students:update', auditAction: 'students.transferred', emits: ['core_sis.enrollment.student_transferred.v1'], requiresReason: true },
        { from: 'ACTIVE', to: 'ALUMNI', action: 'graduate', description: 'Student graduated and became alumni.', requiredPermission: 'students:update', auditAction: 'students.graduated', emits: ['core_sis.enrollment.student_graduated.v1'] },
        { from: 'SUSPENDED', to: 'ACTIVE', action: 'reinstate', description: 'Suspended student is reinstated.', requiredPermission: 'students:update', auditAction: 'students.reinstated', emits: ['core_sis.enrollment.student_reinstated.v1'] },
        { from: 'SUSPENDED', to: 'TRANSFERRED', action: 'transfer_out', description: 'Suspended student transferred out.', requiredPermission: 'students:update', auditAction: 'students.transferred', emits: ['core_sis.enrollment.student_transferred.v1'], requiresReason: true },
        { from: 'INACTIVE', to: 'ACTIVE', action: 'reactivate', description: 'Inactive student is reactivated.', requiredPermission: 'students:update', auditAction: 'students.reactivated', emits: ['core_sis.enrollment.student_reactivated.v1'] },
        { from: 'INACTIVE', to: 'TRANSFERRED', action: 'transfer_out', description: 'Inactive student was marked as transferred.', requiredPermission: 'students:update', auditAction: 'students.transferred', emits: ['core_sis.enrollment.student_transferred.v1'], requiresReason: true },
    ],
});

const attendanceRecord = defineStateMachine({
    id: 'attendanceRecord',
    entity: 'attendance_records',
    states: ['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'EXCUSED', 'HOLIDAY'],
    initialStates: ['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'EXCUSED', 'HOLIDAY'],
    terminalStates: [],
    transitions: [
        { from: 'PRESENT', to: 'ABSENT', action: 'correct_status', description: 'Correct attendance from present to absent.', requiredPermission: 'attendance:update', auditAction: 'attendance.corrected', emits: ['core_sis.attendance.record_corrected.v1'], requiresReason: true },
        { from: 'PRESENT', to: 'LATE', action: 'correct_status', description: 'Correct attendance from present to late.', requiredPermission: 'attendance:update', auditAction: 'attendance.corrected', emits: ['core_sis.attendance.record_corrected.v1'], requiresReason: true },
        { from: 'PRESENT', to: 'HALF_DAY', action: 'correct_status', description: 'Correct attendance from present to half day.', requiredPermission: 'attendance:update', auditAction: 'attendance.corrected', emits: ['core_sis.attendance.record_corrected.v1'], requiresReason: true },
        { from: 'PRESENT', to: 'EXCUSED', action: 'correct_status', description: 'Correct attendance from present to excused.', requiredPermission: 'attendance:update', auditAction: 'attendance.corrected', emits: ['core_sis.attendance.record_corrected.v1'], requiresReason: true },
        { from: 'ABSENT', to: 'PRESENT', action: 'correct_status', description: 'Correct attendance from absent to present.', requiredPermission: 'attendance:update', auditAction: 'attendance.corrected', emits: ['core_sis.attendance.record_corrected.v1'], requiresReason: true },
        { from: 'ABSENT', to: 'LATE', action: 'correct_status', description: 'Correct attendance from absent to late.', requiredPermission: 'attendance:update', auditAction: 'attendance.corrected', emits: ['core_sis.attendance.record_corrected.v1'], requiresReason: true },
        { from: 'ABSENT', to: 'HALF_DAY', action: 'correct_status', description: 'Correct attendance from absent to half day.', requiredPermission: 'attendance:update', auditAction: 'attendance.corrected', emits: ['core_sis.attendance.record_corrected.v1'], requiresReason: true },
        { from: 'ABSENT', to: 'EXCUSED', action: 'correct_status', description: 'Correct attendance from absent to excused.', requiredPermission: 'attendance:update', auditAction: 'attendance.corrected', emits: ['core_sis.attendance.record_corrected.v1'], requiresReason: true },
        { from: 'LATE', to: 'PRESENT', action: 'correct_status', description: 'Correct attendance from late to present.', requiredPermission: 'attendance:update', auditAction: 'attendance.corrected', emits: ['core_sis.attendance.record_corrected.v1'], requiresReason: true },
        { from: 'LATE', to: 'ABSENT', action: 'correct_status', description: 'Correct attendance from late to absent.', requiredPermission: 'attendance:update', auditAction: 'attendance.corrected', emits: ['core_sis.attendance.record_corrected.v1'], requiresReason: true },
        { from: 'HALF_DAY', to: 'PRESENT', action: 'correct_status', description: 'Correct attendance from half day to present.', requiredPermission: 'attendance:update', auditAction: 'attendance.corrected', emits: ['core_sis.attendance.record_corrected.v1'], requiresReason: true },
        { from: 'HALF_DAY', to: 'ABSENT', action: 'correct_status', description: 'Correct attendance from half day to absent.', requiredPermission: 'attendance:update', auditAction: 'attendance.corrected', emits: ['core_sis.attendance.record_corrected.v1'], requiresReason: true },
        { from: 'EXCUSED', to: 'PRESENT', action: 'correct_status', description: 'Correct attendance from excused to present.', requiredPermission: 'attendance:update', auditAction: 'attendance.corrected', emits: ['core_sis.attendance.record_corrected.v1'], requiresReason: true },
        { from: 'EXCUSED', to: 'ABSENT', action: 'correct_status', description: 'Correct attendance from excused to absent.', requiredPermission: 'attendance:update', auditAction: 'attendance.corrected', emits: ['core_sis.attendance.record_corrected.v1'], requiresReason: true },
        { from: 'HOLIDAY', to: 'PRESENT', action: 'correct_status', description: 'Correct holiday to a normal present day.', requiredPermission: 'attendance:update', auditAction: 'attendance.corrected', emits: ['core_sis.attendance.record_corrected.v1'], requiresReason: true },
        { from: 'HOLIDAY', to: 'ABSENT', action: 'correct_status', description: 'Correct holiday to a normal absent day.', requiredPermission: 'attendance:update', auditAction: 'attendance.corrected', emits: ['core_sis.attendance.record_corrected.v1'], requiresReason: true },
    ],
});

const examLifecycle = defineStateMachine({
    id: 'examLifecycle',
    entity: 'exams',
    states: ['DRAFT', 'SCHEDULED', 'MARKS_ENTRY', 'RESULT_REVIEW', 'PUBLISHED', 'ARCHIVED', 'CANCELLED'],
    initialStates: ['DRAFT'],
    terminalStates: ['ARCHIVED', 'CANCELLED'],
    transitions: [
        { from: 'DRAFT', to: 'SCHEDULED', action: 'schedule', description: 'Exam timetable is scheduled.', requiredPermission: 'exams:update', auditAction: 'exams.scheduled', emits: ['core_sis.exams.exam_scheduled.v1'] },
        { from: 'DRAFT', to: 'CANCELLED', action: 'cancel', description: 'Draft exam is cancelled.', requiredPermission: 'exams:update', auditAction: 'exams.cancelled', emits: ['core_sis.exams.exam_cancelled.v1'], requiresReason: true },
        { from: 'SCHEDULED', to: 'MARKS_ENTRY', action: 'open_marks_entry', description: 'Marks entry is opened.', requiredPermission: 'exams:update', auditAction: 'exams.marks_entry.opened', emits: ['core_sis.exams.marks_entry_opened.v1'] },
        { from: 'SCHEDULED', to: 'CANCELLED', action: 'cancel', description: 'Scheduled exam is cancelled.', requiredPermission: 'exams:update', auditAction: 'exams.cancelled', emits: ['core_sis.exams.exam_cancelled.v1'], requiresReason: true },
        { from: 'MARKS_ENTRY', to: 'RESULT_REVIEW', action: 'submit_for_review', description: 'Marks are submitted for review.', requiredPermission: 'exams:update', auditAction: 'exams.results.submitted', emits: ['core_sis.exams.results_submitted.v1'] },
        { from: 'RESULT_REVIEW', to: 'MARKS_ENTRY', action: 'reopen_marks_entry', description: 'Review rejected results and reopened marks entry.', requiredPermission: 'exams:review', auditAction: 'exams.results.reopened', emits: ['core_sis.exams.results_reopened.v1'], requiresReason: true },
        { from: 'RESULT_REVIEW', to: 'PUBLISHED', action: 'publish_results', description: 'Reviewed results are published.', requiredPermission: 'exams:publish', auditAction: 'exams.results.published', emits: ['core_sis.exams.results_published.v1'] },
        { from: 'PUBLISHED', to: 'ARCHIVED', action: 'archive', description: 'Published exam is archived.', requiredPermission: 'exams:update', auditAction: 'exams.archived', emits: ['core_sis.exams.exam_archived.v1'] },
    ],
});

const invoiceLifecycle = defineStateMachine({
    id: 'invoiceLifecycle',
    entity: 'invoices',
    states: ['DRAFT', 'PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED', 'WAIVED'],
    initialStates: ['DRAFT', 'PENDING'],
    terminalStates: ['PAID', 'CANCELLED', 'WAIVED'],
    transitions: [
        { from: 'DRAFT', to: 'PENDING', action: 'issue', description: 'Draft invoice is issued to the payer.', requiredPermission: 'fees:update', auditAction: 'fees.invoice.issued', emits: ['core_sis.fees.invoice_issued.v1'] },
        { from: 'DRAFT', to: 'CANCELLED', action: 'cancel', description: 'Draft invoice is cancelled.', requiredPermission: 'fees:update', auditAction: 'fees.invoice.cancelled', emits: ['core_sis.fees.invoice_cancelled.v1'], requiresReason: true },
        { from: 'PENDING', to: 'PARTIAL', action: 'record_partial_payment', description: 'Partial payment received.', requiredPermission: 'fees:update', auditAction: 'fees.invoice.partially_paid', emits: ['core_sis.fees.invoice_partially_paid.v1'] },
        { from: 'PENDING', to: 'PAID', action: 'record_full_payment', description: 'Invoice fully paid.', requiredPermission: 'fees:update', auditAction: 'fees.invoice.paid', emits: ['core_sis.fees.invoice_paid.v1'] },
        { from: 'PENDING', to: 'OVERDUE', action: 'mark_overdue', description: 'Invoice crossed due date.', requiredPermission: 'fees:update', auditAction: 'fees.invoice.overdue', emits: ['core_sis.fees.invoice_overdue.v1'] },
        { from: 'PENDING', to: 'CANCELLED', action: 'cancel', description: 'Pending invoice cancelled.', requiredPermission: 'fees:update', auditAction: 'fees.invoice.cancelled', emits: ['core_sis.fees.invoice_cancelled.v1'], requiresReason: true },
        { from: 'PENDING', to: 'WAIVED', action: 'waive', description: 'Pending invoice waived.', requiredPermission: 'fees:approve', auditAction: 'fees.invoice.waived', emits: ['core_sis.fees.invoice_waived.v1'], requiresReason: true },
        { from: 'PARTIAL', to: 'PAID', action: 'record_full_payment', description: 'Remaining balance paid.', requiredPermission: 'fees:update', auditAction: 'fees.invoice.paid', emits: ['core_sis.fees.invoice_paid.v1'] },
        { from: 'PARTIAL', to: 'OVERDUE', action: 'mark_overdue', description: 'Partially paid invoice crossed due date.', requiredPermission: 'fees:update', auditAction: 'fees.invoice.overdue', emits: ['core_sis.fees.invoice_overdue.v1'] },
        { from: 'PARTIAL', to: 'WAIVED', action: 'waive_balance', description: 'Remaining balance waived.', requiredPermission: 'fees:approve', auditAction: 'fees.invoice.waived', emits: ['core_sis.fees.invoice_waived.v1'], requiresReason: true },
        { from: 'OVERDUE', to: 'PARTIAL', action: 'record_partial_payment', description: 'Partial payment received on overdue invoice.', requiredPermission: 'fees:update', auditAction: 'fees.invoice.partially_paid', emits: ['core_sis.fees.invoice_partially_paid.v1'] },
        { from: 'OVERDUE', to: 'PAID', action: 'record_full_payment', description: 'Overdue invoice fully paid.', requiredPermission: 'fees:update', auditAction: 'fees.invoice.paid', emits: ['core_sis.fees.invoice_paid.v1'] },
        { from: 'OVERDUE', to: 'WAIVED', action: 'waive', description: 'Overdue invoice waived.', requiredPermission: 'fees:approve', auditAction: 'fees.invoice.waived', emits: ['core_sis.fees.invoice_waived.v1'], requiresReason: true },
    ],
});

const libraryIssue = defineStateMachine({
    id: 'libraryIssue',
    entity: 'book_issues',
    states: ['ISSUED', 'RETURNED', 'OVERDUE', 'LOST'],
    initialStates: ['ISSUED'],
    terminalStates: ['RETURNED'],
    transitions: [
        { from: 'ISSUED', to: 'RETURNED', action: 'return_book', description: 'Book was returned on time.', requiredPermission: 'library:update', auditAction: 'library.issue.returned', emits: ['core_sis.library.book_returned.v1'] },
        { from: 'ISSUED', to: 'OVERDUE', action: 'mark_overdue', description: 'Issued book became overdue.', requiredPermission: 'library:update', auditAction: 'library.issue.overdue', emits: ['core_sis.library.book_overdue.v1'] },
        { from: 'ISSUED', to: 'LOST', action: 'mark_lost', description: 'Issued book was reported lost.', requiredPermission: 'library:update', auditAction: 'library.issue.lost', emits: ['core_sis.library.book_lost.v1'], requiresReason: true },
        { from: 'OVERDUE', to: 'RETURNED', action: 'return_book', description: 'Overdue book was returned.', requiredPermission: 'library:update', auditAction: 'library.issue.returned', emits: ['core_sis.library.book_returned.v1'] },
        { from: 'OVERDUE', to: 'LOST', action: 'mark_lost', description: 'Overdue book was reported lost.', requiredPermission: 'library:update', auditAction: 'library.issue.lost', emits: ['core_sis.library.book_lost.v1'], requiresReason: true },
        { from: 'LOST', to: 'RETURNED', action: 'mark_found_returned', description: 'Lost book was found and returned.', requiredPermission: 'library:update', auditAction: 'library.issue.returned', emits: ['core_sis.library.book_returned.v1'] },
    ],
});

const hostelAllocation = defineStateMachine({
    id: 'hostelAllocation',
    entity: 'hostel_allocations',
    states: ['PENDING', 'ACTIVE', 'VACATED'],
    initialStates: ['PENDING'],
    terminalStates: ['VACATED'],
    transitions: [
        { from: 'PENDING', to: 'ACTIVE', action: 'activate', description: 'Allocation is confirmed and active.', requiredPermission: 'hostel:update', auditAction: 'hostel.allocation.activated', emits: ['core_sis.hostel.allocation_activated.v1'] },
        { from: 'PENDING', to: 'VACATED', action: 'cancel', description: 'Pending allocation was cancelled.', requiredPermission: 'hostel:update', auditAction: 'hostel.allocation.vacated', emits: ['core_sis.hostel.allocation_vacated.v1'], requiresReason: true },
        { from: 'ACTIVE', to: 'VACATED', action: 'vacate', description: 'Student vacated the hostel allocation.', requiredPermission: 'hostel:update', auditAction: 'hostel.allocation.vacated', emits: ['core_sis.hostel.allocation_vacated.v1'], requiresReason: true },
    ],
});

const leaveRequest = defineStateMachine({
    id: 'leaveRequest',
    entity: 'leave_requests',
    states: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'],
    initialStates: ['PENDING'],
    terminalStates: ['APPROVED', 'REJECTED', 'CANCELLED'],
    transitions: [
        { from: 'PENDING', to: 'APPROVED', action: 'approve', description: 'Leave request approved.', requiredPermission: 'hr:approve', auditAction: 'hr.leave.approved', emits: ['core_sis.hr.leave_approved.v1'] },
        { from: 'PENDING', to: 'REJECTED', action: 'reject', description: 'Leave request rejected.', requiredPermission: 'hr:approve', auditAction: 'hr.leave.rejected', emits: ['core_sis.hr.leave_rejected.v1'], requiresReason: true },
        { from: 'PENDING', to: 'CANCELLED', action: 'cancel', description: 'Leave request cancelled by staff or HR.', requiredPermission: 'hr:update', auditAction: 'hr.leave.cancelled', emits: ['core_sis.hr.leave_cancelled.v1'], requiresReason: true },
    ],
});

const substitutionRequest = defineStateMachine({
    id: 'substitutionRequest',
    entity: 'substitution_requests',
    states: ['pending', 'approved', 'rejected', 'cancelled'],
    initialStates: ['pending'],
    terminalStates: ['approved', 'rejected', 'cancelled'],
    transitions: [
        { from: 'pending', to: 'approved', action: 'approve', description: 'Substitution request approved.', requiredPermission: 'timetable:approve', auditAction: 'timetable.substitution.approved', emits: ['core_sis.timetable.substitution_approved.v1'] },
        { from: 'pending', to: 'rejected', action: 'reject', description: 'Substitution request rejected.', requiredPermission: 'timetable:approve', auditAction: 'timetable.substitution.rejected', emits: ['core_sis.timetable.substitution_rejected.v1'], requiresReason: true },
        { from: 'pending', to: 'cancelled', action: 'cancel', description: 'Substitution request cancelled.', requiredPermission: 'timetable:update', auditAction: 'timetable.substitution.cancelled', emits: ['core_sis.timetable.substitution_cancelled.v1'], requiresReason: true },
    ],
});

export const CORE_SIS_STATE_MACHINES = {
    admissionLead,
    studentEnrollment,
    attendanceRecord,
    examLifecycle,
    invoiceLifecycle,
    libraryIssue,
    hostelAllocation,
    leaveRequest,
    substitutionRequest,
} as const;

export type CoreSisStateMachineId = keyof typeof CORE_SIS_STATE_MACHINES;

export function getStateMachine(machineId: CoreSisStateMachineId): DomainStateMachine {
    return CORE_SIS_STATE_MACHINES[machineId];
}

export function getAllowedTransitions(machineId: CoreSisStateMachineId, from: string): readonly DomainTransition[] {
    return getStateMachine(machineId).transitions.filter((transition) => transition.from === from);
}

export function canTransition(machineId: CoreSisStateMachineId, from: string, to: string): boolean {
    return getAllowedTransitions(machineId, from).some((transition) => transition.to === to);
}

export function assertDomainTransition(machineId: CoreSisStateMachineId, from: string, to: string): DomainTransition {
    const transition = getAllowedTransitions(machineId, from).find((candidate) => candidate.to === to);
    if (!transition) {
        throw new InvalidDomainTransitionError(machineId, from, to);
    }
    return transition;
}

export function isTerminalState(machineId: CoreSisStateMachineId, state: string): boolean {
    return getStateMachine(machineId).terminalStates.includes(state);
}
