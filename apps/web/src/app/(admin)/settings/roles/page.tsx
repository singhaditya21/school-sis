'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ROLES, ROLE_LABELS, ROLE_COLORS } from '@/lib/constants';

interface Permission {
    id: string;
    name: string;
    description: string;
    module: string;
}

interface RolePermission {
    role: string;
    permissions: string[];
}

// System permissions
const permissions: Permission[] = [
    // Dashboard
    { id: 'dashboard.view', name: 'View Dashboard', description: 'Access main dashboard', module: 'Dashboard' },
    { id: 'dashboard.analytics', name: 'View Analytics', description: 'Access analytics data', module: 'Dashboard' },
    // Students
    { id: 'students.view', name: 'View Students', description: 'View student list', module: 'Students' },
    { id: 'students.create', name: 'Create Students', description: 'Add new students', module: 'Students' },
    { id: 'students.edit', name: 'Edit Students', description: 'Modify student data', module: 'Students' },
    { id: 'students.delete', name: 'Delete Students', description: 'Remove students', module: 'Students' },
    // Fees
    { id: 'fees.view', name: 'View Fees', description: 'View fee details', module: 'Fees' },
    { id: 'fees.collect', name: 'Collect Fees', description: 'Record fee payments', module: 'Fees' },
    { id: 'fees.reports', name: 'Fee Reports', description: 'Access fee reports', module: 'Fees' },
    { id: 'fees.configure', name: 'Configure Fees', description: 'Setup fee structures', module: 'Fees' },
    // Users
    { id: 'users.view', name: 'View Users', description: 'View user list', module: 'Users' },
    { id: 'users.create', name: 'Create Users', description: 'Add new users', module: 'Users' },
    { id: 'users.edit', name: 'Edit Users', description: 'Modify user data', module: 'Users' },
    { id: 'users.delete', name: 'Delete Users', description: 'Remove users', module: 'Users' },
    // Exams
    { id: 'exams.view', name: 'View Exams', description: 'View exam schedules', module: 'Exams' },
    { id: 'exams.manage', name: 'Manage Exams', description: 'Create/edit exams', module: 'Exams' },
    { id: 'exams.marks', name: 'Enter Marks', description: 'Enter student marks', module: 'Exams' },
    // Settings
    { id: 'settings.view', name: 'View Settings', description: 'View system settings', module: 'Settings' },
    { id: 'settings.edit', name: 'Edit Settings', description: 'Modify settings', module: 'Settings' },
];

// Default role permissions
const defaultRolePermissions: RolePermission[] = [
    {
        role: 'SUPER_ADMIN',
        permissions: permissions.map(p => p.id), // All permissions
    },
    {
        role: 'SCHOOL_ADMIN',
        permissions: permissions.filter(p => !p.id.includes('users.delete')).map(p => p.id),
    },
    {
        role: 'PRINCIPAL',
        permissions: ['dashboard.view', 'dashboard.analytics', 'students.view', 'students.edit', 'fees.view', 'fees.reports', 'exams.view', 'exams.manage', 'settings.view'],
    },
    {
        role: 'ACCOUNTANT',
        permissions: ['dashboard.view', 'students.view', 'fees.view', 'fees.collect', 'fees.reports', 'fees.configure'],
    },
    {
        role: 'TEACHER',
        permissions: ['dashboard.view', 'students.view', 'exams.view', 'exams.marks'],
    },
    {
        role: 'TRANSPORT_MANAGER',
        permissions: ['dashboard.view', 'students.view'],
    },
    {
        role: 'PARENT',
        permissions: ['dashboard.view'],
    },
    {
        role: 'STUDENT',
        permissions: ['dashboard.view'],
    },
];

