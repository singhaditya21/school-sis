'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { ROLES, ROLE_LABELS, ROLE_COLORS } from '@/lib/constants';
import { usersApi, type AdminUser } from '@/lib/api/users';

// Default tenant ID for demo
const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export default function UserManagementPage() {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState<string>('all');
    const [newUser, setNewUser] = useState({ email: '', firstName: '', lastName: '', role: 'TEACHER', password: '' });
    const [saving, setSaving] = useState(false);

    // Fetch users on mount
    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await usersApi.getAll(0, 100);
            if (response.success && response.data) {
                setUsers(response.data.content);
            } else {
                // Fall back to mock data if API fails
                setUsers([
                    { id: '1', email: 'admin@greenwood.edu', firstName: 'Admin', lastName: 'User', role: 'SUPER_ADMIN', active: true, createdAt: '2025-01-01', lastLoginAt: '2026-01-22', tenantId: DEFAULT_TENANT_ID },
                    { id: '2', email: 'accountant@greenwood.edu', firstName: 'Accounts', lastName: 'Team', role: 'ACCOUNTANT', active: true, createdAt: '2025-01-01', lastLoginAt: '2026-01-20', tenantId: DEFAULT_TENANT_ID },
                    { id: '3', email: 'principal@greenwood.edu', firstName: 'Dr. Sharma', lastName: '', role: 'PRINCIPAL', active: true, createdAt: '2025-01-01', lastLoginAt: null, tenantId: DEFAULT_TENANT_ID },
                ]);
                setError('Using demo data (backend not available)');
            }
        } catch {
            setUsers([
                { id: '1', email: 'admin@greenwood.edu', firstName: 'Admin', lastName: 'User', role: 'SUPER_ADMIN', active: true, createdAt: '2025-01-01', lastLoginAt: '2026-01-22', tenantId: DEFAULT_TENANT_ID },
                { id: '2', email: 'accountant@greenwood.edu', firstName: 'Accounts', lastName: 'Team', role: 'ACCOUNTANT', active: true, createdAt: '2025-01-01', lastLoginAt: '2026-01-20', tenantId: DEFAULT_TENANT_ID },
            ]);
            setError('Using demo data (backend not available)');
        }
        setLoading(false);
    };

    const filteredUsers = users.filter(user => {
        const matchesSearch = user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
            user.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            user.lastName.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesRole = roleFilter === 'all' || user.role === roleFilter;
        return matchesSearch && matchesRole;
    });

    const handleAddUser = async () => {
        setSaving(true);
        try {
            const response = await usersApi.create({
                email: newUser.email,
                password: newUser.password,
                firstName: newUser.firstName,
                lastName: newUser.lastName,
                role: newUser.role,
                tenantId: DEFAULT_TENANT_ID,
            });

            if (response.success && response.data) {
                setUsers([...users, response.data]);
                setNewUser({ email: '', firstName: '', lastName: '', role: 'TEACHER', password: '' });
                setIsAddDialogOpen(false);
            } else {
                alert(response.error?.message || 'Failed to create user');
            }
        } catch {
            alert('Failed to create user. Is the backend running?');
        }
        setSaving(false);
    };

    const handleToggleActive = async (userId: string, currentActive: boolean) => {
        try {
            const response = await usersApi.update(userId, { active: !currentActive });
            if (response.success && response.data) {
                setUsers(users.map(user =>
                    user.id === userId ? { ...user, active: !currentActive } : user
                ));
            }
        } catch {
            // Update locally as fallback
            setUsers(users.map(user =>
                user.id === userId ? { ...user, active: !currentActive } : user
            ));
        }
    };

    const handleResetPassword = async (userId: string) => {
        try {
            const response = await usersApi.resetPassword(userId);
            if (response.success && response.data) {
                alert(`Temporary password: ${response.data.temporaryPassword}\n\nPlease share this securely with the user.`);
            } else {
                alert('Password reset feature requires backend connection.');
            }
        } catch {
            alert('Password reset requires the backend to be running.');
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
                    <p className="text-muted-foreground">
                        Manage system users, roles, and permissions
                    </p>
                </div>
                <div className="flex gap-2">
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
                                    Create a new user account.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="firstName">First Name</Label>
                                        <Input
                                            id="firstName"
                                            value={newUser.firstName}
                                            onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })}
                                            placeholder="First name"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="lastName">Last Name</Label>
                                        <Input
                                            id="lastName"
                                            value={newUser.lastName}
                                            onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })}
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
                                        onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                                        placeholder="user@greenwood.edu"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="role">Role</Label>
                                    <Select value={newUser.role} onValueChange={(value) => setNewUser({ ...newUser, role: value })}>
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
                                    <Label htmlFor="password">Password</Label>
                                    <Input
                                        id="password"
                                        type="password"
                                        value={newUser.password}
                                        onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                                        placeholder="Set initial password"
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
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <p className="text-sm text-yellow-700 dark:text-yellow-400">{error}</p>
                </div>
            )}

            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle>Filters</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <Input
                                placeholder="Search by name or email..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <Select value={roleFilter} onValueChange={setRoleFilter}>
                            <SelectTrigger className="w-[200px]">
                                <SelectValue placeholder="Filter by role" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Roles</SelectItem>
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
                        All registered users in the system
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
                                            {user.firstName} {user.lastName}
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
                                                    checked={user.active}
                                                    onCheckedChange={() => handleToggleActive(user.id, user.active)}
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
                                                <Button variant="outline" size="sm">
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
                                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                            No users found matching your criteria
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
