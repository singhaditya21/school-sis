import type { CoreSisModuleId } from './types';

export type CoreSisDomainEventName = `core_sis.${CoreSisModuleId}.${string}.v1`;

export type CoreSisDomainEventDefinition = {
    name: CoreSisDomainEventName;
    moduleId: CoreSisModuleId;
    description: string;
    pii: boolean;
};

export const CORE_SIS_DOMAIN_EVENTS = {
    admissions: [
        { name: 'core_sis.admissions.lead_contacted.v1', moduleId: 'admissions', description: 'Admission lead was contacted.', pii: true },
        { name: 'core_sis.admissions.form_submitted.v1', moduleId: 'admissions', description: 'Admission form was submitted.', pii: true },
        { name: 'core_sis.admissions.documents_requested.v1', moduleId: 'admissions', description: 'Admission documents were requested.', pii: true },
        { name: 'core_sis.admissions.interview_scheduled.v1', moduleId: 'admissions', description: 'Admission interview was scheduled.', pii: true },
        { name: 'core_sis.admissions.interview_completed.v1', moduleId: 'admissions', description: 'Admission interview was completed.', pii: true },
        { name: 'core_sis.admissions.offer_created.v1', moduleId: 'admissions', description: 'Admission offer was created.', pii: true },
        { name: 'core_sis.admissions.offer_accepted.v1', moduleId: 'admissions', description: 'Admission offer was accepted.', pii: true },
        { name: 'core_sis.admissions.lead_rejected.v1', moduleId: 'admissions', description: 'Admission lead or application was rejected.', pii: true },
        { name: 'core_sis.admissions.lead_withdrawn.v1', moduleId: 'admissions', description: 'Admission lead or application was withdrawn.', pii: true },
    ],
    enrollment: [
        { name: 'core_sis.enrollment.student_enrolled.v1', moduleId: 'enrollment', description: 'Applicant was converted to student.', pii: true },
        { name: 'core_sis.enrollment.student_suspended.v1', moduleId: 'enrollment', description: 'Student was suspended.', pii: true },
        { name: 'core_sis.enrollment.student_inactivated.v1', moduleId: 'enrollment', description: 'Student was marked inactive.', pii: true },
        { name: 'core_sis.enrollment.student_transferred.v1', moduleId: 'enrollment', description: 'Student was transferred out.', pii: true },
        { name: 'core_sis.enrollment.student_graduated.v1', moduleId: 'enrollment', description: 'Student graduated to alumni.', pii: true },
        { name: 'core_sis.enrollment.student_reinstated.v1', moduleId: 'enrollment', description: 'Suspended student was reinstated.', pii: true },
        { name: 'core_sis.enrollment.student_reactivated.v1', moduleId: 'enrollment', description: 'Inactive student was reactivated.', pii: true },
    ],
    attendance: [
        { name: 'core_sis.attendance.record_marked.v1', moduleId: 'attendance', description: 'Attendance record was marked.', pii: true },
        { name: 'core_sis.attendance.record_corrected.v1', moduleId: 'attendance', description: 'Attendance record was corrected.', pii: true },
        { name: 'core_sis.attendance.day_locked.v1', moduleId: 'attendance', description: 'Attendance day was locked for section.', pii: false },
    ],
    timetable: [
        { name: 'core_sis.timetable.entry_created.v1', moduleId: 'timetable', description: 'Timetable entry was created.', pii: false },
        { name: 'core_sis.timetable.conflict_detected.v1', moduleId: 'timetable', description: 'Timetable conflict was detected.', pii: false },
        { name: 'core_sis.timetable.substitution_approved.v1', moduleId: 'timetable', description: 'Substitution request was approved.', pii: true },
        { name: 'core_sis.timetable.substitution_rejected.v1', moduleId: 'timetable', description: 'Substitution request was rejected.', pii: true },
        { name: 'core_sis.timetable.substitution_cancelled.v1', moduleId: 'timetable', description: 'Substitution request was cancelled.', pii: true },
    ],
    exams: [
        { name: 'core_sis.exams.exam_scheduled.v1', moduleId: 'exams', description: 'Exam was scheduled.', pii: false },
        { name: 'core_sis.exams.exam_cancelled.v1', moduleId: 'exams', description: 'Exam was cancelled.', pii: false },
        { name: 'core_sis.exams.marks_entry_opened.v1', moduleId: 'exams', description: 'Marks entry was opened.', pii: false },
        { name: 'core_sis.exams.results_submitted.v1', moduleId: 'exams', description: 'Results were submitted for review.', pii: true },
        { name: 'core_sis.exams.results_reopened.v1', moduleId: 'exams', description: 'Results were reopened for correction.', pii: true },
        { name: 'core_sis.exams.results_published.v1', moduleId: 'exams', description: 'Results were published.', pii: true },
        { name: 'core_sis.exams.exam_archived.v1', moduleId: 'exams', description: 'Exam was archived.', pii: false },
    ],
    gradebook: [
        { name: 'core_sis.gradebook.assessment_created.v1', moduleId: 'gradebook', description: 'Gradebook assessment was created.', pii: false },
        { name: 'core_sis.gradebook.score_recorded.v1', moduleId: 'gradebook', description: 'Gradebook score was recorded.', pii: true },
        { name: 'core_sis.gradebook.report_card_generated.v1', moduleId: 'gradebook', description: 'Report card was generated.', pii: true },
    ],
    fees: [
        { name: 'core_sis.fees.invoice_issued.v1', moduleId: 'fees', description: 'Fee invoice was issued.', pii: true },
        { name: 'core_sis.fees.invoice_partially_paid.v1', moduleId: 'fees', description: 'Invoice was partially paid.', pii: true },
        { name: 'core_sis.fees.invoice_paid.v1', moduleId: 'fees', description: 'Invoice was fully paid.', pii: true },
        { name: 'core_sis.fees.invoice_overdue.v1', moduleId: 'fees', description: 'Invoice became overdue.', pii: true },
        { name: 'core_sis.fees.invoice_cancelled.v1', moduleId: 'fees', description: 'Invoice was cancelled.', pii: true },
        { name: 'core_sis.fees.invoice_waived.v1', moduleId: 'fees', description: 'Invoice was waived.', pii: true },
    ],
    transport: [
        { name: 'core_sis.transport.route_assigned.v1', moduleId: 'transport', description: 'Student transport route was assigned.', pii: true },
        { name: 'core_sis.transport.route_changed.v1', moduleId: 'transport', description: 'Student transport route was changed.', pii: true },
        { name: 'core_sis.transport.vehicle_maintenance_due.v1', moduleId: 'transport', description: 'Vehicle maintenance is due.', pii: false },
    ],
    library: [
        { name: 'core_sis.library.book_issued.v1', moduleId: 'library', description: 'Book was issued.', pii: true },
        { name: 'core_sis.library.book_returned.v1', moduleId: 'library', description: 'Book was returned.', pii: true },
        { name: 'core_sis.library.book_overdue.v1', moduleId: 'library', description: 'Book became overdue.', pii: true },
        { name: 'core_sis.library.book_lost.v1', moduleId: 'library', description: 'Book was marked lost.', pii: true },
    ],
    hostel: [
        { name: 'core_sis.hostel.allocation_activated.v1', moduleId: 'hostel', description: 'Hostel allocation was activated.', pii: true },
        { name: 'core_sis.hostel.allocation_vacated.v1', moduleId: 'hostel', description: 'Hostel allocation was vacated.', pii: true },
        { name: 'core_sis.hostel.room_maintenance_started.v1', moduleId: 'hostel', description: 'Hostel room maintenance started.', pii: false },
    ],
    hr: [
        { name: 'core_sis.hr.staff_onboarded.v1', moduleId: 'hr', description: 'Staff profile was onboarded.', pii: true },
        { name: 'core_sis.hr.leave_approved.v1', moduleId: 'hr', description: 'Leave request was approved.', pii: true },
        { name: 'core_sis.hr.leave_rejected.v1', moduleId: 'hr', description: 'Leave request was rejected.', pii: true },
        { name: 'core_sis.hr.leave_cancelled.v1', moduleId: 'hr', description: 'Leave request was cancelled.', pii: true },
    ],
    communications: [
        { name: 'core_sis.communications.notice_published.v1', moduleId: 'communications', description: 'Notice was published.', pii: false },
        { name: 'core_sis.communications.message_delivered.v1', moduleId: 'communications', description: 'Message delivery was confirmed.', pii: true },
        { name: 'core_sis.communications.message_failed.v1', moduleId: 'communications', description: 'Message delivery failed.', pii: true },
    ],
} satisfies Record<CoreSisModuleId, readonly CoreSisDomainEventDefinition[]>;

export function getDomainEventsForModule(moduleId: CoreSisModuleId): readonly CoreSisDomainEventDefinition[] {
    return CORE_SIS_DOMAIN_EVENTS[moduleId];
}

export function parseCoreSisEventName(eventName: string): { moduleId: CoreSisModuleId; topic: string; version: 'v1' } | null {
    const [namespace, moduleId, topic, version, extra] = eventName.split('.');
    if (namespace !== 'core_sis' || !topic || version !== 'v1' || extra) {
        return null;
    }

    if (!Object.prototype.hasOwnProperty.call(CORE_SIS_DOMAIN_EVENTS, moduleId)) {
        return null;
    }

    return {
        moduleId: moduleId as CoreSisModuleId,
        topic,
        version,
    };
}

export function listCoreSisEventNames(): readonly CoreSisDomainEventName[] {
    return Object.values(CORE_SIS_DOMAIN_EVENTS).flat().map((event) => event.name);
}
