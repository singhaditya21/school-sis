import {
    ADMIN_AUTHORIZATION_ROLES,
    AUTHORIZATION_APPROVAL_POLICIES,
    AUTHORIZATION_FIELD_POLICIES,
    AUTHORIZATION_ROLE_PERMISSIONS,
    AUTHORIZATION_ROUTE_POLICIES,
    STAFF_AUTHORIZATION_ROLES,
} from './policy';
import {
    AUTHORIZATION_ROLE_VALUES,
    type ApprovalPolicy,
    type AuthorizationContext,
    type AuthorizationDecision,
    type AuthorizationRole,
    type AuthorizationScope,
    type FieldPolicy,
    type PermissionGrant,
    type PermissionParts,
    type ResourceAccessRequest,
    type RoutePolicy,
} from './types';

const WRITE_ACTIONS = new Set([
    'write',
    'create',
    'update',
    'delete',
    'archive',
    'review',
    'approve',
    'assign',
    'lock',
    'send',
    'fine',
    'issue',
    'revoke',
    'collect',
    'manage',
    'refund',
    'cancel',
    'waive',
    'publish',
]);

const RESOURCE_ALIASES: Record<string, string> = {
    communication: 'communications',
    messages: 'messaging',
    student: 'students',
    staff: 'hr',
    certificates: 'certificate',
};

const SCOPE_RANK: Record<AuthorizationScope, number> = {
    own: 0,
    assigned: 1,
    class: 2,
    department: 3,
    tenant: 4,
    platform: 5,
};

export function isAuthorizationRole(role: string): role is AuthorizationRole {
    return (AUTHORIZATION_ROLE_VALUES as readonly string[]).includes(role);
}

export function isAdminAuthorizationRole(role: string): role is AuthorizationRole {
    return isAuthorizationRole(role) && (ADMIN_AUTHORIZATION_ROLES as readonly string[]).includes(role);
}

export function isStaffAuthorizationRole(role: string): role is AuthorizationRole {
    return isAuthorizationRole(role) && (STAFF_AUTHORIZATION_ROLES as readonly string[]).includes(role);
}

export function parsePermission(permission: string): PermissionParts {
    if (permission === '*') {
        return { resource: '*', action: '*' };
    }

    const [resource = '', action = '', scope] = permission.split(':');
    const parsedScope = isAuthorizationScope(scope) ? scope : undefined;

    return {
        resource,
        action,
        scope: parsedScope,
    };
}

export function formatPermissionGrant(grant: PermissionGrant): string {
    if (grant.requiresExplicitScope) {
        return `${grant.permission}:${grant.scope}`;
    }
    return grant.permission;
}

export function getPermissionGrantsForRole(role: string): readonly PermissionGrant[] {
    if (!isAuthorizationRole(role)) return [];
    return AUTHORIZATION_ROLE_PERMISSIONS[role];
}

export function getRolePermissionStrings(role: string): readonly string[] {
    return getPermissionGrantsForRole(role).map(formatPermissionGrant);
}

export function getApprovalPolicy(id: string): ApprovalPolicy | null {
    return AUTHORIZATION_APPROVAL_POLICIES.find((policy) => policy.id === id) ?? null;
}

export function getFieldPolicy(resource: string): FieldPolicy | null {
    const normalizedResource = normalizeResource(resource);
    return AUTHORIZATION_FIELD_POLICIES.find((policy) => normalizeResource(policy.resource) === normalizedResource) ?? null;
}

export function findRoutePolicy(route: string): RoutePolicy | null {
    const matching = AUTHORIZATION_ROUTE_POLICIES
        .filter((policy) => route === policy.prefix || route.startsWith(`${policy.prefix}/`))
        .sort((left, right) => right.prefix.length - left.prefix.length);

    return matching[0] ?? null;
}

