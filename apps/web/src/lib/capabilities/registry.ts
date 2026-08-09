import type { CapabilityDefinition, CapabilityId } from './types';

/**
 * Product lifecycle is code-owned. Tenant entitlements can narrow access, but
 * can never promote a HIDDEN or INTERNAL capability.
 */
export const CAPABILITY_REGISTRY = [
    {
        id: 'core-sis',
        lifecycle: 'GA',
        entitlement: 'BASE',
        institutionTypes: ['K12', 'COLLEGE', 'UNIVERSITY', 'COACHING', 'HYBRID'],
        // Core SIS spans several personas; route/action-specific RBAC remains
        // authoritative instead of imposing one permission across all of them.
        requiredPermissions: [],
        providerPrerequisites: [],
        routes: [
            '/dashboard',
            '/approvals',
            '/admissions',
            '/attendance',
            '/exams',
            '/timetable',
            '/consent',
            '/onboarding',
            '/app/student',
            '/app/staff',
            '/settings/grading',
            '/settings/roles',
            '/settings/school',
            '/settings/users',
        ],
        apiPrefixes: [
            '/api/admissions',
            '/api/attendance',
            '/api/exams',
            '/api/report-cards',
            '/api/students',
        ],
        owner: 'Core SIS',
    },
    {
        id: 'portals',
        lifecycle: 'GA',
        entitlement: 'BASE',
        institutionTypes: ['K12', 'COLLEGE', 'UNIVERSITY', 'COACHING', 'HYBRID'],
        requiredPermissions: [],
        providerPrerequisites: [],
        routes: [
            '/teacher',
            '/student',
            '/overview',
            '/alerts',
            '/my-attendance',
            '/my-results',
            '/parent-consent',
        ],
        apiPrefixes: ['/api/parent'],
        owner: 'Portal Experiences',
    },
    {
        id: 'payments',
        lifecycle: 'PILOT',
        entitlement: 'FEES',
        institutionTypes: ['K12', 'COLLEGE', 'UNIVERSITY', 'COACHING', 'HYBRID'],
        requiredPermissions: ['fees:read:own'],
        providerPrerequisites: [],
        routes: [
            '/fees',
            '/my-fees',
            '/receipts',
            '/treasury',
            '/app/invoice',
            '/hq/treasury',
            '/platform/billing',
            '/settings/payments',
            '/student/wallet',
        ],
        apiPrefixes: [
            '/api/fee-plans',
            '/api/finance',
            '/api/parent/payment-sheet',
            '/api/payments',
            '/api/receipts',
        ],
        owner: 'Finance',
    },
    {
        id: 'communications',
        lifecycle: 'PILOT',
        entitlement: 'COMMUNICATION',
        institutionTypes: ['K12', 'COLLEGE', 'UNIVERSITY', 'COACHING', 'HYBRID'],
        requiredPermissions: ['messages:read'],
        providerPrerequisites: ['MESSAGING'],
        routes: ['/messages', '/teacher/messages'],
        apiPrefixes: ['/api/messages', '/api/notifications'],
        owner: 'Communications',
    },
    {
        id: 'group-governance',
        lifecycle: 'PILOT',
        entitlement: 'MULTI_CAMPUS',
        institutionTypes: ['K12', 'COLLEGE', 'UNIVERSITY', 'COACHING', 'HYBRID'],
        requiredPermissions: ['hq:read'],
        providerPrerequisites: [],
        routes: ['/hq', '/hq-overview', '/hq-policies', '/platform', '/schools'],
        apiPrefixes: ['/api/hq'],
        owner: 'Group Platform',
    },
    {
        id: 'international',
        lifecycle: 'HIDDEN',
        entitlement: 'INTERNATIONAL',
        institutionTypes: ['K12', 'HYBRID'],
        requiredPermissions: ['hq:read'],
        providerPrerequisites: [],
        routes: ['/international'],
        apiPrefixes: ['/api/international'],
        owner: 'International',
    },
    {
        id: 'higher-education',
        lifecycle: 'HIDDEN',
        entitlement: 'HIGHER_ED',
        institutionTypes: ['COLLEGE', 'UNIVERSITY', 'HYBRID'],
        requiredPermissions: ['academic:read'],
        providerPrerequisites: [],
        routes: ['/university', '/student/placements'],
        apiPrefixes: ['/api/university'],
        owner: 'Higher Education',
    },
    {
        id: 'compliance',
        lifecycle: 'HIDDEN',
        entitlement: 'COMPLIANCE',
        institutionTypes: ['K12', 'COLLEGE', 'UNIVERSITY', 'COACHING', 'HYBRID'],
        requiredPermissions: ['reports:read'],
        providerPrerequisites: [],
        routes: ['/compliance', '/hq/compliance'],
        apiPrefixes: ['/api/compliance', '/api/exports'],
        owner: 'Trust and Compliance',
    },
    {
        id: 'coaching',
        lifecycle: 'HIDDEN',
        entitlement: 'COACHING',
        institutionTypes: ['COACHING', 'HYBRID'],
        requiredPermissions: ['quiz:read'],
        providerPrerequisites: [],
        routes: ['/coaching', '/quiz'],
        apiPrefixes: ['/api/coaching', '/api/quiz'],
        owner: 'Coaching',
    },
    {
        id: 'ai',
        lifecycle: 'HIDDEN',
        entitlement: 'AI_AGENTS',
        institutionTypes: ['K12', 'COLLEGE', 'UNIVERSITY', 'COACHING', 'HYBRID'],
        requiredPermissions: ['agents:read'],
        providerPrerequisites: ['AI'],
        routes: [
            '/chat',
            '/fees/intelligence',
            '/hq/ai-governance',
            '/platform/analytics',
            '/student/ai-tutor',
            '/teacher/exams/proctoring',
            '/teacher/students',
        ],
        apiPrefixes: ['/api/agents', '/api/chat', '/api/copilot'],
        owner: 'Trust and AI',
    },
    {
        id: 'mobile',
        lifecycle: 'HIDDEN',
        entitlement: 'MOBILE',
        institutionTypes: ['K12', 'COLLEGE', 'UNIVERSITY', 'COACHING', 'HYBRID'],
        requiredPermissions: [],
        providerPrerequisites: ['PUSH', 'PAYMENTS'],
        routes: [],
        apiPrefixes: ['/api/mobile'],
        owner: 'Mobile',
    },
    {
        id: 'integrations',
        lifecycle: 'PILOT',
        entitlement: 'BASE',
        institutionTypes: ['K12', 'COLLEGE', 'UNIVERSITY', 'COACHING', 'HYBRID'],
        requiredPermissions: ['integrations:read'],
        providerPrerequisites: [],
        routes: ['/integrations', '/api-docs'],
        apiPrefixes: ['/api/integrations', '/api/v1/integrations'],
        owner: 'Platform Integrations',
    },
] as const satisfies readonly CapabilityDefinition[];

function computeRegistryRevision(definitions: readonly CapabilityDefinition[]): string {
    const source = JSON.stringify(definitions);
    let hash = 0x811c9dc5;
    for (let index = 0; index < source.length; index += 1) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return `cap-v1-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/** Changes automatically whenever the code-owned registry changes. */
export const CAPABILITY_REGISTRY_REVISION = computeRegistryRevision(CAPABILITY_REGISTRY);

const CAPABILITIES_BY_ID = new Map<CapabilityId, CapabilityDefinition>(
    CAPABILITY_REGISTRY.map((definition) => [definition.id, definition]),
);

export function getCapabilityDefinition(id: CapabilityId): CapabilityDefinition {
    const definition = CAPABILITIES_BY_ID.get(id);
    if (!definition) {
        throw new Error(`Unknown capability: ${id}`);
    }
    return definition;
}
