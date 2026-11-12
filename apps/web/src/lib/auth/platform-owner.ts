/**
 * Canonical Platform Owner & Tenant Workspace Governance Constants.
 *
 * Pure module (safe for both Server Actions/Routes and Client Components):
 * - `singhaditya21@gmail.com` is the sole permanent full Platform Administrator
 *   (`PLATFORM_ADMIN` bound exclusively to the `HQ` tenant).
 * - Every other organization and user in ScholarMind is an isolated tenant.
 */

export const PERMANENT_PLATFORM_ADMIN_EMAIL = 'singhaditya21@gmail.com';
export const PLATFORM_HQ_TENANT_CODE = 'HQ';
export const PLATFORM_HQ_COMPANY_NAME = 'ScholarMind HQ';
export const DEMO_SANDBOX_TENANT_CODE = 'DEMO-CAMPUS';
export const DEMO_SANDBOX_SOUTH_TENANT_CODE = 'DEMO-CAMPUS-SOUTH';
export const DEMO_SANDBOX_COMPANY_NAME = 'Delhi Heritage Public School (Sandbox)';

export const CORE_DEFAULT_MODULES = [
    'ATTENDANCE',
    'FEES',
    'COMMUNICATION',
] as const;

export const AI_PRO_DEFAULT_MODULES = [
    'ATTENDANCE',
    'FEES',
    'COMMUNICATION',
    'AI_AGENTS',
] as const;

export const PLATFORM_ALL_MODULES = [
    'ATTENDANCE',
    'FEES',
    'COMMUNICATION',
    'AI_AGENTS',
    'HIGHER_ED',
    'COACHING',
    'INTERNATIONAL',
    'MULTI_CAMPUS',
    'ENTERPRISE',
] as const;

export const RESERVED_WORKSPACE_CODES = new Set([
    'HQ',
    'WWW',
    'API',
    'ADMIN',
    'PLATFORM',
    'APP',
    'OPERATOR',
    'AUTH',
    'SETUP',
    'LOGIN',
    'REGISTER',
    'PRICING',
    'UPGRADE',
    'BILLING',
    'MAIL',
    'SMTP',
    'STATUS',
    'DOCS',
    'PORTAL',
    'SCHOLARMIND',
    'SYSTEM',
    'ROOT',
    'SUPPORT',
    'DEMO',
    'DEMO-CAMPUS',
    'DEMO-CAMPUS-SOUTH',
    'SANDBOX',
]);

export function canonicalizeEmailIdentity(email: string | null | undefined): string {
    if (!email) return '';
    const normalized = email.trim().toLowerCase();
    const atIndex = normalized.indexOf('@');
    if (atIndex <= 0 || atIndex !== normalized.lastIndexOf('@')) {
        return normalized;
    }

    let localPart = normalized.slice(0, atIndex);
    let domainPart = normalized.slice(atIndex + 1);
    if (domainPart === 'gmail.com' || domainPart === 'googlemail.com') {
        const plusIndex = localPart.indexOf('+');
        if (plusIndex !== -1) {
            localPart = localPart.slice(0, plusIndex);
        }
        localPart = localPart.replace(/\./g, '');
        domainPart = 'gmail.com';
    }

    if (!localPart || !domainPart) {
        return normalized;
    }
    return `${localPart}@${domainPart}`;
}

export function isPermanentPlatformAdminEmail(email: string | null | undefined): boolean {
    if (!email) return false;
    return canonicalizeEmailIdentity(email) === PERMANENT_PLATFORM_ADMIN_EMAIL;
}

export function normalizeWorkspaceCode(value: string | null | undefined): string {
    return (value || '').trim().toUpperCase();
}

export function isReservedWorkspaceCode(code: string | null | undefined): boolean {
    const normalized = normalizeWorkspaceCode(code);
    if (!normalized) return true;
    return RESERVED_WORKSPACE_CODES.has(normalized);
}

export function modulesForSubscriptionTier(
    tier: 'CORE' | 'AI_PRO' | 'ENTERPRISE' | string | null | undefined,
): string[] {
    switch (tier) {
        case 'ENTERPRISE':
            return [...PLATFORM_ALL_MODULES];
        case 'AI_PRO':
            return [...AI_PRO_DEFAULT_MODULES];
        case 'CORE':
        default:
            return [...CORE_DEFAULT_MODULES];
    }
}
