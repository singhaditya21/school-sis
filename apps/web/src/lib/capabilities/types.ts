export const CAPABILITY_LIFECYCLES = ['HIDDEN', 'INTERNAL', 'PILOT', 'GA'] as const;

export type CapabilityLifecycle = (typeof CAPABILITY_LIFECYCLES)[number];

export const INSTITUTION_TYPES = ['K12', 'COLLEGE', 'UNIVERSITY', 'COACHING', 'HYBRID'] as const;

export type InstitutionType = (typeof INSTITUTION_TYPES)[number];

export const PROVIDER_REQUIREMENTS = [
    'AI',
    'MESSAGING',
    'OBJECT_STORAGE',
    'PAYMENTS',
    'PUSH',
] as const;

export type ProviderRequirement = (typeof PROVIDER_REQUIREMENTS)[number];

export const CAPABILITY_IDS = [
    'core-sis',
    'portals',
    'payments',
    'communications',
    'group-governance',
    'international',
    'higher-education',
    'compliance',
    'coaching',
    'ai',
    'mobile',
    'integrations',
] as const;

export type CapabilityId = (typeof CAPABILITY_IDS)[number];

export type Permission = string;

export type CapabilityDefinition = {
    id: CapabilityId;
    lifecycle: CapabilityLifecycle;
    /** `BASE` is part of every authenticated tenant; all other values come from companies.active_modules. */
    entitlement: string;
    institutionTypes: readonly InstitutionType[];
    requiredPermissions: readonly Permission[];
    providerPrerequisites: readonly ProviderRequirement[];
    routes: readonly string[];
    apiPrefixes: readonly string[];
    owner: string;
};

export const CAPABILITY_UNAVAILABLE_REASONS = [
    'HIDDEN',
    'INTERNAL_ONLY',
    'NOT_ENTITLED',
    'INSTITUTION_UNSUPPORTED',
    'FORBIDDEN',
    'UNCONFIGURED',
] as const;

export type CapabilityUnavailableReason = (typeof CAPABILITY_UNAVAILABLE_REASONS)[number];

export type CapabilityDecision = {
    id: CapabilityId;
    lifecycle: CapabilityLifecycle;
    available: boolean;
    reason?: CapabilityUnavailableReason;
};

export type CapabilityEvaluationContext = {
    activeModules: readonly string[];
    institutionType?: InstitutionType | string | null;
    configuredProviders?: readonly ProviderRequirement[];
    hasPermission?: (permission: Permission) => boolean;
    allowInternal?: boolean;
};