export function permissionMatches(grantPermission: string, requestedPermission: string): boolean {
    if (grantPermission === '*') return true;

    const grantParts = parsePermission(grantPermission);
    const requestedParts = parsePermission(requestedPermission);

    if (!resourceMatches(grantParts.resource, requestedParts.resource)) {
        return false;
    }

    return actionMatches(grantParts.action, requestedParts.action);
}

export function scopeSatisfies(grantScope: AuthorizationScope, requiredScope: AuthorizationScope): boolean {
    if (grantScope === requiredScope) return true;
    if (grantScope === 'platform') return true;
    if (requiredScope === 'platform') return false;

    return SCOPE_RANK[grantScope] >= SCOPE_RANK[requiredScope];
}

export function hasFineGrainedPermission(
    role: string,
    permission: string,
    requiredScope?: AuthorizationScope,
): boolean {
    const requestedScope = inferRequiredScope(permission, requiredScope);

    return getPermissionGrantsForRole(role).some((candidate) => {
        if (!permissionMatches(candidate.permission, permission)) return false;

        if (!requestedScope) {
            return !candidate.requiresExplicitScope;
        }

        return scopeSatisfies(candidate.scope, requestedScope);
    });
}

export function evaluateAccess(
    context: AuthorizationContext,
    request: ResourceAccessRequest,
): AuthorizationDecision {
    if (!isAuthorizationRole(context.role)) {
        return deny(`Unknown role: ${context.role}`);
    }

    if (isCrossTenantAccess(context, request) && context.role !== 'PLATFORM_ADMIN') {
        return deny('Cross-tenant access requires PLATFORM_ADMIN.');
    }

    const requiredScope = inferRequiredScope(request.permission, request.requiredScope);
    const matchedGrant = getPermissionGrantsForRole(context.role).find((candidate) => {
        if (!permissionMatches(candidate.permission, request.permission)) return false;
        if (!requiredScope) return !candidate.requiresExplicitScope;
        return scopeSatisfies(candidate.scope, requiredScope);
    });

    if (!matchedGrant) {
        return deny(`Role ${context.role} is missing ${request.permission}.`);
    }

    const scopeDecision = enforceScope(context, request, matchedGrant.scope);
    if (!scopeDecision.allowed) {
        return scopeDecision;
    }

    const deniedFields = getDeniedFields(
        context,
        request.resource ?? parsePermission(request.permission).resource,
        request.operation ?? operationFromPermission(request.permission),
        request.fields ?? [],
    );

    if (deniedFields.length > 0) {
        return deny('Field policy denied one or more requested fields.', {
            matchedPermission: matchedGrant.permission,
            scope: matchedGrant.scope,
            deniedFields,
        });
    }

    const approvalRequired = request.approvalPolicyId ? getApprovalPolicy(request.approvalPolicyId) ?? undefined : undefined;

    return {
        allowed: true,
        matchedPermission: matchedGrant.permission,
        scope: matchedGrant.scope,
        approvalRequired,
    };
}

export function assertAuthorized(context: AuthorizationContext, request: ResourceAccessRequest): AuthorizationDecision {
    const decision = evaluateAccess(context, request);
    if (!decision.allowed) {
        throw new Error(decision.reason ?? 'Forbidden');
    }
    return decision;
}

export function getDeniedFields(
    context: AuthorizationContext,
    resource: string,
    operation: 'read' | 'create' | 'update' | 'delete' | 'export',
    fields: readonly string[],
): readonly string[] {
    if (!isAuthorizationRole(context.role) || fields.length === 0) return [];

    const fieldPolicy = getFieldPolicy(resource);
    if (!fieldPolicy) return [];

    return fields.filter((field) => !canAccessField(context.role, fieldPolicy, field, operation));
}

export function canAccessField(
    role: string,
    fieldPolicy: FieldPolicy,
    field: string,
    operation: 'read' | 'create' | 'update' | 'delete' | 'export',
): boolean {
    if (!isAuthorizationRole(role)) return false;
    if (!fieldPolicy.fields.includes(field)) return true;

    const allowedRoles = operation === 'read' || operation === 'export'
        ? fieldPolicy.readRoles
        : fieldPolicy.writeRoles;

    return allowedRoles.includes(role);
}

