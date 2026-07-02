export type CoreSisModuleId =
    | 'admissions'
    | 'enrollment'
    | 'attendance'
    | 'timetable'
    | 'exams'
    | 'gradebook'
    | 'fees'
    | 'transport'
    | 'library'
    | 'hostel'
    | 'hr'
    | 'communications';

export type CoreSisOwnerRole =
    | 'ADMISSION_OFFICER'
    | 'ACADEMIC_ADMIN'
    | 'ATTENDANCE_COORDINATOR'
    | 'EXAM_CONTROLLER'
    | 'FEE_MANAGER'
    | 'TRANSPORT_MANAGER'
    | 'LIBRARIAN'
    | 'HOSTEL_WARDEN'
    | 'HR_MANAGER'
    | 'COMMUNICATIONS_ADMIN';

export type DomainDataClassification = 'student_pii' | 'staff_pii' | 'financial' | 'academic' | 'operational';

export type DomainTransition<State extends string = string> = {
    from: State;
    to: State;
    action: string;
    description: string;
    requiredPermission: string;
    auditAction: string;
    emits: readonly string[];
    requiresReason?: boolean;
};

export type DomainStateMachine<State extends string = string> = {
    id: string;
    entity: string;
    states: readonly State[];
    initialStates: readonly State[];
    terminalStates: readonly State[];
    transitions: readonly DomainTransition<State>[];
};

export type CoreSisBoundedContext = {
    id: CoreSisModuleId;
    label: string;
    ownerRole: CoreSisOwnerRole;
    description: string;
    primaryEntities: readonly string[];
    primaryTables: readonly string[];
    routes: readonly string[];
    services: readonly string[];
    stateMachines: readonly string[];
    dependsOn: readonly CoreSisModuleId[];
    permissions: readonly string[];
    emittedEvents: readonly string[];
    invariants: readonly string[];
    asyncWorkflows: readonly string[];
    operationalReports: readonly string[];
    dataClassification: readonly DomainDataClassification[];
    tenantScoped: boolean;
    auditRequired: boolean;
};

export type DomainCommandSource = 'web' | 'api' | 'job' | 'integration' | 'system';

export type DomainCommandContext = {
    tenantId: string;
    actorUserId: string;
    source: DomainCommandSource;
    requestId?: string;
    correlationId?: string;
};

export type DomainMutationResult = {
    moduleId: CoreSisModuleId;
    entity: string;
    entityId: string;
    status: 'accepted' | 'completed' | 'rejected';
    emittedEvents: readonly string[];
};
