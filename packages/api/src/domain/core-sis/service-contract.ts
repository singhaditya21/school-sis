import type { CoreSisDomainEventName } from './events';
import type { CoreSisModuleId, DomainCommandContext, DomainMutationResult } from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DomainEventEnvelope<Payload extends Record<string, unknown> = Record<string, unknown>> = {
    name: CoreSisDomainEventName;
    moduleId: CoreSisModuleId;
    tenantId: string;
    actorUserId: string;
    source: DomainCommandContext['source'];
    occurredAt: string;
    requestId?: string;
    correlationId?: string;
    payload: Payload;
};

export function assertDomainCommandContext(context: DomainCommandContext): void {
    if (!UUID_RE.test(context.tenantId)) {
        throw new Error('Domain command context requires a valid tenantId.');
    }

    if (!UUID_RE.test(context.actorUserId)) {
        throw new Error('Domain command context requires a valid actorUserId.');
    }
}

export function buildAuditAction(moduleId: CoreSisModuleId, entity: string, action: string): string {
    return `${moduleId}.${entity}.${action}`.toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
}

export function createDomainEventEnvelope<Payload extends Record<string, unknown>>(
    context: DomainCommandContext,
    eventName: CoreSisDomainEventName,
    payload: Payload,
): DomainEventEnvelope<Payload> {
    assertDomainCommandContext(context);
    const [, moduleId] = eventName.split('.') as ['core_sis', CoreSisModuleId, string, 'v1'];

    return {
        name: eventName,
        moduleId,
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        source: context.source,
        occurredAt: new Date().toISOString(),
        requestId: context.requestId,
        correlationId: context.correlationId,
        payload,
    };
}

export function createDomainMutationResult(params: DomainMutationResult): DomainMutationResult {
    return {
        moduleId: params.moduleId,
        entity: params.entity,
        entityId: params.entityId,
        status: params.status,
        emittedEvents: [...params.emittedEvents],
    };
}
