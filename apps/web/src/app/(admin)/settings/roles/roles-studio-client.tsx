'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    deleteTenantRoleAction,
    upsertTenantRoleAction,
    type TenantCustomRoleItem,
} from '@/lib/actions/lcnc-platform';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ROLE_COLORS } from '@/lib/constants';
import { Copy, Edit3, Plus, Shield, ShieldCheck, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';

export interface SystemRolePreset {
    role: string;
    label: string;
    permissions: string[];
    resources: { resource: string; actions: string[] }[];
    total: number;
}

export interface RoleObjectOption {
    apiName: string;
    name: string;
    isCustom: boolean;
}

const MODULE_PERMISSION_GROUPS: {
    group: string;
    grants: { code: string; label: string }[];
}[] = [
    {
        group: 'Low-Code Studio & Governance',
        grants: [
            { code: 'metadata:read', label: 'View Object Manager & Schemas' },
            { code: 'metadata:create', label: 'Create Custom Records via API' },
            { code: 'metadata:write', label: 'Edit Custom Fields via API' },
            { code: 'metadata:publish', label: 'Publish Objects, Fields & Layouts' },
            { code: 'settings:read', label: 'Read Tenant Settings & Roles' },
            { code: 'settings:write', label: 'Manage Roles, Views & Settings' },
            { code: 'workflows:read', label: 'View Automation Workflows' },
            { code: 'workflows:write', label: 'Publish Automation Workflows' },
        ],
    },
    {
        group: 'Analytics & Custom Reports',
        grants: [
            { code: 'reports:read', label: 'Run Custom & BI Reports' },
            { code: 'reports:export', label: 'Export CSV / Excel Reports' },
            { code: 'audit:read', label: 'View Tenant Audit Logs' },
        ],
    },
    {
        group: 'Core School Operations',
        grants: [
            { code: 'students:read', label: 'Read Students' },
            { code: 'students:create', label: 'Create Students' },
            { code: 'students:update', label: 'Update Students' },
            { code: 'admissions:*', label: 'Full Admissions Pipeline' },
            { code: 'attendance:*', label: 'Mark & Manage Attendance' },
            { code: 'exams:*', label: 'Manage Exams & Marks' },
            { code: 'fees:read', label: 'View Fee Invoices & Ledger' },
            { code: 'fees:create', label: 'Generate Fee Invoices' },
            { code: 'fees:update', label: 'Record Payments & Concessions' },
            { code: 'transport:*', label: 'Manage Routes & Fleet' },
            { code: 'hostel:*', label: 'Manage Hostels & Wardens' },
            { code: 'library:*', label: 'Manage Library Catalog' },
            { code: 'communications:*', label: 'Send Broadcast Notices' },
        ],
    },
];

const OBJECT_CRUD_ACTIONS = ['read', 'create', 'update', 'delete', 'export'] as const;

const BASE_ROLE_OPTIONS = [
    { code: 'SCHOOL_ADMIN', label: 'School Admin (Operational)' },
    { code: 'PRINCIPAL', label: 'Principal' },
    { code: 'REGISTRAR', label: 'Registrar' },
    { code: 'FINANCE_LEAD', label: 'Finance Lead' },
    { code: 'ACCOUNTANT', label: 'Accountant' },
    { code: 'ADMISSION_COUNSELOR', label: 'Admission Counselor' },
    { code: 'STUDENT_SUCCESS_COUNSELOR', label: 'Student Success Counselor' },
    { code: 'TEACHER', label: 'Teacher / Faculty' },
    { code: 'TRANSPORT_MANAGER', label: 'Transport Manager' },
    { code: 'TRUST_OFFICER', label: 'Trust Officer' },
    { code: 'CREDENTIAL_OFFICER', label: 'Credential Officer' },
];

export default function RolesStudioClient({
    systemRoles,
    initialCustomRoles,
    availableObjects,
    canManageRoles,
}: {
    systemRoles: SystemRolePreset[];
    initialCustomRoles: TenantCustomRoleItem[];
    availableObjects: RoleObjectOption[];
    canManageRoles: boolean;
}) {
    const router = useRouter();
    const [activeView, setActiveView] = useState<'CUSTOM' | 'SYSTEM'>('CUSTOM');
    const [editorOpen, setEditorOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    const [editingId, setEditingId] = useState<string | undefined>(undefined);
    const [roleName, setRoleName] = useState('');
    const [roleCode, setRoleCode] = useState('');
    const [roleDescription, setRoleDescription] = useState('');
    const [baseRole, setBaseRole] = useState('TEACHER');
    const [isActive, setIsActive] = useState(true);
    const [selectedPermissions, setSelectedPermissions] = useState<string[]>([
        'dashboard:read',
        'reports:read',
    ]);

    const openBlankRoleBuilder = () => {
        setEditingId(undefined);
        setRoleName('');
        setRoleCode('');
        setRoleDescription('');
        setBaseRole('TEACHER');
        setIsActive(true);
        setSelectedPermissions(['dashboard:read', 'reports:read']);
        setEditorOpen(true);
        setActiveView('CUSTOM');
    };

    const openCloneFromSystem = (preset: SystemRolePreset) => {
        const cleanGrants = preset.permissions.filter(p => !p.startsWith('platform:'));
        setEditingId(undefined);
        setRoleName(`Custom ${preset.label}`);
        setRoleCode(`CUSTOM_${preset.role}`.slice(0, 60));
        setRoleDescription(`Cloned from ${preset.label} preset and tailored for this school.`);
        setBaseRole(
            BASE_ROLE_OPTIONS.some(b => b.code === preset.role) ? preset.role : 'TEACHER',
        );
        setIsActive(true);
        setSelectedPermissions(cleanGrants.length > 0 ? cleanGrants : ['dashboard:read']);
        setEditorOpen(true);
        setActiveView('CUSTOM');
    };

    const openEditCustomRole = (role: TenantCustomRoleItem) => {
        setEditingId(role.id);
        setRoleName(role.name);
        setRoleCode(role.code);
        setRoleDescription(role.description || '');
        setBaseRole(role.baseRole || 'TEACHER');
        setIsActive(role.isActive);
        setSelectedPermissions([...role.permissions]);
        setEditorOpen(true);
    };

    const togglePerm = (perm: string) => {
        setSelectedPermissions(prev =>
            prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm],
        );
    };

    const handleSaveRole = async () => {
        if (!roleName.trim()) {
            toast.error('Please enter a role display name.');
            return;
        }
        const computedCode =
            roleCode.trim() ||
            roleName
                .trim()
                .toUpperCase()
                .replace(/[^A-Z0-9_]+/g, '_');

        setSaving(true);
        try {
            const res = await upsertTenantRoleAction({
                id: editingId,
                code: computedCode,
                name: roleName.trim(),
                description: roleDescription.trim(),
                baseRole,
                isActive,
                permissions: selectedPermissions,
            });
            if (!res.success) {
                toast.error(res.error || 'Failed to save custom role.');
                return;
            }
            toast.success(`Custom role "${roleName.trim()}" saved.`);
            setEditorOpen(false);
            router.refresh();
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteRole = async (role: TenantCustomRoleItem) => {
        setSaving(true);
        try {
            const res = await deleteTenantRoleAction(role.id);
            if (!res.success) {
                toast.error(res.error || 'Failed to delete custom role.');
                return;
            }
            toast.success(`Custom role "${role.name}" deleted.`);
            router.refresh();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6" data-testid="roles-studio-workspace">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">
                        Roles &amp; Permission Studio
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        Create unlimited tenant-isolated Custom Roles with module grants and per-object CRUD permissions, or clone from 16 built-in System Role presets.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-lg border border-border bg-muted p-1">
                        <button
                            type="button"
                            onClick={() => setActiveView('CUSTOM')}
                            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                activeView === 'CUSTOM'
                                    ? 'bg-card text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            Custom Tenant Roles ({initialCustomRoles.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveView('SYSTEM')}
                            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                activeView === 'SYSTEM'
                                    ? 'bg-card text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            System Presets ({systemRoles.length})
                        </button>
                    </div>
                    {canManageRoles && (
                        <Button size="sm" onClick={openBlankRoleBuilder} data-testid="new-custom-role-btn">
                            <Plus className="w-4 h-4 mr-1.5" /> New Custom Role
                        </Button>
                    )}
                </div>
            </div>

            {/* Role Builder Drawer / Card */}
            {editorOpen && canManageRoles && (
                <Card className="border-primary/40 shadow-sm">
                    <CardHeader className="border-b border-border pb-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <ShieldCheck className="w-5 h-5 text-primary" />
                                    {editingId ? `Edit Custom Role: ${roleName}` : 'Define New Custom Role'}
                                </CardTitle>
                                <CardDescription>
                                    Custom roles are strictly scoped to your school tenant via Row-Level Security (`tenant_roles`) and can never escalate to `platform:*` privileges.
                                </CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setEditorOpen(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={handleSaveRole}
                                    disabled={saving}
                                    data-testid="save-custom-role-btn"
                                >
                                    {saving ? 'Saving…' : 'Save Role & Matrix'}
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                                    Role Name
                                </label>
                                <Input
                                    value={roleName}
                                    onChange={e => {
                                        const val = e.target.value;
                                        setRoleName(val);
                                        if (!editingId) {
                                            setRoleCode(
                                                val
                                                    .trim()
                                                    .toUpperCase()
                                                    .replace(/[^A-Z0-9_]+/g, '_')
                                                    .slice(0, 60),
                                            );
                                        }
                                    }}
                                    placeholder="e.g. Hostel Warden"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                                    Role API Code
                                </label>
                                <Input
                                    value={roleCode}
                                    disabled={Boolean(editingId)}
                                    onChange={e =>
                                        setRoleCode(
                                            e.target.value
                                                .toUpperCase()
                                                .replace(/[^A-Z0-9_]+/g, '_'),
                                        )
                                    }
                                    placeholder="HOSTEL_WARDEN"
                                    className="font-mono text-xs"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                                    Base Navigation Profile
                                </label>
                                <select
                                    value={baseRole}
                                    onChange={e => setBaseRole(e.target.value)}
                                    className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground"
                                >
                                    {BASE_ROLE_OPTIONS.map(opt => (
                                        <option key={opt.code} value={opt.code}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                                    Description
                                </label>
                                <Input
                                    value={roleDescription}
                                    onChange={e => setRoleDescription(e.target.value)}
                                    placeholder="Manages boarding wing & visitor passes"
                                />
                            </div>
                        </div>

                        {/* Module Permissions */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-foreground">
                                1. Module &amp; Workspace Permissions ({selectedPermissions.length} active grants)
                            </h3>
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                {MODULE_PERMISSION_GROUPS.map(grp => (
                                    <div
                                        key={grp.group}
                                        className="rounded-xl border border-border bg-muted/30 p-4 space-y-2.5"
                                    >
                                        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                            {grp.group}
                                        </div>
                                        <div className="space-y-1.5">
                                            {grp.grants.map(g => (
                                                <label
                                                    key={g.code}
                                                    className="flex items-center justify-between gap-2 text-xs text-foreground cursor-pointer py-0.5"
                                                >
                                                    <span>{g.label}</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedPermissions.includes(g.code)}
                                                        onChange={() => togglePerm(g.code)}
                                                        className="rounded border-border"
                                                    />
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Per-Object CRUD Matrix */}
                        <div className="space-y-3">
                            <div>
                                <h3 className="text-sm font-semibold text-foreground">
                                    2. Object-Level CRUD &amp; Export Matrix (System + Custom Objects)
                                </h3>
                                <p className="text-xs text-muted-foreground">
                                    Control granular `object:&lt;api_name&gt;:read|create|update|delete|export` access across every enabled object. Configure field-level Read/Write security (FLS) inside each Object&apos;s Field Manager.
                                </p>
                            </div>
                            <div className="overflow-x-auto rounded-xl border border-border">
                                <table className="w-full text-xs">
                                    <thead className="bg-muted/60 text-muted-foreground border-b border-border">
                                        <tr>
                                            <th className="text-left px-3 py-2 font-semibold">Object</th>
                                            <th className="text-left px-3 py-2 font-semibold">Type</th>
                                            {OBJECT_CRUD_ACTIONS.map(act => (
                                                <th
                                                    key={act}
                                                    className="text-center px-3 py-2 font-semibold uppercase"
                                                >
                                                    {act}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border bg-card">
                                        {availableObjects.map(obj => (
                                            <tr key={obj.apiName}>
                                                <td className="px-3 py-2 font-medium text-foreground">
                                                    {obj.name}{' '}
                                                    <span className="font-mono text-muted-foreground">
                                                        ({obj.apiName})
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <Badge variant="outline" className="text-[10px]">
                                                        {obj.isCustom ? 'Custom EAV' : 'System'}
                                                    </Badge>
                                                </td>
                                                {OBJECT_CRUD_ACTIONS.map(act => {
                                                    const code = `object:${obj.apiName}:${act}`;
                                                    return (
                                                        <td key={act} className="px-3 py-2 text-center">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedPermissions.includes(code)}
                                                                onChange={() => togglePerm(code)}
                                                                aria-label={`${obj.name} ${act}`}
                                                                className="rounded border-border"
                                                            />
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {activeView === 'CUSTOM' ? (
                <div className="grid gap-4">
                    {initialCustomRoles.length === 0 ? (
                        <Card>
                            <CardContent className="py-12 text-center space-y-3">
                                <Shield className="w-10 h-10 text-primary mx-auto opacity-80" />
                                <h3 className="text-base font-semibold text-foreground">
                                    No Custom Roles Defined Yet
                                </h3>
                                <p className="text-sm text-muted-foreground max-w-lg mx-auto">
                                    Define custom roles like <strong>Hostel Warden</strong>,{' '}
                                    <strong>Sports Coordinator</strong>, <strong>Junior Fee Clerk</strong>, or{' '}
                                    <strong>Academic Dean</strong> with tailored module, object, form, view, and report access.
                                </p>
                                {canManageRoles && (
                                    <div className="flex justify-center gap-2 pt-2">
                                        <Button size="sm" onClick={openBlankRoleBuilder}>
                                            <Plus className="w-4 h-4 mr-1.5" /> Create First Custom Role
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setActiveView('SYSTEM')}
                                        >
                                            Browse 16 System Presets to Clone
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ) : (
                        initialCustomRoles.map(role => (
                            <Card key={role.id}>
                                <CardHeader className="pb-3">
                                    <div className="flex items-center justify-between gap-4 flex-wrap">
                                        <div className="flex items-center gap-2.5 flex-wrap">
                                            <Badge className="bg-primary text-primary-foreground">
                                                {role.name}
                                            </Badge>
                                            <span className="text-xs font-mono text-muted-foreground">
                                                {role.code}
                                            </span>
                                            <Badge variant="outline" className="text-xs">
                                                Base: {role.baseRole}
                                            </Badge>
                                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                                <Users className="w-3.5 h-3.5" /> {role.assignedUserCount} user(s)
                                            </span>
                                        </div>
                                        {canManageRoles && (
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => openEditCustomRole(role)}
                                                >
                                                    <Edit3 className="w-3.5 h-3.5 mr-1" /> Edit Matrix
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDeleteRole(role)}
                                                    disabled={saving}
                                                    className="text-destructive hover:text-destructive"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                    {role.description && (
                                        <CardDescription className="mt-1">
                                            {role.description}
                                        </CardDescription>
                                    )}
                                </CardHeader>
                                <CardContent>
                                    <div className="flex flex-wrap gap-1.5">
                                        {role.permissions.length === 0 ? (
                                            <span className="text-xs text-muted-foreground">
                                                Baseline dashboard read only
                                            </span>
                                        ) : (
                                            role.permissions.map(perm => (
                                                <Badge
                                                    key={perm}
                                                    variant="outline"
                                                    className="font-mono text-xs"
                                                >
                                                    {perm}
                                                </Badge>
                                            ))
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>
            ) : (
                <div className="grid gap-4">
                    {systemRoles.map(entry => (
                        <Card key={entry.role}>
                            <CardHeader>
                                <div className="flex items-center justify-between gap-4 flex-wrap">
                                    <div className="flex items-center gap-3">
                                        <Badge className={ROLE_COLORS[entry.role] || ''}>
                                            {entry.label}
                                        </Badge>
                                        <CardTitle className="text-base font-mono">
                                            {entry.role}
                                        </CardTitle>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <CardDescription>
                                            {entry.total}{' '}
                                            {entry.total === 1 ? 'permission' : 'permissions'}
                                        </CardDescription>
                                        {canManageRoles && entry.role !== 'PLATFORM_ADMIN' && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => openCloneFromSystem(entry)}
                                            >
                                                <Copy className="w-3.5 h-3.5 mr-1.5" /> Clone as Custom Role
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {entry.resources.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                        No permissions granted.
                                    </p>
                                ) : (
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        {entry.resources.map(({ resource, actions }) => (
                                            <div key={resource} className="space-y-1">
                                                <p className="text-sm font-medium capitalize">
                                                    {resource.replace(/_/g, ' ')}
                                                </p>
                                                <div className="flex flex-wrap gap-1">
                                                    {actions.map(action => (
                                                        <Badge
                                                            key={action}
                                                            variant="outline"
                                                            className="font-mono text-xs"
                                                        >
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
            )}
        </div>
    );
}
