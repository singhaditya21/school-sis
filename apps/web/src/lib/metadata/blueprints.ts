/**
 * @module lib/metadata/blueprints
 *
 * Declarative Institution Blueprints ("Salesforce Education Cloud Packs") for:
 *   1. K-12 Schools (`K12_SCHOOL_CLOUD`)
 *   2. Colleges & Universities / Higher-Ed (`COLLEGE_HIGHER_ED_CLOUD`)
 *   3. Coaching & Test-Prep Institutes — JEE / NEET / UPSC (`COACHING_INSTITUTE_CLOUD`)
 *
 * Each blueprint provisions a cohesive set of metadata objects, typed fields
 * (including `LOOKUP`, `FORMULA`, and `ROLLUP_SUMMARY` fields), default FORM and
 * LIST/KANBAN layouts, and starter automation workflows in a single idempotent
 * installation step.
 */

import type { MetadataDataType, MetadataValidationRules } from './platform';

export type EducationBlueprintId =
    | 'K12_SCHOOL_CLOUD'
    | 'COLLEGE_HIGHER_ED_CLOUD'
    | 'COACHING_INSTITUTE_CLOUD';

export interface BlueprintFieldSpec {
    label: string;
    apiName: string;
    dataType: MetadataDataType;
    isRequired?: boolean;
    picklistOptions?: string[];
    validationRules?: MetadataValidationRules;
}

export interface BlueprintObjectSpec {
    name: string;
    apiName: string;
    description: string;
    fields: BlueprintFieldSpec[];
    kanbanGroupByField?: string;
    defaultViewMode?: 'TABLE' | 'KANBAN';
    formSections: {
        title: string;
        columns: 1 | 2;
        fields: string[];
    }[];
}

export interface BlueprintWorkflowSpec {
    name: string;
    objectName: string;
    triggerEvent: 'object.record.upserted' | 'object.record.deleted';
    conditions: { field: string; operator: string; value: string }[];
    actionType: 'UPDATE_FIELD' | 'CREATE_TASK' | 'SEND_EMAIL' | 'WEBHOOK';
    actionPayload: Record<string, unknown>;
}

export interface EducationBlueprintPack {
    id: EducationBlueprintId;
    title: string;
    institutionType: 'K-12 School' | 'College / University' | 'Coaching / Test-Prep Institute';
    tagline: string;
    highlights: string[];
    objects: BlueprintObjectSpec[];
    workflows: BlueprintWorkflowSpec[];
}

