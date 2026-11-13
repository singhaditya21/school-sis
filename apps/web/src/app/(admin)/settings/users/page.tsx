'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { ROLES, ROLE_LABELS, ROLE_COLORS } from '@/lib/constants';
import { listUsers, createUser, updateUser, setUserActive, resetUserPassword, type AdminUser } from '@/lib/actions/users';
import {
    assignUserCustomRoleAction,
    listTenantRolesWithPermissions,
    type TenantCustomRoleItem,
} from '@/lib/actions/lcnc-platform';

export default function UserManagementPage() {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [customRoles, setCustomRoles] = useState<TenantCustomRoleItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<{
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: string;
        customRoleId: string;
    } | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState<string>('all');
    const [newUser, setNewUser] = useState({
        email: '',
        firstName: '',
        lastName: '',
        role: 'TEACHER',
        customRoleId: '__none__',
        password: '',
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        setLoading(true);
        setError(null);
        try {
            const [response, rolesRes] = await Promise.all([
                listUsers(),
                listTenantRolesWithPermissions().catch(() => ({ success: false, roles: [] })),
            ]);
            if (response.success && response.data) {
                setUsers(response.data);
            } else {
                setError(response.error ?? 'Failed to load users');
            }
            if (rolesRes.success) {
                setCustomRoles(rolesRes.roles.filter(r => r.isActive));
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load users');
        }
        setLoading(false);
    };

    const filteredUsers = users.filter(user => {
        const matchesSearch =
            user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
            user.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            user.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (user.customRoleName || '').toLowerCase().includes(searchQuery.toLowerCase());
        const matchesRole =
            roleFilter === 'all' ||
            user.role === roleFilter ||
            (roleFilter.startsWith('custom:') && user.customRoleId === roleFilter.slice(7));
        return matchesSearch && matchesRole;
    });

    const handleAddUser = async () => {
        setSaving(true);
        try {
            const response = await createUser({
                email: newUser.email,
                password: newUser.password,
                firstName: newUser.firstName,
                lastName: newUser.lastName,
                role: newUser.role,
            });

            if (response.success && response.data) {
                let created = response.data;
                if (newUser.customRoleId && newUser.customRoleId !== '__none__') {
                    const roleRes = await assignUserCustomRoleAction(
                        created.id,
                        newUser.customRoleId,
                    );
                    if (roleRes.success) {
                        const matched = customRoles.find(r => r.id === newUser.customRoleId);
                        created = {
                            ...created,
                            customRoleId: newUser.customRoleId,
                            customRoleName: matched?.name ?? null,
                            customRoleCode: matched?.code ?? null,
                        };
                    }
                }
                setUsers([created, ...users]);
                setNewUser({
                    email: '',
                    firstName: '',
                    lastName: '',
                    role: 'TEACHER',
                    customRoleId: '__none__',
                    password: '',
                });
                setIsAddDialogOpen(false);
                toast.success('User account created.');
            } else {
                toast.error(response.error || 'Failed to create user');
            }
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to create user');
        }
        setSaving(false);
    };

    const handleOpenEdit = (user: AdminUser) => {
        setEditingUser({
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            customRoleId: user.customRoleId || '__none__',
        });
        setIsEditDialogOpen(true);
    };

    const handleEditUser = async () => {
        if (!editingUser) return;
        setSaving(true);
        try {
            const response = await updateUser({
                userId: editingUser.id,
                email: editingUser.email,
                firstName: editingUser.firstName,
                lastName: editingUser.lastName,
                role: editingUser.role,
            });

            if (!response.success || !response.data) {
                toast.error(response.error || 'Failed to update user');
                setSaving(false);
                return;
            }

            const targetCustomId =
                editingUser.customRoleId && editingUser.customRoleId !== '__none__'
                    ? editingUser.customRoleId
                    : null;
            const customRes = await assignUserCustomRoleAction(editingUser.id, targetCustomId);
            if (!customRes.success) {
                toast.error(customRes.error || 'User updated, but custom role assignment failed.');
                setSaving(false);
                return;
            }

            const matchedCustom = targetCustomId
                ? customRoles.find(r => r.id === targetCustomId)
                : undefined;

            const updated: AdminUser = {
                ...response.data,
                customRoleId: targetCustomId,
                customRoleName: matchedCustom?.name ?? null,
                customRoleCode: matchedCustom?.code ?? null,
            };
            setUsers(users.map(u => (u.id === updated.id ? updated : u)));
            setIsEditDialogOpen(false);
            setEditingUser(null);
            toast.success('User profile & role permissions updated.');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to update user');
        }
        setSaving(false);
    };

    const handleToggleActive = async (userId: string, currentActive: boolean) => {
        const response = await setUserActive(userId, !currentActive);
        if (response.success) {
            setUsers(
                users.map(user =>
                    user.id === userId ? { ...user, active: !currentActive } : user,
                ),
            );
        } else {
            toast.error(response.error ?? 'Failed to update user');
        }
    };

    const handleResetPassword = async (userId: string) => {
        const response = await resetUserPassword(userId);
        if (response.success && response.data) {
            toast.success(
                `Temporary password: ${response.data.temporaryPassword}\n\nPlease share this securely with the user.`,
                { duration: 15000 },
            );
        } else {
            toast.error(response.error ?? 'Failed to reset password');
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
                    <p className="text-muted-foreground">
                        Manage school staff accounts, built-in system roles, and tenant-defined custom roles
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" asChild>
                        <Link href="/settings/roles">Configure Custom Roles</Link>
                    </Button>
                    <Button variant="outline" onClick={loadUsers} disabled={loading}>
                        {loading ? 'Loading...' : 'Refresh'}
                    </Button>
                    <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <span className="mr-2">+</span> Add User
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[500px]">
                            <DialogHeader>
                                <DialogTitle>Add New User</DialogTitle>
                                <DialogDescription>
                                    Create a new user account and optionally assign a tenant Custom Role.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="firstName">First Name</Label>
                                        <Input
                                            id="firstName"
                                            value={newUser.firstName}
                                            onChange={e =>
                                                setNewUser({ ...newUser, firstName: e.target.value })
                                            }
                                            placeholder="First name"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="lastName">Last Name</Label>
                                        <Input
                                            id="lastName"
                                            value={newUser.lastName}
                                            onChange={e =>
                                                setNewUser({ ...newUser, lastName: e.target.value })
                                            }
                                            placeholder="Last name"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={newUser.email}
                                        onChange={e =>
                                            setNewUser({ ...newUser, email: e.target.value })
                                        }
                                        placeholder="name@yourschool.edu"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="role">System Base Role</Label>
                                        <Select
                                            value={newUser.role}
                                            onValueChange={value =>
                                                setNewUser({ ...newUser, role: value })
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select role" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {Object.entries(ROLES).map(([key, value]) => (
                                                    <SelectItem key={key} value={value}>
                                                        {ROLE_LABELS[value] || value}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="customRole">Custom Tenant Role</Label>
                                        <Select
                                            value={newUser.customRoleId}
                                            onValueChange={value =>
                                                setNewUser({ ...newUser, customRoleId: value })
                                            }
                                        >
                                            <SelectTrigger id="customRole">
                                                <SelectValue placeholder="Optional custom role" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__none__">
                                                    None (Use System Base Role)
                                                </SelectItem>
                                                {customRoles.map(cr => (
                                                    <SelectItem key={cr.id} value={cr.id}>
                                                        {cr.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="password">Password</Label>
                                    <Input
                                        id="password"
                                        type="password"
                                        value={newUser.password}
                                        onChange={e =>
                                            setNewUser({ ...newUser, password: e.target.value })
                                        }
                                        placeholder="Set initial password (min 12 chars)"
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={handleAddUser} disabled={saving}>
                                    {saving ? 'Creating...' : 'Create User'}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Error/Info Banner */}
            {error && (
                <div className="p-4 bg-warning-subtle border border-border rounded-lg">
                    <p className="text-sm text-warning">{error}</p>
                </div>
            )}

            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle>Filters</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1">
                            <Input
                                placeholder="Search by name, email, or custom role..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <Select value={roleFilter} onValueChange={setRoleFilter}>
                            <SelectTrigger className="w-full sm:w-[240px]">
                                <SelectValue placeholder="Filter by role" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Roles</SelectItem>
                                {customRoles.map(cr => (
                                    <SelectItem key={cr.id} value={`custom:${cr.id}`}>
                                        Custom: {cr.name}
                                    </SelectItem>
                                ))}
                                {Object.entries(ROLES).map(([key, value]) => (
                                    <SelectItem key={key} value={value}>
                                        {ROLE_LABELS[value] || value}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Users Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Users ({filteredUsers.length})</CardTitle>
                    <CardDescription>
                        All registered users in your institution
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Effective Role</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Last Login</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredUsers.map(user => (
                                    <TableRow key={user.id}>
                                        <TableCell className="font-medium">
                                            {user.firstName} {user.lastName}
                                        </TableCell>
                                        <TableCell>{user.email}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <Badge className={ROLE_COLORS[user.role] || ''}>
                                                    {ROLE_LABELS[user.role] || user.role}
                                                </Badge>
                                                {user.customRoleName && (
                                                    <Badge variant="outline" className="border-primary text-primary">
                                                        Custom: {user.customRoleName}
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Switch
                                                    checked={user.active}
                                                    onCheckedChange={() =>
                                                        handleToggleActive(user.id, user.active)
                                                    }
                                                />
                                                <span
                                                    className={
                                                        user.active
                                                            ? 'text-success'
                                                            : 'text-destructive'
                                                    }
                                                >
                                                    {user.active ? 'Active' : 'Inactive'}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {user.lastLoginAt
                                                ? new Date(user.lastLoginAt).toLocaleDateString(
                                                      'en-IN',
                                                      { timeZone: 'Asia/Kolkata' },
                                                  )
                                                : 'Never'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleOpenEdit(user)}
                                                >
                                                    Edit
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleResetPassword(user.id)}
                                                >
                                                    Reset Password
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {filteredUsers.length === 0 && (
                                    <TableRow>
                                        <TableCell
                                            colSpan={6}
                                            className="text-center py-8 text-muted-foreground"
                                        >
                                            No users found matching your criteria
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Edit User Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Edit User &amp; Custom Role</DialogTitle>
                        <DialogDescription>
                            Update user profile, base system role, or assign a tenant Custom Role.
                        </DialogDescription>
                    </DialogHeader>
                    {editingUser && (
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="editFirstName">First Name</Label>
                                    <Input
                                        id="editFirstName"
                                        value={editingUser.firstName}
                                        onChange={e =>
                                            setEditingUser({
                                                ...editingUser,
                                                firstName: e.target.value,
                                            })
                                        }
                                        placeholder="First name"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="editLastName">Last Name</Label>
                                    <Input
                                        id="editLastName"
                                        value={editingUser.lastName}
                                        onChange={e =>
                                            setEditingUser({
                                                ...editingUser,
                                                lastName: e.target.value,
                                            })
                                        }
                                        placeholder="Last name"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="editEmail">Email</Label>
                                <Input
                                    id="editEmail"
                                    type="email"
                                    value={editingUser.email}
                                    onChange={e =>
                                        setEditingUser({ ...editingUser, email: e.target.value })
                                    }
                                    placeholder="name@yourschool.edu"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="editRole">System Base Role</Label>
                                <Select
                                    value={editingUser.role}
                                    onValueChange={value =>
                                        setEditingUser({ ...editingUser, role: value })
                                    }
                                >
                                    <SelectTrigger id="editRole">
                                        <SelectValue placeholder="Select role" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(ROLES).map(([key, value]) => (
                                            <SelectItem key={key} value={value}>
                                                {ROLE_LABELS[value] || value}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="editCustomRole">Custom Tenant Role Override</Label>
                                <Select
                                    value={editingUser.customRoleId}
                                    onValueChange={value =>
                                        setEditingUser({ ...editingUser, customRoleId: value })
                                    }
                                >
                                    <SelectTrigger id="editCustomRole">
                                        <SelectValue placeholder="Select custom role" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__none__">
                                            None (Use System Base Role Permissions)
                                        </SelectItem>
                                        {customRoles.map(cr => (
                                            <SelectItem key={cr.id} value={cr.id}>
                                                {cr.name} ({cr.code})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleEditUser} disabled={saving}>
                            {saving ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
