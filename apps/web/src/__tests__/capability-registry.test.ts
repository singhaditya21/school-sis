import {
    CAPABILITY_IDS,
    CAPABILITY_REGISTRY,
    CAPABILITY_REGISTRY_REVISION,
    buildAdminNavigation,
    evaluateCapability,
    evaluateCapabilityDefinition,
    findCapabilityForApiPath,
    findCapabilityForRoute,
    normalizeActiveModules,
    type CapabilityDefinition,
} from '@/lib/capabilities';
import { hasPermission, UserRole } from '@/lib/rbac/permissions';

const allowPermissions = () => true;

describe('central capability registry', () => {
    it('defines every public capability id exactly once', () => {
        expect(CAPABILITY_REGISTRY.map(({ id }) => id)).toEqual(CAPABILITY_IDS);
        expect(new Set(CAPABILITY_REGISTRY.map(({ id }) => id)).size).toBe(CAPABILITY_IDS.length);
        expect(CAPABILITY_REGISTRY_REVISION).toMatch(/^cap-v1-[0-9a-f]{8}$/);

        for (const definition of CAPABILITY_REGISTRY) {
            expect(definition.entitlement).toBeTruthy();
            expect(definition.owner).toBeTruthy();
            expect(definition.institutionTypes.length).toBeGreaterThan(0);
        }
    });

    it('never lets an entitlement promote code-owned hidden capabilities', () => {
        const decision = evaluateCapability('ai', {
            activeModules: ['AI_AGENTS', 'ENTERPRISE'],
            institutionType: 'K12',
            configuredProviders: ['AI'],
            hasPermission: allowPermissions,
            allowInternal: true,
        });

        expect(decision).toEqual({
            id: 'ai',
            lifecycle: 'HIDDEN',
            available: false,
            reason: 'HIDDEN',
        });
    });

    it('fails closed when commercial entitlement data is missing', () => {
        expect(evaluateCapability('payments', {
            activeModules: [],
            institutionType: 'K12',
            hasPermission: allowPermissions,
        })).toMatchObject({ available: false, reason: 'NOT_ENTITLED' });

        expect(evaluateCapability('core-sis', {
            activeModules: [],
            institutionType: 'K12',
            hasPermission: allowPermissions,
        })).toMatchObject({ available: true });
    });

    it('normalizes known legacy entitlement aliases without changing unknown values', () => {
        expect([...normalizeActiveModules(['communications', 'higher-education', 'custom-module'])]).toEqual([
            'COMMUNICATION',
            'HIGHER_ED',
            'CUSTOM_MODULE',
        ]);
    });

    it('keeps permission, institution, and provider failures distinct', () => {
        expect(evaluateCapability('payments', {
            activeModules: ['FEES'],
            institutionType: 'K12',
            hasPermission: () => false,
        })).toMatchObject({ available: false, reason: 'FORBIDDEN' });

        const institutionLimited: CapabilityDefinition = {
            ...CAPABILITY_REGISTRY[0],
            institutionTypes: ['UNIVERSITY'],
        };
        expect(evaluateCapabilityDefinition(institutionLimited, {
            activeModules: [],
            institutionType: 'K12',
            hasPermission: allowPermissions,
        })).toMatchObject({ available: false, reason: 'INSTITUTION_UNSUPPORTED' });

        const providerLimited: CapabilityDefinition = {
            ...CAPABILITY_REGISTRY[0],
            providerPrerequisites: ['MESSAGING'],
        };
        expect(evaluateCapabilityDefinition(providerLimited, {
            activeModules: [],
            institutionType: 'K12',
            configuredProviders: [],
            hasPermission: allowPermissions,
        })).toMatchObject({ available: false, reason: 'UNCONFIGURED' });
    });

    it('keeps finance pages available to authorized tenant and own-scope roles', () => {
        for (const role of [
            UserRole.PLATFORM_ADMIN,
            UserRole.SUPER_ADMIN,
            UserRole.SCHOOL_ADMIN,
            UserRole.PRINCIPAL,
            UserRole.FINANCE_LEAD,
            UserRole.ACCOUNTANT,
            UserRole.PARENT,
        ]) {
            expect(evaluateCapability('payments', {
                activeModules: ['FEES'],
                institutionType: 'K12',
                hasPermission: (permission) => hasPermission(role, permission),
            })).toMatchObject({ available: true });
        }

        expect(evaluateCapability('payments', {
            activeModules: ['FEES'],
            institutionType: 'K12',
            hasPermission: (permission) => hasPermission(UserRole.TEACHER, permission),
        })).toMatchObject({ available: false, reason: 'FORBIDDEN' });
    });

    it('uses the most-specific page and API prefix without partial-segment matches', () => {
        expect(findCapabilityForRoute('/hq/compliance/export')?.id).toBe('compliance');
        expect(findCapabilityForRoute('/student/ai-tutor')?.id).toBe('ai');
        expect(findCapabilityForRoute('/fees/intelligence')?.id).toBe('ai');
        expect(findCapabilityForRoute('/teacher/students/student-1/welfare')?.id).toBe('ai');
        expect(findCapabilityForRoute('/teacher/messages')?.id).toBe('communications');
        expect(findCapabilityForRoute('/chatty')).toBeNull();
        expect(findCapabilityForApiPath('/api/agents/jobs/123')?.id).toBe('ai');
        expect(findCapabilityForApiPath('/api/exports/udise-plus')?.id).toBe('compliance');
        expect(findCapabilityForApiPath('/api/agent-webhook')).toBeNull();
    });

    it('builds conservative admin navigation from the same capability registry', () => {
        const navigation = buildAdminNavigation({
            activeModules: ['FEES'],
            institutionType: 'K12',
            configuredProviders: [],
            hasPermission: (permission) => hasPermission(UserRole.SCHOOL_ADMIN, permission),
        }, UserRole.SCHOOL_ADMIN);
        const items = navigation.flatMap((group) => group.items);
        const hrefs = items.map((item) => item.href);

        expect(hrefs).toEqual(expect.arrayContaining([
            '/dashboard',
            '/admissions',
            '/attendance',
            '/exams',
            '/fees',
            '/settings/grading',
        ]));
        expect(hrefs).not.toEqual(expect.arrayContaining([
            '/analytics',
            '/automation',
            '/credentials',
            '/health',
            '/marketplace',
        ]));

        for (const item of items) {
            expect(findCapabilityForRoute(item.href)?.id).toBe(item.capabilityId);
        }
    });
});
