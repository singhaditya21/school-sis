'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { ROLE_COLORS, ROLE_LABELS, ROLES } from '@/lib/constants';
import {
    createUser,
    listUsers,
    resetUserPassword,
    setUserActive,
    updateUserProfile,
    type AdminUser,
} from '@/lib/actions/users';

type NewUserForm = {
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    password: string;
};

type EditUserForm = {
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    reason: string;
};

type RoleChangeApiResponse =
    | {
        status: 'APPROVAL_REQUIRED';
        approval: { id: string; status: string };
    }
    | {
        status: 'EXECUTED';
        metadata?: { previousRole?: string; newRole?: string };
    }
    | { error?: string };

const EMPTY_NEW_USER: NewUserForm = {
    email: '',
    firstName: '',
    lastName: '',
    role: 'TEACHER',
    password: '',
};

const EMPTY_EDIT_USER: EditUserForm = {
    email: '',
    firstName: '',
    lastName: '',
    role: '',
    reason: '',
};

const ROLE_OPTIONS = Object.values(ROLES);

function replaceUser(users: AdminUser[], replacement: AdminUser): AdminUser[] {
    return users.map((user) => user.id === replacement.id ? replacement : user);
}

export default function UserManagementPage() {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [assignableRoles, setAssignableRoles] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [newUser, setNewUser] = useState<NewUserForm>(EMPTY_NEW_USER);
    const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
    const [editUser, setEditUser] = useState<EditUserForm>(EMPTY_EDIT_USER);
    const [roleApproval, setRoleApproval] = useState<{ id: string; status: string } | null>(null);
    const [saving, setSaving] = useState(false);
    const [mutatingUserId, setMutatingUserId] = useState<string | null>(null);

    const loadUsers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await listUsers();
            if (!response.success || !response.data) {
                throw new Error(response.error ?? 'Failed to load users');
            }

            setUsers(response.data.users);
            setAssignableRoles(response.data.assignableRoles);
            setNewUser((current) => ({
                ...current,
                role: response.data!.assignableRoles.includes(current.role)
                    ? current.role
                    : (response.data!.assignableRoles[0] ?? ''),
            }));
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Failed to load users');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadUsers();
    }, [loadUsers]);

    const filteredUsers = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return users.filter((user) => {
            const matchesSearch = !query
                || user.email.toLowerCase().includes(query)
                || user.firstName.toLowerCase().includes(query)
                || user.lastName.toLowerCase().includes(query);
            const matchesRole = roleFilter === 'all' || user.role === roleFilter;
            return matchesSearch && matchesRole;
        });
    }, [roleFilter, searchQuery, users]);

    const handleAddUser = async () => {
        setSaving(true);
        try {
            const response = await createUser(newUser);
            if (!response.success || !response.data) {
                throw new Error(response.error || 'Failed to create user');
            }

            setUsers((current) => [response.data!, ...current]);
            setNewUser({
                ...EMPTY_NEW_USER,
                role: assignableRoles.includes('TEACHER') ? 'TEACHER' : (assignableRoles[0] ?? ''),
            });
            setIsAddDialogOpen(false);
            toast.success('User created.');
        } catch (caught) {
            toast.error(caught instanceof Error ? caught.message : 'Failed to create user');
        } finally {
            setSaving(false);
        }
    };

    const handleToggleActive = async (user: AdminUser, active: boolean) => {
        if (!user.canManage) return;
        setMutatingUserId(user.id);
        try {
            const response = await setUserActive(user.id, active);
            if (!response.success || !response.data) {
                throw new Error(response.error ?? 'Failed to update user');
            }
            setUsers((current) => replaceUser(current, response.data!));
            toast.success(active ? 'User activated.' : 'User deactivated.');
        } catch (caught) {
            toast.error(caught instanceof Error ? caught.message : 'Failed to update user');
        } finally {
            setMutatingUserId(null);
        }
    };

    const handleResetPassword = async (user: AdminUser) => {
        if (!user.canManage) return;
        setMutatingUserId(user.id);
        try {
            const response = await resetUserPassword(user.id);
            if (!response.success || !response.data) {
                throw new Error(response.error ?? 'Failed to reset password');
            }
            toast.success(
                `Temporary password: ${response.data.temporaryPassword}. It expires in 24 hours and must be changed at sign-in. Share it through a secure channel.`,
                { duration: 15000 },
            );
        } catch (caught) {
            toast.error(caught instanceof Error ? caught.message : 'Failed to reset password');
        } finally {
            setMutatingUserId(null);
        }
    };

    const openEditDialog = (user: AdminUser) => {
        if (!user.canManage) return;
        setEditingUser(user);
        setEditUser({
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            reason: '',
        });
        setRoleApproval(null);
    };

    const closeEditDialog = () => {
        setEditingUser(null);
        setEditUser(EMPTY_EDIT_USER);
        setRoleApproval(null);
    };

    const requestRoleChange = async (user: AdminUser): Promise<'pending' | 'executed'> => {
        const response = await fetch(`/api/identity/users/${encodeURIComponent(user.id)}/role-change`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                targetRole: editUser.role,
                reason: editUser.reason.trim(),
                ...(roleApproval ? { approvalRequestId: roleApproval.id } : {}),
            }),
        });
        const data = await response.json().catch(() => ({})) as RoleChangeApiResponse;

        if (!response.ok) {
            const message = 'error' in data && data.error
                ? data.error
                : ('status' in data && data.status === 'APPROVAL_REQUIRED'
                    ? `Role-change approval is ${data.approval.status}.`
                    : 'Failed to request role change');
            throw new Error(message);
        }

        if ('status' in data && data.status === 'APPROVAL_REQUIRED') {
            setRoleApproval({ id: data.approval.id, status: data.approval.status });
            return 'pending';
        }

        if (!('status' in data) || data.status !== 'EXECUTED') {
            throw new Error('Unexpected role-change response.');
        }
        return 'executed';
    };

    const handleEditUser = async () => {
        if (!editingUser) return;
        setSaving(true);
        try {
            let latestUser = editingUser;
            const profileChanged = editUser.email.trim().toLowerCase() !== latestUser.email.toLowerCase()
                || editUser.firstName.trim() !== latestUser.firstName
                || editUser.lastName.trim() !== latestUser.lastName;

            if (profileChanged) {
                const response = await updateUserProfile({
                    userId: latestUser.id,
                    email: editUser.email,
                    firstName: editUser.firstName,
                    lastName: editUser.lastName,
                });
                if (!response.success || !response.data) {
                    throw new Error(response.error || 'Failed to update user');
                }
                latestUser = response.data;
                setEditingUser(latestUser);
                setUsers((current) => replaceUser(current, latestUser));
            }

            if (editUser.role !== latestUser.role) {
                if (editUser.reason.trim().length < 3) {
                    throw new Error('Give a reason of at least 3 characters for the role change.');
                }

                const status = await requestRoleChange(latestUser);
                if (status === 'pending') {
                    toast.success('Role change submitted for approval. It has not been applied yet.');
                    return;
                }

                const roleChangedUser = { ...latestUser, role: editUser.role };
                setUsers((current) => replaceUser(current, roleChangedUser));
                toast.success('Approved role change applied.');
                closeEditDialog();
                return;
            }

            if (profileChanged) toast.success('User profile updated.');
            closeEditDialog();
        } catch (caught) {
            toast.error(caught instanceof Error ? caught.message : 'Failed to update user');
        } finally {
            setSaving(false);
        }
    };

    const addUserDisabled = saving
        || !newUser.email.trim()
        || !newUser.firstName.trim()
        || !newUser.lastName.trim()
        || newUser.password.length < 12
        || !assignableRoles.includes(newUser.role);

    const roleWillChange = Boolean(editingUser && editUser.role !== editingUser.role);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
                    <p className="text-muted-foreground">
                        Manage users inside the active tenant. Role changes require independent approval.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => void loadUsers()} disabled={loading}>
                        {loading ? 'Loading...' : 'Refresh'}
                    </Button>
                    <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                        <DialogTrigger asChild>
                            <Button disabled={assignableRoles.length === 0}>
                                <span className="mr-2">+</span> Add User
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[500px]">
                            <DialogHeader>
                                <DialogTitle>Add New User</DialogTitle>
                                <DialogDescription>
                                    Create a lower-privilege account in the active tenant.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="new-first-name">First Name</Label>
                                        <Input
                                            id="new-first-name"
                                            value={newUser.firstName}
                                            onChange={(event) => setNewUser({ ...newUser, firstName: event.target.value })}
                                            maxLength={100}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="new-last-name">Last Name</Label>
                                        <Input
                                            id="new-last-name"
                                            value={newUser.lastName}
                                            onChange={(event) => setNewUser({ ...newUser, lastName: event.target.value })}
                                            maxLength={100}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="new-email">Email</Label>
                                    <Input
                                        id="new-email"
                                        type="email"
                                        value={newUser.email}
                                        onChange={(event) => setNewUser({ ...newUser, email: event.target.value })}
                                        maxLength={255}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="new-role">Role</Label>
                                    <Select
                                        value={newUser.role}
                                        onValueChange={(role) => setNewUser({ ...newUser, role })}
                                    >
                                        <SelectTrigger id="new-role">
                                            <SelectValue placeholder="Select role" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {assignableRoles.map((role) => (
                                                <SelectItem key={role} value={role}>
                                                    {ROLE_LABELS[role] || role}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="new-password">Initial Password</Label>
                                    <Input
                                        id="new-password"
                                        type="password"
                                        value={newUser.password}
                                        onChange={(event) => setNewUser({ ...newUser, password: event.target.value })}
                                        minLength={12}
                                        maxLength={128}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Expires after 24 hours and must be replaced at first sign-in.
                                    </p>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={() => void handleAddUser()} disabled={addUserDisabled}>
                                    {saving ? 'Creating...' : 'Create User'}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
                    <p className="text-sm text-yellow-700 dark:text-yellow-400">{error}</p>
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Filters</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-4">
                        <Input
                            className="flex-1"
                            placeholder="Search by name or email..."
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                        />
                        <Select value={roleFilter} onValueChange={setRoleFilter}>
                            <SelectTrigger className="w-[220px]">
                                <SelectValue placeholder="Filter by role" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Roles</SelectItem>
                                {ROLE_OPTIONS.map((role) => (
                                    <SelectItem key={role} value={role}>
                                        {ROLE_LABELS[role] || role}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Users ({filteredUsers.length})</CardTitle>
                    <CardDescription>Tenant-scoped registered users</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Last Login</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredUsers.map((user) => (
                                    <TableRow key={user.id}>
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-2">
                                                <span>{user.firstName} {user.lastName}</span>
                                                {user.isCurrentUser && <Badge variant="outline">You</Badge>}
                                            </div>
                                        </TableCell>
                                        <TableCell>{user.email}</TableCell>
                                        <TableCell>
                                            <Badge className={ROLE_COLORS[user.role] || ''}>
                                                {ROLE_LABELS[user.role] || user.role}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Switch
                                                    aria-label={`${user.active ? 'Deactivate' : 'Activate'} ${user.email}`}
                                                    checked={user.active}
                                                    disabled={!user.canManage || mutatingUserId === user.id}
                                                    onCheckedChange={(active) => void handleToggleActive(user, active)}
                                                />
                                                <span className={user.active ? 'text-green-600' : 'text-red-600'}>
                                                    {user.active ? 'Active' : 'Inactive'}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'Never'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={!user.canManage || mutatingUserId === user.id}
                                                    onClick={() => openEditDialog(user)}
                                                >
                                                    Edit
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={!user.canManage || mutatingUserId === user.id}
                                                    onClick={() => void handleResetPassword(user)}
                                                >
                                                    Reset Password
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {filteredUsers.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                                            No users found matching your criteria
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Dialog open={Boolean(editingUser)} onOpenChange={(open) => { if (!open) closeEditDialog(); }}>
                <DialogContent className="sm:max-w-[560px]">
                    <DialogHeader>
                        <DialogTitle>Edit User</DialogTitle>
                        <DialogDescription>
                            Profile changes apply directly. Role changes remain pending until an eligible administrator approves them.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="edit-first-name">First Name</Label>
                                <Input
                                    id="edit-first-name"
                                    value={editUser.firstName}
                                    onChange={(event) => setEditUser({ ...editUser, firstName: event.target.value })}
                                    maxLength={100}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-last-name">Last Name</Label>
                                <Input
                                    id="edit-last-name"
                                    value={editUser.lastName}
                                    onChange={(event) => setEditUser({ ...editUser, lastName: event.target.value })}
                                    maxLength={100}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-email">Email</Label>
                            <Input
                                id="edit-email"
                                type="email"
                                value={editUser.email}
                                onChange={(event) => setEditUser({ ...editUser, email: event.target.value })}
                                maxLength={255}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-role">Role</Label>
                            <Select
                                value={editUser.role}
                                onValueChange={(role) => {
                                    setEditUser({ ...editUser, role });
                                    setRoleApproval(null);
                                }}
                            >
                                <SelectTrigger id="edit-role">
                                    <SelectValue placeholder="Select role" />
                                </SelectTrigger>
                                <SelectContent>
                                    {assignableRoles.map((role) => (
                                        <SelectItem key={role} value={role}>
                                            {ROLE_LABELS[role] || role}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {roleWillChange && (
                            <div className="space-y-2">
                                <Label htmlFor="role-change-reason">Role Change Reason</Label>
                                <Input
                                    id="role-change-reason"
                                    value={editUser.reason}
                                    onChange={(event) => {
                                        setEditUser({ ...editUser, reason: event.target.value });
                                        setRoleApproval(null);
                                    }}
                                    minLength={3}
                                    maxLength={1000}
                                    placeholder="Required for the approval audit trail"
                                />
                            </div>
                        )}
                        {roleApproval && (
                            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                <p>
                                    Approval <span className="font-mono">{roleApproval.id}</span> is {roleApproval.status}.
                                    The current role has not changed.
                                </p>
                                <a
                                    className="mt-2 inline-block font-medium underline"
                                    href="/approvals"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    Open approval queue
                                </a>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeEditDialog} disabled={saving}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => void handleEditUser()}
                            disabled={
                                saving
                                || !editUser.email.trim()
                                || !editUser.firstName.trim()
                                || !editUser.lastName.trim()
                                || !assignableRoles.includes(editUser.role)
                                || (roleWillChange && editUser.reason.trim().length < 3)
                            }
                        >
                            {saving
                                ? 'Saving...'
                                : roleApproval
                                    ? 'Check Approval & Apply'
                                    : roleWillChange
                                        ? 'Save & Request Approval'
                                        : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