function enforceScope(
    context: AuthorizationContext,
    request: ResourceAccessRequest,
    grantScope: AuthorizationScope,
): AuthorizationDecision {
    if (grantScope === 'platform') {
        return context.role === 'PLATFORM_ADMIN'
            ? allow(grantScope)
            : deny('Platform scope requires PLATFORM_ADMIN.', { scope: grantScope });
    }

    if (grantScope === 'tenant') {
        if (request.resourceTenantId && context.tenantId && request.resourceTenantId !== context.tenantId) {
            return deny('Resource tenant does not match session tenant.', { scope: grantScope });
        }
        if (!context.tenantId && request.resourceTenantId) {
            return deny('Tenant-scoped access requires a session tenant.', { scope: grantScope });
        }
        return allow(grantScope);
    }

    if (grantScope === 'department') {
        if (!context.departmentId || !request.departmentId || context.departmentId !== request.departmentId) {
            return deny('Department-scoped access requires a matching department.', { scope: grantScope });
        }
        return allow(grantScope);
    }

    if (grantScope === 'class') {
        if (!context.userId || !request.teacherUserIds?.includes(context.userId)) {
            return deny('Class-scoped access requires an assigned teacher.', { scope: grantScope });
        }
        return allow(grantScope);
    }

    if (grantScope === 'assigned') {
        if (!context.userId || request.assignedUserId !== context.userId) {
            return deny('Assigned access requires the current user to own the assignment.', { scope: grantScope });
        }
        return allow(grantScope);
    }

    if (!context.userId) {
        return deny('Own-scoped access requires a session user.', { scope: grantScope });
    }

    const isOwner = request.ownerUserId === context.userId;
    const isGuardian = request.guardianUserIds?.includes(context.userId) ?? false;

    return isOwner || isGuardian
        ? allow(grantScope)
        : deny('Own-scoped access requires owner or guardian ownership.', { scope: grantScope });
}

function operationFromPermission(permission: string): 'read' | 'create' | 'update' | 'delete' | 'export' {
    const action = parsePermission(permission).action;
    if (action === 'read') return 'read';
    if (action === 'create') return 'create';
    if (action === 'delete' || action === 'archive') return 'delete';
    if (action === 'export') return 'export';
    return 'update';
}

function inferRequiredScope(permission: string, requiredScope?: AuthorizationScope): AuthorizationScope | undefined {
    if (requiredScope) return requiredScope;

    const parsedPermission = parsePermission(permission);
    if (parsedPermission.scope) return parsedPermission.scope;
    if (parsedPermission.resource === 'platform') return 'platform';

    return undefined;
}

function isCrossTenantAccess(context: AuthorizationContext, request: ResourceAccessRequest): boolean {
    return Boolean(context.tenantId && request.resourceTenantId && context.tenantId !== request.resourceTenantId);
}

function actionMatches(grantAction: string, requestedAction: string): boolean {
    if (grantAction === '*' || grantAction === requestedAction) return true;
    if (grantAction === 'write' && WRITE_ACTIONS.has(requestedAction)) return true;
    return false;
}

function resourceMatches(grantResource: string, requestedResource: string): boolean {
    if (grantResource === '*' || grantResource === requestedResource) return true;
    return normalizeResource(grantResource) === normalizeResource(requestedResource);
}

function normalizeResource(resource: string): string {
    return RESOURCE_ALIASES[resource] ?? resource;
}

function isAuthorizationScope(value: string | undefined): value is AuthorizationScope {
    return value === 'platform'
        || value === 'tenant'
        || value === 'department'
        || value === 'class'
        || value === 'assigned'
        || value === 'own';
}

function allow(scope: AuthorizationScope): AuthorizationDecision {
    return { allowed: true, scope };
}

function deny(reason: string, extra: Partial<AuthorizationDecision> = {}): AuthorizationDecision {
    return {
        allowed: false,
        reason,
        ...extra,
    };
}
