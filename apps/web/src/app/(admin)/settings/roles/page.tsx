import { redirect } from 'next/navigation';
import { ROLE_LABELS } from '@/lib/constants';
import { requireAuth } from '@/lib/auth/middleware';
import { UserRole, getPermissionsForRole, hasPermission } from '@/lib/rbac/permissions';
import {
    listTenantObjectCatalog,
    listTenantRolesWithPermissions,
} from '@/lib/actions/lcnc-platform';
import RolesStudioClient, { type SystemRolePreset } from './roles-studio-client';

export const dynamic = 'force-dynamic';

function groupByResource(permissions: readonly string[]) {
    const byResource = new Map<string, string[]>();
    for (const permission of [...permissions].sort()) {
        const [resource, action = ''] = permission.split(':');
        if (!byResource.has(resource)) byResource.set(resource, []);
        byResource.get(resource)!.push(action);
    }
    return [...byResource.entries()]
        .map(([resource, actions]) => ({ resource, actions }))
        .sort((a, b) => a.resource.localeCompare(b.resource));
}

export default async function RoleManagementPage() {
    let auth;
    try {
        auth = await requireAuth('settings:read');
    } catch {
        redirect('/unauthorized');
    }

    const systemRoles: SystemRolePreset[] = Object.values(UserRole).map(role => {
        const permissions = getPermissionsForRole(role);
        return {
            role,
            label: ROLE_LABELS[role] || role,
            permissions: [...permissions],
            resources: groupByResource(permissions),
            total: permissions.length,
        };
    });

    const [customRolesRes, objectCatalogRes] = await Promise.all([
        listTenantRolesWithPermissions(),
        listTenantObjectCatalog().catch(() => ({ success: false, objects: [] })),
    ]);

    const canManageRoles =
        hasPermission(auth.session.role as UserRole, 'settings:write') ||
        auth.session.role === 'SCHOOL_ADMIN' ||
        auth.session.role === 'SUPER_ADMIN' ||
        auth.session.role === 'PLATFORM_ADMIN';

    const availableObjects = objectCatalogRes.objects
        .filter(o => o.isEnabled)
        .map(o => ({
            apiName: o.apiName,
            name: o.name,
            isCustom: o.isCustom,
        }));

    return (
        <RolesStudioClient
            systemRoles={systemRoles}
            initialCustomRoles={customRolesRes.roles}
            availableObjects={availableObjects}
            canManageRoles={canManageRoles}
        />
    );
}
