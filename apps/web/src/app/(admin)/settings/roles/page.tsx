'use client';

import { useMemo, useState } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/constants';
import { getPermissionsForRole, UserRole } from '@/lib/rbac/permissions';

const roles = Object.values(UserRole);

function displayToken(value: string): string {
    if (value === '*') return 'All';
    return value
        .replaceAll('_', ' ')
        .replace(/\b\w/g, character => character.toUpperCase());
}

function permissionParts(permission: string) {
    if (permission === '*') {
        return {
            resource: 'All resources',
            action: 'All actions',
            scope: 'Policy-defined',
        };
    }

    const [resource = '', action = '', explicitScope] = permission.split(':');
    return {
        resource: displayToken(resource),
        action: displayToken(action),
        scope: explicitScope ? displayToken(explicitScope) : 'Policy-defined',
    };
}

export default function RoleManagementPage() {
    const [selectedRole, setSelectedRole] = useState<UserRole>(UserRole.SUPER_ADMIN);
    const currentPermissions = useMemo(
        () => [...getPermissionsForRole(selectedRole)],
        [selectedRole],
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">System Role Permissions</h1>
                    <p className="text-muted-foreground">
                        Canonical authorization policy currently enforced by ScholarMind.
                    </p>
                </div>
                <Badge variant="outline" className="w-fit gap-1.5">
                    <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
                    Read-only policy
                </Badge>
            </div>

            <div role="note" className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <div>
                    <p className="font-semibold">Permission editing is not available on this page.</p>
                    <p className="mt-1 text-blue-800">
                        System permissions are code-defined. User role assignments must use the audited <code>users.role_change</code> approval workflow.
                    </p>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-4">
                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="text-lg">Roles</CardTitle>
                        <CardDescription>Select a role to inspect its enforced grants.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {roles.map(role => {
                            const permissionCount = getPermissionsForRole(role).length;
                            return (
                                <button
                                    type="button"
                                    key={role}
                                    aria-pressed={selectedRole === role}
                                    onClick={() => setSelectedRole(role)}
                                    className={`w-full rounded-lg border p-3 text-left transition-colors ${selectedRole === role
                                        ? 'border-primary bg-primary/5'
                                        : 'border-transparent hover:bg-muted'
                                    }`}
                                >
                                    <Badge className={ROLE_COLORS[role] || ''}>
                                        {ROLE_LABELS[role] || displayToken(role)}
                                    </Badge>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {permissionCount} canonical {permissionCount === 1 ? 'grant' : 'grants'}
                                    </p>
                                </button>
                            );
                        })}
                    </CardContent>
                </Card>

                <Card className="lg:col-span-3">
                    <CardHeader>
                        <CardTitle className="flex flex-wrap items-center gap-2">
                            Enforced grants for
                            <Badge className={ROLE_COLORS[selectedRole] || ''}>
                                {ROLE_LABELS[selectedRole] || displayToken(selectedRole)}
                            </Badge>
                        </CardTitle>
                        <CardDescription>
                            Values below come directly from the shared authorization policy. Scope is labelled only when it is explicit in the canonical permission key.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="overflow-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Resource</TableHead>
                                    <TableHead>Action</TableHead>
                                    <TableHead>Scope</TableHead>
                                    <TableHead>Canonical permission</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {currentPermissions.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                                            No grants are defined for this role.
                                        </TableCell>
                                    </TableRow>
                                ) : currentPermissions.map(permission => {
                                    const parts = permissionParts(permission);
                                    return (
                                        <TableRow key={permission}>
                                            <TableCell className="font-medium">{parts.resource}</TableCell>
                                            <TableCell>{parts.action}</TableCell>
                                            <TableCell>{parts.scope}</TableCell>
                                            <TableCell>
                                                <code className="rounded bg-muted px-2 py-1 text-xs">{permission}</code>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Role Policy Overview</CardTitle>
                    <CardDescription>Coverage summary generated from the same enforced policy.</CardDescription>
                </CardHeader>
                <CardContent className="overflow-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Role</TableHead>
                                <TableHead className="text-right">Canonical grants</TableHead>
                                <TableHead>Access model</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {roles.map(role => {
                                const grants = getPermissionsForRole(role);
                                return (
                                    <TableRow key={role}>
                                        <TableCell>
                                            <Badge variant="outline">{ROLE_LABELS[role] || displayToken(role)}</Badge>
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">{grants.length}</TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {grants.includes('*') ? 'Full policy access within the configured scope' : 'Explicit least-privilege grants'}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
