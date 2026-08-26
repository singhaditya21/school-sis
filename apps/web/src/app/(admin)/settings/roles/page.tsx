import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/constants';
import { UserRole, getPermissionsForRole } from '@/lib/rbac/permissions';

export const dynamic = 'force-dynamic';

/**
 * Read-only view of the permission matrix that is actually enforced.
 *
 * This page previously rendered an editable checkbox matrix backed by a
 * hardcoded list, with a Save button that persisted nothing and reported
 * success. The permissions shown there did not even share a naming scheme with
 * the ones the server enforces. It now renders the real matrix from
 * getPermissionsForRole() and does not pretend to be editable.
 */

type RoleGroup = { role: string; label: string; resources: { resource: string; actions: string[] }[]; total: number };

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

export default function RoleManagementPage() {
    const roles: RoleGroup[] = Object.values(UserRole).map((role) => {
        const permissions = getPermissionsForRole(role);
        return {
            role,
            label: ROLE_LABELS[role] || role,
            resources: groupByResource(permissions),
            total: permissions.length,
        };
    });

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Role Permissions</h1>
                <p className="text-muted-foreground">
                    The permissions each role is granted, as enforced by the server
                </p>
            </div>

            <div className="p-4 border rounded-lg bg-muted/40">
                <p className="text-sm text-muted-foreground">
                    Role permissions are fixed in this release and defined in code, so they are shown
                    here for reference rather than as editable settings. To change what a role can do,
                    a developer must update the authorization policy and ship it — that keeps every
                    change reviewed and traceable. Ask your implementation contact if you need a
                    different arrangement for your school.
                </p>
            </div>

            <div className="grid gap-4">
                {roles.map((entry) => (
                    <Card key={entry.role}>
                        <CardHeader>
                            <div className="flex items-center justify-between gap-4 flex-wrap">
                                <div className="flex items-center gap-3">
                                    <Badge className={ROLE_COLORS[entry.role] || ''}>{entry.label}</Badge>
                                    <CardTitle className="text-base font-mono">{entry.role}</CardTitle>
                                </div>
                                <CardDescription>
                                    {entry.total} {entry.total === 1 ? 'permission' : 'permissions'}
                                </CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {entry.resources.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No permissions granted.</p>
                            ) : (
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {entry.resources.map(({ resource, actions }) => (
                                        <div key={resource} className="space-y-1">
                                            <p className="text-sm font-medium capitalize">{resource.replace(/_/g, ' ')}</p>
                                            <div className="flex flex-wrap gap-1">
                                                {actions.map((action) => (
                                                    <Badge key={action} variant="outline" className="font-mono text-xs">
                                                        {action}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