export const EDUCATION_BLUEPRINT_PACKS: EducationBlueprintPack[] = [
    {
        id: 'K12_SCHOOL_CLOUD',
        title: 'K-12 School Cloud Pack',
        institutionType: 'K-12 School',
        tagline:
            'Student transport routing, behavioral counseling & discipline tracking, and RTE/merit scholarship grant management.',
        highlights: [
            'Transport Allocation with Student Lookup & Net Fee Formula',
            'Discipline & Counseling Incident Kanban Board',
            'Scholarship Grant Workflow with Approval Stages',
        ],
        objects: [
            {
                name: 'Transport Allocation',
                apiName: 'transport_allocation',
                description:
                    'Student bus route assignments, boarding stops, and net transport fee calculation.',
                kanbanGroupByField: 'status',
                defaultViewMode: 'KANBAN',
                fields: [
                    {
                        label: 'Student',
                        apiName: 'student_id',
                        dataType: 'TEXT',
                        isRequired: true,
                        validationRules: {
                            fieldSubType: 'LOOKUP',
                            lookupTargetObject: 'student',
                        },
                    },
                    {
                        label: 'Route Name',
                        apiName: 'route_name',
                        dataType: 'TEXT',
                        isRequired: true,
                    },
                    {
                        label: 'Boarding Stop',
                        apiName: 'stop_name',
                        dataType: 'TEXT',
                        isRequired: true,
                    },
                    {
                        label: 'Monthly Transport Fee',
                        apiName: 'monthly_transport_fee',
                        dataType: 'CURRENCY',
                        isRequired: true,
                        validationRules: { min: 0 },
                    },
                    {
                        label: 'Sibling Concession',
                        apiName: 'concession_amount',
                        dataType: 'CURRENCY',
                        validationRules: { min: 0 },
                    },
                    {
                        label: 'Net Transport Fee',
                        apiName: 'net_transport_fee',
                        dataType: 'NUMBER',
                        validationRules: {
                            fieldSubType: 'FORMULA',
                            formulaExpression: '{monthly_transport_fee} - {concession_amount}',
                        },
                    },
                    {
                        label: 'Status',
                        apiName: 'status',
                        dataType: 'PICKLIST',
                        isRequired: true,
                        picklistOptions: ['ACTIVE', 'PAUSED', 'WAITLISTED', 'CANCELLED'],
                    },
                ],
                formSections: [
                    {
                        title: 'Student & Route Assignment',
                        columns: 2,
                        fields: ['student_id', 'status', 'route_name', 'stop_name'],
                    },
                    {
                        title: 'Transport Fee & Concession',
                        columns: 2,
                        fields: ['monthly_transport_fee', 'concession_amount', 'net_transport_fee'],
                    },
                ],
            },
            {
                name: 'Discipline Incident',
                apiName: 'discipline_incident',
                description:
                    'Student behavioral & pastoral care incident log with counselor workflow stages.',
                kanbanGroupByField: 'resolution_status',
                defaultViewMode: 'KANBAN',
                fields: [
                    {
                        label: 'Student',
                        apiName: 'student_id',
                        dataType: 'TEXT',
                        isRequired: true,
                        validationRules: {
                            fieldSubType: 'LOOKUP',
                            lookupTargetObject: 'student',
                        },
                    },
                    {
                        label: 'Incident Date',
                        apiName: 'incident_date',
                        dataType: 'DATE',
                        isRequired: true,
                    },
                    {
                        label: 'Category',
                        apiName: 'category',
                        dataType: 'PICKLIST',
                        isRequired: true,
                        picklistOptions: [
                            'BEHAVIORAL',
                            'ATTENDANCE',
                            'ACADEMIC_INTEGRITY',
                            'SAFETY_BULLYING',
                        ],
                    },
                    {
                        label: 'Severity',
                        apiName: 'severity',
                        dataType: 'PICKLIST',
                        isRequired: true,
                        picklistOptions: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
                    },
                    {
                        label: 'Resolution Stage',
                        apiName: 'resolution_status',
                        dataType: 'PICKLIST',
                        isRequired: true,
                        picklistOptions: [
                            'OPEN',
                            'COUNSELOR_REVIEW',
                            'PARENT_MEETING',
                            'RESOLVED',
                        ],
                    },
                    {
                        label: 'Counselor Notes',
                        apiName: 'counselor_notes',
                        dataType: 'TEXT',
                    },
                ],
                formSections: [
                    {
                        title: 'Incident Classification',
                        columns: 2,
                        fields: ['student_id', 'incident_date', 'category', 'severity'],
                    },
                    {
                        title: 'Counseling & Resolution',
                        columns: 1,
                        fields: ['resolution_status', 'counselor_notes'],
                    },
                ],
            },
            {
                name: 'Scholarship Grant',
                apiName: 'scholarship_grant',
                description:
                    'Merit, sports, and RTE scholarship awards with automatic net payable fee calculation.',
                kanbanGroupByField: 'approval_status',
                defaultViewMode: 'KANBAN',
                fields: [
                    {
                        label: 'Student',
                        apiName: 'student_id',
                        dataType: 'TEXT',
                        isRequired: true,
                        validationRules: {
                            fieldSubType: 'LOOKUP',
                            lookupTargetObject: 'student',
                        },
                    },
                    {
                        label: 'Scholarship Scheme',
                        apiName: 'scheme_name',
                        dataType: 'TEXT',
                        isRequired: true,
                    },
                    {
                        label: 'Annual Tuition Fee',
                        apiName: 'annual_tuition_fee',
                        dataType: 'CURRENCY',
                        isRequired: true,
                        validationRules: { min: 0 },
                    },
                    {
                        label: 'Grant Amount',
                        apiName: 'grant_amount',
                        dataType: 'CURRENCY',
                        isRequired: true,
                        validationRules: { min: 0 },
                    },
                    {
                        label: 'Net Payable Fee',
                        apiName: 'net_payable_fee',
                        dataType: 'NUMBER',
                        validationRules: {
                            fieldSubType: 'FORMULA',
                            formulaExpression: '{annual_tuition_fee} - {grant_amount}',
                        },
                    },
                    {
                        label: 'Approval Stage',
                        apiName: 'approval_status',
                        dataType: 'PICKLIST',
                        isRequired: true,
                        picklistOptions: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'],
                    },
                ],
                formSections: [
                    {
                        title: 'Award Details',
                        columns: 2,
                        fields: ['student_id', 'scheme_name', 'approval_status'],
                    },
                    {
                        title: 'Financial Computation',
                        columns: 2,
                        fields: ['annual_tuition_fee', 'grant_amount', 'net_payable_fee'],
                    },
                ],
            },
        ],
        workflows: [
            {
                name: 'Critical Incident Parent Meeting Task',
                objectName: 'discipline_incident',
                triggerEvent: 'object.record.upserted',
                conditions: [{ field: 'severity', operator: 'equals', value: 'CRITICAL' }],
                actionType: 'CREATE_TASK',
                actionPayload: {
                    title: 'Urgent Parent & Principal Conference Required',
                    due_days: 1,
                    type: 'COUNSELING_ESCALATION',
                },
            },
        ],
    },
    {
        id: 'COLLEGE_HIGHER_ED_CLOUD',
        title: 'College & University Higher-Ed Cloud Pack',
        institutionType: 'College / University',
        tagline:
            'Degree programs, CBCS semester credit & SGPA/CGPA tracking, backlog management, and campus placement drives.',
        highlights: [
            'Academic Programs (B.Tech, MBA, B.Sc, BCA) with Credit Requirements & Roll-Up Enrolments',
            'Semester Credit & SGPA/CGPA Enrollment Tracker with Backlog Standing',
            'Campus Placement Drive Pipeline (CTC LPA, CGPA Cutoffs & Offer Roll-Ups)',
        ],
        objects: [
            {
                name: 'Academic Program',
                apiName: 'academic_program',
                description:
                    'University degree programs, department ownership, duration semesters, and CBCS credit requirements.',
                kanbanGroupByField: 'accreditation_status',
                defaultViewMode: 'TABLE',
                fields: [
                    {
                        label: 'Program Name',
                        apiName: 'program_name',
                        dataType: 'TEXT',
                        isRequired: true,
                    },
                    {
                        label: 'Degree Type',
                        apiName: 'degree_type',
                        dataType: 'PICKLIST',
                        isRequired: true,
                        picklistOptions: ['B_TECH', 'M_TECH', 'MBA', 'BBA', 'B_SC', 'BCA', 'PHD'],
                    },
                    {
                        label: 'Department',
                        apiName: 'department',
                        dataType: 'TEXT',
                        isRequired: true,
                    },
                    {
                        label: 'Duration (Semesters)',
                        apiName: 'duration_semesters',
                        dataType: 'NUMBER',
                        isRequired: true,
                        validationRules: { min: 1, max: 16 },
                    },
                    {
                        label: 'Total Credits Required',
                        apiName: 'total_credits_required',
                        dataType: 'NUMBER',
                        isRequired: true,
                        validationRules: { min: 10, max: 400 },
                    },
                    {
                        label: 'Accreditation Status',
                        apiName: 'accreditation_status',
                        dataType: 'PICKLIST',
                        isRequired: true,
                        picklistOptions: [
                            'NBA_ACCREDITED',
                            'NAAC_A_PLUS',
                            'UGC_APPROVED',
                            'AUTONOMOUS',
                        ],
                    },
                    {
                        label: 'Active Semester Enrollments',
                        apiName: 'enrolled_student_count',
                        dataType: 'NUMBER',
                        validationRules: {
                            fieldSubType: 'ROLLUP_SUMMARY',
                            rollupChildObject: 'semester_enrollment',
                            rollupForeignKeyField: 'program_id',
                            rollupAggregate: 'COUNT',
                        },
                    },
                ],
                formSections: [
                    {
                        title: 'Degree & Department',
                        columns: 2,
                        fields: ['program_name', 'degree_type', 'department', 'accreditation_status'],
                    },
                    {
                        title: 'Curriculum & Credit Structure',
                        columns: 2,
                        fields: [
                            'duration_semesters',
                            'total_credits_required',
                            'enrolled_student_count',
                        ],
                    },
                ],
            },
            {
                name: 'Semester Enrollment',
                apiName: 'semester_enrollment',
                description:
                    'Student semester registration, CBCS credits earned, SGPA/CGPA progression, and active backlogs.',
                kanbanGroupByField: 'academic_standing',
                defaultViewMode: 'KANBAN',
                fields: [
                    {
                        label: 'Student',
                        apiName: 'student_id',
                        dataType: 'TEXT',
                        isRequired: true,
                        validationRules: {
                            fieldSubType: 'LOOKUP',
                            lookupTargetObject: 'student',
                        },
                    },
                    {
                        label: 'Academic Program',
                        apiName: 'program_id',
                        dataType: 'TEXT',
                        isRequired: true,
                        validationRules: {
                            fieldSubType: 'LOOKUP',
                            lookupTargetObject: 'academic_program',
                        },
                    },
                    {
                        label: 'Semester Number',
                        apiName: 'semester_number',
                        dataType: 'NUMBER',
                        isRequired: true,
                        validationRules: { min: 1, max: 12 },
                    },
                    {
                        label: 'Credits Attempted',
                        apiName: 'credits_attempted',
                        dataType: 'NUMBER',
                        isRequired: true,
                        validationRules: { min: 0, max: 40 },
                    },
                    {
                        label: 'Credits Earned',
                        apiName: 'credits_earned',
                        dataType: 'NUMBER',
                        isRequired: true,
                        validationRules: { min: 0, max: 40 },
                    },
                    {
                        label: 'Credit Deficit',
                        apiName: 'credit_deficit',
                        dataType: 'NUMBER',
                        validationRules: {
                            fieldSubType: 'FORMULA',
                            formulaExpression: '{credits_attempted} - {credits_earned}',
                        },
                    },
                    {
                        label: 'SGPA',
                        apiName: 'sgpa',
                        dataType: 'NUMBER',
                        validationRules: { min: 0, max: 10 },
                    },
                    {
                        label: 'CGPA',
                        apiName: 'cgpa',
                        dataType: 'NUMBER',
                        validationRules: { min: 0, max: 10 },
                    },
                    {
                        label: 'Active Backlogs',
                        apiName: 'backlog_count',
                        dataType: 'NUMBER',
                        validationRules: { min: 0, max: 20 },
                    },
                    {
                        label: 'Academic Standing',
                        apiName: 'academic_standing',
                        dataType: 'PICKLIST',
                        isRequired: true,
                        picklistOptions: [
                            'GOOD_STANDING',
                            'DEANS_LIST',
                            'ACADEMIC_PROBATION',
                            'BACKLOG_REEXAM',
                        ],
                    },
                ],
                formSections: [
                    {
                        title: 'Student & Program Cohort',
                        columns: 2,
                        fields: ['student_id', 'program_id', 'semester_number', 'academic_standing'],
                    },
                    {
                        title: 'CBCS Credits & GPA Performance',
                        columns: 2,
                        fields: [
                            'credits_attempted',
                            'credits_earned',
                            'credit_deficit',
                            'sgpa',
                            'cgpa',
                            'backlog_count',
                        ],
                    },
                ],
            },
            {
                name: 'Placement Drive',
                apiName: 'placement_drive',
                description:
                    'Campus recruitment drives, CTC packages, CGPA/backlog eligibility cutoffs, and offer conversion tracking.',
                kanbanGroupByField: 'drive_stage',
                defaultViewMode: 'KANBAN',
                fields: [
                    {
                        label: 'Company Name',
                        apiName: 'company_name',
                        dataType: 'TEXT',
                        isRequired: true,
                    },
                    {
                        label: 'Role Title',
                        apiName: 'role_title',
                        dataType: 'TEXT',
                        isRequired: true,
                    },
                    {
                        label: 'Package CTC (LPA)',
                        apiName: 'package_ctc_lpa',
                        dataType: 'NUMBER',
                        isRequired: true,
                        validationRules: { min: 0 },
                    },
                    {
                        label: 'Minimum CGPA Cutoff',
                        apiName: 'min_cgpa_cutoff',
                        dataType: 'NUMBER',
                        validationRules: { min: 0, max: 10 },
                    },
                    {
                        label: 'Max Allowed Backlogs',
                        apiName: 'max_backlogs_allowed',
                        dataType: 'NUMBER',
                        validationRules: { min: 0, max: 10 },
                    },
                    {
                        label: 'Drive Date',
                        apiName: 'drive_date',
                        dataType: 'DATE',
                        isRequired: true,
                    },
                    {
                        label: 'Registered Candidates',
                        apiName: 'applicants_count',
                        dataType: 'NUMBER',
                        validationRules: { min: 0 },
                    },
                    {
                        label: 'Offers Released',
                        apiName: 'offers_made',
                        dataType: 'NUMBER',
                        validationRules: { min: 0 },
                    },
                    {
                        label: 'Drive Stage',
                        apiName: 'drive_stage',
                        dataType: 'PICKLIST',
                        isRequired: true,
                        picklistOptions: [
                            'ANNOUNCED',
                            'REGISTRATION_OPEN',
                            'APTITUDE_TEST',
                            'INTERVIEWING',
                            'OFFERS_RELEASED',
                            'COMPLETED',
                        ],
                    },
                ],
                formSections: [
                    {
                        title: 'Recruiter & Role Profile',
                        columns: 2,
                        fields: ['company_name', 'role_title', 'package_ctc_lpa', 'drive_date'],
                    },
                    {
                        title: 'Eligibility Cutoffs & Funnel',
                        columns: 2,
                        fields: [
                            'min_cgpa_cutoff',
                            'max_backlogs_allowed',
                            'applicants_count',
                            'offers_made',
                            'drive_stage',
                        ],
                    },
                ],
            },
        ],
        workflows: [
            {
                name: 'Academic Probation Advisor Follow-Up',
                objectName: 'semester_enrollment',
                triggerEvent: 'object.record.upserted',
                conditions: [
                    { field: 'academic_standing', operator: 'equals', value: 'ACADEMIC_PROBATION' },
                ],
                actionType: 'CREATE_TASK',
                actionPayload: {
                    title: 'Schedule Faculty Advisor Remediation Plan for Probation Student',
                    due_days: 3,
                    type: 'ACADEMIC_ADVISING',
                },
            },
        ],
    },
    {
        id: 'COACHING_INSTITUTE_CLOUD',
        title: 'Coaching & Test-Prep Institute Cloud Pack',
        institutionType: 'Coaching / Test-Prep Institute',
        tagline:
            'JEE / NEET / UPSC batch management, counselor telecalling inquiry funnel, ACST scholarship discounts, and OMR/CBT test series analytics.',
        highlights: [
            'Coaching Batch Management with Seat Availability Formula & Inquiry Roll-Ups',
            'Counselor Inquiry & Demo Class Kanban Funnel with ACST Scholarship Formula',
            'OMR / CBT Test Series Attempt Tracker with +4/-1 Net Score Formula & AIR',
        ],
        objects: [
            {
                name: 'Coaching Batch',
                apiName: 'coaching_batch',
                description:
                    'Target-exam batches (JEE Main/Advanced, NEET UG, UPSC, Foundation), center capacity, and seat availability.',
                kanbanGroupByField: 'batch_status',
                defaultViewMode: 'KANBAN',
                fields: [
                    {
                        label: 'Batch Code',
                        apiName: 'batch_code',
                        dataType: 'TEXT',
                        isRequired: true,
                    },
                    {
                        label: 'Target Exam',
                        apiName: 'target_exam',
                        dataType: 'PICKLIST',
                        isRequired: true,
                        picklistOptions: [
                            'JEE_MAIN_ADVANCED',
                            'NEET_UG',
                            'UPSC_CSE',
                            'CLASS_9_10_FOUNDATION',
                            'CUET_UG',
                        ],
                    },
                    {
                        label: 'Center / Branch City',
                        apiName: 'center_city',
                        dataType: 'TEXT',
                        isRequired: true,
                    },
                    {
                        label: 'Commencement Date',
                        apiName: 'start_date',
                        dataType: 'DATE',
                        isRequired: true,
                    },
                    {
                        label: 'Max Seat Capacity',
                        apiName: 'max_capacity',
                        dataType: 'NUMBER',
                        isRequired: true,
                        validationRules: { min: 1, max: 1000 },
                    },
                    {
                        label: 'Enrolled Students',
                        apiName: 'enrolled_count',
                        dataType: 'NUMBER',
                        isRequired: true,
                        validationRules: { min: 0 },
                    },
                    {
                        label: 'Available Seats',
                        apiName: 'available_seats',
                        dataType: 'NUMBER',
                        validationRules: {
                            fieldSubType: 'FORMULA',
                            formulaExpression: '{max_capacity} - {enrolled_count}',
                        },
                    },
                    {
                        label: 'Linked Inquiries Count',
                        apiName: 'total_inquiries',
                        dataType: 'NUMBER',
                        validationRules: {
                            fieldSubType: 'ROLLUP_SUMMARY',
                            rollupChildObject: 'coaching_inquiry',
                            rollupForeignKeyField: 'preferred_batch_id',
                            rollupAggregate: 'COUNT',
                        },
                    },
                    {
                        label: 'Batch Status',
                        apiName: 'batch_status',
                        dataType: 'PICKLIST',
                        isRequired: true,
                        picklistOptions: ['ENROLLING', 'ACTIVE', 'COMPLETED', 'ARCHIVED'],
                    },
                ],
                formSections: [
                    {
                        title: 'Batch Identity & Center',
                        columns: 2,
                        fields: [
                            'batch_code',
                            'target_exam',
                            'center_city',
                            'start_date',
                            'batch_status',
                        ],
                    },
                    {
                        title: 'Capacity & Demand Roll-Ups',
                        columns: 2,
                        fields: [
                            'max_capacity',
                            'enrolled_count',
                            'available_seats',
                            'total_inquiries',
                        ],
                    },
                ],
            },
            {
                name: 'Coaching Inquiry',
                apiName: 'coaching_inquiry',
                description:
                    'Walk-in & telecalling admission leads, demo class tracking, ACST scholarship test scores, and net fee quotes.',
                kanbanGroupByField: 'pipeline_stage',
                defaultViewMode: 'KANBAN',
                fields: [
                    {
                        label: 'Candidate Name',
                        apiName: 'candidate_name',
                        dataType: 'TEXT',
                        isRequired: true,
                    },
                    {
                        label: 'Mobile Number',
                        apiName: 'phone_number',
                        dataType: 'TEXT',
                        isRequired: true,
                    },
                    {
                        label: 'Target Exam',
                        apiName: 'target_exam',
                        dataType: 'PICKLIST',
                        isRequired: true,
                        picklistOptions: [
                            'JEE_MAIN_ADVANCED',
                            'NEET_UG',
                            'UPSC_CSE',
                            'CLASS_9_10_FOUNDATION',
                            'CUET_UG',
                        ],
                    },
                    {
                        label: 'Preferred Batch',
                        apiName: 'preferred_batch_id',
                        dataType: 'TEXT',
                        validationRules: {
                            fieldSubType: 'LOOKUP',
                            lookupTargetObject: 'coaching_batch',
                        },
                    },
                    {
                        label: 'Assigned Counselor',
                        apiName: 'counselor_name',
                        dataType: 'TEXT',
                    },
                    {
                        label: 'ACST Scholarship Score (%)',
                        apiName: 'acst_scholarship_score',
                        dataType: 'NUMBER',
                        validationRules: { min: 0, max: 100 },
                    },
                    {
                        label: 'Base Course Fee',
                        apiName: 'base_course_fee',
                        dataType: 'CURRENCY',
                        isRequired: true,
                        validationRules: { min: 0 },
                    },
                    {
                        label: 'Scholarship Discount',
                        apiName: 'scholarship_discount',
                        dataType: 'CURRENCY',
                        validationRules: { min: 0 },
                    },
                    {
                        label: 'Final Payable Fee',
                        apiName: 'final_payable_fee',
                        dataType: 'NUMBER',
                        validationRules: {
                            fieldSubType: 'FORMULA',
                            formulaExpression: '{base_course_fee} - {scholarship_discount}',
                        },
                    },
                    {
                        label: 'Pipeline Stage',
                        apiName: 'pipeline_stage',
                        dataType: 'PICKLIST',
                        isRequired: true,
                        picklistOptions: [
                            'NEW_INQUIRY',
                            'DEMO_SCHEDULED',
                            'DEMO_ATTENDED',
                            'ACST_TAKEN',
                            'FEE_DISCUSSION',
                            'ENROLLED',
                            'LOST',
                        ],
                    },
                ],
                formSections: [
                    {
                        title: 'Candidate & Counselor Assignment',
                        columns: 2,
                        fields: [
                            'candidate_name',
                            'phone_number',
                            'target_exam',
                            'preferred_batch_id',
                            'counselor_name',
                            'pipeline_stage',
                        ],
                    },
                    {
                        title: 'ACST Scholarship & Fee Quote',
                        columns: 2,
                        fields: [
                            'acst_scholarship_score',
                            'base_course_fee',
                            'scholarship_discount',
                            'final_payable_fee',
                        ],
                    },
                ],
            },
            {
                name: 'Test Series Attempt',
                apiName: 'test_series_attempt',
                description:
                    'OMR / CBT mock test attempts with +4/-1 negative marking formula, percentile, and All-India Rank (AIR).',
                defaultViewMode: 'TABLE',
                fields: [
                    {
                        label: 'Coaching Batch',
                        apiName: 'batch_id',
                        dataType: 'TEXT',
                        isRequired: true,
                        validationRules: {
                            fieldSubType: 'LOOKUP',
                            lookupTargetObject: 'coaching_batch',
                        },
                    },
                    {
                        label: 'Candidate Name',
                        apiName: 'candidate_name',
                        dataType: 'TEXT',
                        isRequired: true,
                    },
                    {
                        label: 'Mock Test Name',
                        apiName: 'test_name',
                        dataType: 'TEXT',
                        isRequired: true,
                    },
                    {
                        label: 'Correct Answers (+4)',
                        apiName: 'correct_answers',
                        dataType: 'NUMBER',
                        isRequired: true,
                        validationRules: { min: 0, max: 300 },
                    },
                    {
                        label: 'Incorrect Answers (-1)',
                        apiName: 'incorrect_answers',
                        dataType: 'NUMBER',
                        isRequired: true,
                        validationRules: { min: 0, max: 300 },
                    },
                    {
                        label: 'Net Score (+4 / -1)',
                        apiName: 'net_score',
                        dataType: 'NUMBER',
                        validationRules: {
                            fieldSubType: 'FORMULA',
                            formulaExpression: '{correct_answers} * 4 - {incorrect_answers}',
                        },
                    },
                    {
                        label: 'Percentile',
                        apiName: 'percentile',
                        dataType: 'NUMBER',
                        validationRules: { min: 0, max: 100 },
                    },
                    {
                        label: 'All India Rank (AIR)',
                        apiName: 'all_india_rank',
                        dataType: 'NUMBER',
                        validationRules: { min: 1 },
                    },
                ],
                formSections: [
                    {
                        title: 'Test & Candidate',
                        columns: 2,
                        fields: ['batch_id', 'candidate_name', 'test_name'],
                    },
                    {
                        title: 'OMR / CBT Score & Rank Evaluation',
                        columns: 2,
                        fields: [
                            'correct_answers',
                            'incorrect_answers',
                            'net_score',
                            'percentile',
                            'all_india_rank',
                        ],
                    },
                ],
            },
        ],
        workflows: [
            {
                name: 'Welcome Kit & ID Card Task on Coaching Enrollment',
                objectName: 'coaching_inquiry',
                triggerEvent: 'object.record.upserted',
                conditions: [{ field: 'pipeline_stage', operator: 'equals', value: 'ENROLLED' }],
                actionType: 'CREATE_TASK',
                actionPayload: {
                    title: 'Issue Study Material Kit, Biometric Card & Batch Welcome Email',
                    due_days: 1,
                    type: 'COACHING_ONBOARDING',
                },
            },
        ],
    },
];

export function getEducationBlueprintById(
    id: string,
): EducationBlueprintPack | undefined {
    return EDUCATION_BLUEPRINT_PACKS.find(pack => pack.id === id);
}
