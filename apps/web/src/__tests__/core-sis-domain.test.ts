import {
    CORE_SIS_MODULES,
    CORE_SIS_STATE_MACHINES,
    assertDomainCommandContext,
    assertDomainTransition,
    buildAuditAction,
    canTransition,
    createDomainEventEnvelope,
    findCoreSisModuleByRoute,
    getAllowedTransitions,
    isTerminalState,
    listCoreSisEventNames,
    parseCoreSisEventName,
} from '../../../../packages/api/src/domain/core-sis';

const TENANT_ID = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
const ACTOR_ID = 'f0df64c1-6d43-4e8d-9697-c25044e09eb4';

describe('Core SIS domain architecture', () => {
    it('defines every bounded context with tenant, audit, permission, route, and event ownership', () => {
        expect(CORE_SIS_MODULES.length).toBeGreaterThanOrEqual(10);

        for (const boundedContext of CORE_SIS_MODULES) {
            expect(boundedContext.tenantScoped).toBe(true);
            expect(boundedContext.auditRequired).toBe(true);
            expect(boundedContext.primaryTables.length).toBeGreaterThan(0);
            expect(boundedContext.routes.length).toBeGreaterThan(0);
            expect(boundedContext.permissions.length).toBeGreaterThan(0);
            expect(boundedContext.emittedEvents.length).toBeGreaterThan(0);
            expect(boundedContext.invariants.length).toBeGreaterThan(0);
        }
    });

    it('maps common product routes to the correct bounded context', () => {
        expect(findCoreSisModuleByRoute('/fees/cashflow')?.id).toBe('fees');
        expect(findCoreSisModuleByRoute('/attendance/mark/class-1')?.id).toBe('attendance');
        expect(findCoreSisModuleByRoute('/teacher/gradebook')?.id).toBe('gradebook');
        expect(findCoreSisModuleByRoute('/not-a-core-route')).toBeNull();
    });

    it('enforces canonical lifecycle transitions', () => {
        expect(canTransition('admissionLead', 'NEW', 'CONTACTED')).toBe(true);
        expect(canTransition('admissionLead', 'NEW', 'ENROLLED')).toBe(false);
        expect(canTransition('invoiceLifecycle', 'PENDING', 'PAID')).toBe(true);
        expect(canTransition('libraryIssue', 'OVERDUE', 'RETURNED')).toBe(true);
        expect(isTerminalState('invoiceLifecycle', 'PAID')).toBe(true);
        expect(getAllowedTransitions('invoiceLifecycle', 'PAID')).toHaveLength(0);
        expect(() => assertDomainTransition('studentEnrollment', 'ALUMNI', 'ACTIVE')).toThrow('Invalid studentEnrollment transition');
    });

    it('keeps transition events registered in the global Core SIS event catalog', () => {
        const knownEvents = new Set<string>(listCoreSisEventNames());
        const emittedEvents = Object.values(CORE_SIS_STATE_MACHINES)
            .flatMap((machine) => machine.transitions)
            .flatMap((transition) => transition.emits);

        for (const eventName of emittedEvents) {
            expect(knownEvents.has(eventName)).toBe(true);
        }
    });

    it('parses Core SIS domain event names', () => {
        expect(parseCoreSisEventName('core_sis.fees.invoice_issued.v1')).toEqual({
            moduleId: 'fees',
            topic: 'invoice_issued',
            version: 'v1',
        });
        expect(parseCoreSisEventName('bad.fees.invoice_issued.v1')).toBeNull();
        expect(parseCoreSisEventName('core_sis.unknown.invoice_issued.v1')).toBeNull();
    });

    it('standardizes command context and event envelopes', () => {
        const context = {
            tenantId: TENANT_ID,
            actorUserId: ACTOR_ID,
            source: 'web' as const,
            requestId: 'req_123',
        };

        expect(() => assertDomainCommandContext(context)).not.toThrow();
        expect(() => assertDomainCommandContext({ ...context, tenantId: 'bad' })).toThrow('valid tenantId');
        expect(buildAuditAction('fees', 'Invoice Record', 'Issue Now')).toBe('fees.invoice_record.issue_now');

        const envelope = createDomainEventEnvelope(context, 'core_sis.fees.invoice_issued.v1', {
            invoiceId: 'inv_123',
        });

        expect(envelope.moduleId).toBe('fees');
        expect(envelope.tenantId).toBe(TENANT_ID);
        expect(envelope.actorUserId).toBe(ACTOR_ID);
        expect(envelope.payload.invoiceId).toBe('inv_123');
    });
});
