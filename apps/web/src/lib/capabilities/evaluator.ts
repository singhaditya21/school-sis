import { CAPABILITY_REGISTRY, getCapabilityDefinition } from './registry';
import type {
    CapabilityDecision,
    CapabilityDefinition,
    CapabilityEvaluationContext,
    CapabilityId,
    InstitutionType,
} from './types';

const ENTITLEMENT_ALIASES: Readonly<Record<string, string>> = {
    AI: 'AI_AGENTS',
    COMMUNICATIONS: 'COMMUNICATION',
    GROUP_GOVERNANCE: 'MULTI_CAMPUS',
    HIGHER_EDUCATION: 'HIGHER_ED',
};

function normalizeIdentifier(value: string): string {
    const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
    return ENTITLEMENT_ALIASES[normalized] || normalized;
}

export function normalizeActiveModules(activeModules: readonly string[]): ReadonlySet<string> {
    return new Set(activeModules.filter(Boolean).map(normalizeIdentifier));
}

export function normalizeCapabilityPath(pathname: string): string {
    const withoutQuery = pathname.split('?')[0]?.split('#')[0] || '/';
    if (withoutQuery.length > 1 && withoutQuery.endsWith('/')) {
        return withoutQuery.slice(0, -1);
    }
    return withoutQuery || '/';
}

export function capabilityPathMatchesPrefix(pathname: string, prefix: string): boolean {
    const path = normalizeCapabilityPath(pathname);
    const normalizedPrefix = normalizeCapabilityPath(prefix);
    return path === normalizedPrefix || path.startsWith(`${normalizedPrefix}/`);
}

type CapabilityPathMatch = {
    definition: CapabilityDefinition;
    prefix: string;
};

function findMostSpecificMatch(
    pathname: string,
    prefixesFor: (definition: CapabilityDefinition) => readonly string[],
): CapabilityDefinition | null {
    const matches: CapabilityPathMatch[] = CAPABILITY_REGISTRY.flatMap((definition) =>
        prefixesFor(definition)
            .filter((prefix) => capabilityPathMatchesPrefix(pathname, prefix))
            .map((prefix) => ({ definition, prefix })),
    );

    matches.sort((left, right) => normalizeCapabilityPath(right.prefix).length - normalizeCapabilityPath(left.prefix).length);
    return matches[0]?.definition ?? null;
}

export function findCapabilityForRoute(pathname: string): CapabilityDefinition | null {
    return findMostSpecificMatch(pathname, (definition) => definition.routes);
}

export function findCapabilityForApiPath(pathname: string): CapabilityDefinition | null {
    return findMostSpecificMatch(pathname, (definition) => definition.apiPrefixes);
}

function institutionTypeIsKnown(value: string | null | undefined): value is InstitutionType {
    return value === 'K12'
        || value === 'COLLEGE'
        || value === 'UNIVERSITY'
        || value === 'COACHING'
        || value === 'HYBRID';
}

export function evaluateCapabilityDefinition(
    definition: CapabilityDefinition,
    context: CapabilityEvaluationContext,
): CapabilityDecision {
    if (definition.lifecycle === 'HIDDEN') {
        return { id: definition.id, lifecycle: definition.lifecycle, available: false, reason: 'HIDDEN' };
    }

    if (definition.lifecycle === 'INTERNAL' && !context.allowInternal) {
        return { id: definition.id, lifecycle: definition.lifecycle, available: false, reason: 'INTERNAL_ONLY' };
    }

    const entitlements = normalizeActiveModules(context.activeModules);
    if (definition.entitlement !== 'BASE' && !entitlements.has(normalizeIdentifier(definition.entitlement))) {
        return { id: definition.id, lifecycle: definition.lifecycle, available: false, reason: 'NOT_ENTITLED' };
    }

    if (
        institutionTypeIsKnown(context.institutionType)
        && !definition.institutionTypes.includes(context.institutionType)
    ) {
        return {
            id: definition.id,
            lifecycle: definition.lifecycle,
            available: false,
            reason: 'INSTITUTION_UNSUPPORTED',
        };
    }

    if (
        definition.requiredPermissions.length > 0
        && (!context.hasPermission || !definition.requiredPermissions.every(context.hasPermission))
    ) {
        return { id: definition.id, lifecycle: definition.lifecycle, available: false, reason: 'FORBIDDEN' };
    }

    const configuredProviders = new Set(context.configuredProviders || []);
    if (definition.providerPrerequisites.some((provider) => !configuredProviders.has(provider))) {
        return { id: definition.id, lifecycle: definition.lifecycle, available: false, reason: 'UNCONFIGURED' };
    }

    return { id: definition.id, lifecycle: definition.lifecycle, available: true };
}

export function evaluateCapability(
    id: CapabilityId,
    context: CapabilityEvaluationContext,
): CapabilityDecision {
    return evaluateCapabilityDefinition(getCapabilityDefinition(id), context);
}

export function listCapabilityDecisions(context: CapabilityEvaluationContext): readonly CapabilityDecision[] {
    return CAPABILITY_REGISTRY.map((definition) => evaluateCapabilityDefinition(definition, context));
}