export default function RoleManagementPage() {
    const [rolePermissions, setRolePermissions] = useState<RolePermission[]>(defaultRolePermissions);
    const [selectedRole, setSelectedRole] = useState<string>('SUPER_ADMIN');
    const [hasChanges, setHasChanges] = useState(false);

    const modules = [...new Set(permissions.map(p => p.module))];

    const currentRolePerms = rolePermissions.find(rp => rp.role === selectedRole)?.permissions || [];

    const togglePermission = (permissionId: string) => {
        setRolePermissions(prev => prev.map(rp => {
            if (rp.role !== selectedRole) return rp;
            const hasPermission = rp.permissions.includes(permissionId);
            return {
                ...rp,
                permissions: hasPermission
                    ? rp.permissions.filter(p => p !== permissionId)
                    : [...rp.permissions, permissionId]
            };
        }));
        setHasChanges(true);
    };

    const handleSave = () => {
        // TODO: Call API to save role permissions
        setHasChanges(false);
        alert('Permissions saved successfully!');
    };

    const getPermissionsByModule = (module: string) =>
        permissions.filter(p => p.module === module);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Role Management</h1>
                    <p className="text-muted-foreground">
                        Configure permissions for each role
                    </p>
                </div>
                <Button onClick={handleSave} disabled={!hasChanges}>
                    {hasChanges ? 'Save Changes' : 'All Saved'}
                </Button>
            </div>

            <div className="grid lg:grid-cols-4 gap-6">
                {/* Role Selector */}
                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="text-lg">Roles</CardTitle>
                        <CardDescription>Select a role to configure</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {Object.entries(ROLES).map(([key, value]) => (
                            <button
                                key={key}
                                onClick={() => setSelectedRole(value)}
                                className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedRole === value
                                        ? 'border-primary bg-primary/5'
                                        : 'border-transparent hover:bg-muted'
                                    }`}
                            >
                                <Badge className={ROLE_COLORS[value] || ''}>
                                    {ROLE_LABELS[value] || value}
                                </Badge>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {currentRolePerms.length > 0 && selectedRole === value
                                        ? `${rolePermissions.find(rp => rp.role === value)?.permissions.length || 0} permissions`
                                        : ''}
                                </p>
                            </button>
                        ))}
                    </CardContent>
                </Card>

                {/* Permissions Matrix */}
                <Card className="lg:col-span-3">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            Permissions for
                            <Badge className={ROLE_COLORS[selectedRole] || ''}>
                                {ROLE_LABELS[selectedRole] || selectedRole}
                            </Badge>
                        </CardTitle>
                        <CardDescription>
                            Toggle permissions on or off for this role
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Tabs defaultValue={modules[0]} className="w-full">
                            <TabsList className="mb-4">
                                {modules.map(module => (
                                    <TabsTrigger key={module} value={module}>
                                        {module}
                                    </TabsTrigger>
                                ))}
                            </TabsList>

                            {modules.map(module => (
                                <TabsContent key={module} value={module}>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-[50px]">Enable</TableHead>
                                                <TableHead>Permission</TableHead>
                                                <TableHead>Description</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {getPermissionsByModule(module).map((permission) => (
                                                <TableRow key={permission.id}>
                                                    <TableCell>
                                                        <Checkbox
                                                            checked={currentRolePerms.includes(permission.id)}
                                                            onCheckedChange={() => togglePermission(permission.id)}
                                                            disabled={selectedRole === 'SUPER_ADMIN'}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="font-medium">
                                                        {permission.name}
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground">
                                                        {permission.description}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TabsContent>
                            ))}
                        </Tabs>

                        {selectedRole === 'SUPER_ADMIN' && (
                            <p className="text-sm text-muted-foreground mt-4">
                                ⚠️ Super Admin has all permissions and cannot be modified.
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Permissions Summary */}
            <Card>
                <CardHeader>
                    <CardTitle>All Roles Overview</CardTitle>
                    <CardDescription>Quick view of permissions across all roles</CardDescription>
                </CardHeader>
                <CardContent className="overflow-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="sticky left-0 bg-background">Permission</TableHead>
                                {Object.values(ROLES).map(role => (
                                    <TableHead key={role} className="text-center min-w-[100px]">
                                        <Badge variant="outline" className="text-xs">
                                            {ROLE_LABELS[role]?.split(' ')[0] || role}
                                        </Badge>
                                    </TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {permissions.slice(0, 8).map(permission => (
                                <TableRow key={permission.id}>
                                    <TableCell className="sticky left-0 bg-background font-medium">
                                        {permission.name}
                                    </TableCell>
                                    {Object.values(ROLES).map(role => {
                                        const hasPermission = rolePermissions
                                            .find(rp => rp.role === role)
                                            ?.permissions.includes(permission.id);
                                        return (
                                            <TableCell key={role} className="text-center">
                                                {hasPermission ? (
                                                    <span className="text-green-600">✓</span>
                                                ) : (
                                                    <span className="text-red-400">✗</span>
                                                )}
                                            </TableCell>
                                        );
                                    })}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
