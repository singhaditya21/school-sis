'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    MetadataField,
    createCustomField,
    updateFieldPermissions,
} from '@/lib/actions/metadata-engine';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Shield } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';

const CONFIGURABLE_ROLES = [
    { role: 'SCHOOL_ADMIN', label: 'School Admin' },
    { role: 'TEACHER', label: 'Teacher' },
    { role: 'ACCOUNTANT', label: 'Accountant' },
    { role: 'ADMISSION_COUNSELOR', label: 'Admission Counselor' },
    { role: 'PARENT', label: 'Parent / Student' },
] as const;

export default function FieldManagerClient({
    objectId,
    initialFields,
    availableObjects = [],
}: {
    objectId: string;
    initialFields: MetadataField[];
    availableObjects?: { api_name: string; name: string }[];
}) {
    const router = useRouter();
    const [fields, setFields] = useState<MetadataField[]>(initialFields);
    const [isAdding, setIsAdding] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // New Field State
    const [newLabel, setNewLabel] = useState('');
    const [newApiName, setNewApiName] = useState('');
    const [newType, setNewType] = useState('TEXT');
    const [newRequired, setNewRequired] = useState(false);
    const [newOptions, setNewOptions] = useState('');
    const [newLookupTarget, setNewLookupTarget] = useState(
        availableObjects[0]?.api_name || 'student',
    );
    const [newFormulaExpr, setNewFormulaExpr] = useState('');
    const [newRollupChildObject, setNewRollupChildObject] = useState(
        availableObjects[0]?.api_name || 'semester_enrollment',
    );
    const [newRollupFkField, setNewRollupFkField] = useState('program_id');
    const [newRollupAggregate, setNewRollupAggregate] = useState('COUNT');
    const [newRollupTargetField, setNewRollupTargetField] = useState('');
    const [approvalReason, setApprovalReason] = useState('Adding custom field via Object Manager');

    // Field-Level Security (FLS) Dialog State
    const [flsField, setFlsField] = useState<MetadataField | null>(null);
    const [flsGrants, setFlsGrants] = useState<
        Record<string, { canRead: boolean; canWrite: boolean }>
    >({});
    const [savingFls, setSavingFls] = useState(false);

    const openFlsDialog = (field: MetadataField) => {
        const map: Record<string, { canRead: boolean; canWrite: boolean }> = {};
        for (const r of CONFIGURABLE_ROLES) {
            const existing = field.permissions?.find(p => p.role === r.role);
            map[r.role] = existing
                ? { canRead: Boolean(existing.canRead), canWrite: Boolean(existing.canWrite) }
                : {
                      canRead: r.role === 'SCHOOL_ADMIN',
                      canWrite: r.role === 'SCHOOL_ADMIN',
                  };
        }
        setFlsGrants(map);
        setFlsField(field);
    };

    const handleSaveFls = async () => {
        if (!flsField) return;
        setSavingFls(true);
        try {
            const grantsPayload = Object.entries(flsGrants).map(([role, g]) => ({
                role,
                canRead: g.canRead || g.canWrite,
                canWrite: g.canWrite,
            }));
            const res = await updateFieldPermissions(objectId, flsField.apiName, grantsPayload);
            if (!res.success) {
                toast.error(res.error || 'Failed to update field permissions.');
                return;
            }
            setFields(prev =>
                prev.map(f =>
                    f.apiName === flsField.apiName
                        ? { ...f, permissions: grantsPayload }
                        : f,
                ),
            );
            toast.success(`Permissions updated for ${flsField.label}`);
            setFlsField(null);
            if (res.objectId && res.objectId !== objectId) {
                router.replace(`/settings/objects/${res.objectId}`);
            } else {
                router.refresh();
            }
        } finally {
            setSavingFls(false);
        }
    };

    const handleCreateField = async () => {
        setIsSaving(true);
        try {
            const fieldData: Record<string, unknown> = {
                label: newLabel,
                apiName: newApiName,
                dataType: newType,
                isRequired:
                    newType === 'FORMULA' || newType === 'ROLLUP_SUMMARY'
                        ? false
                        : newRequired,
                picklistOptions:
                    newType === 'PICKLIST'
                        ? newOptions.split(',').map(s => s.trim())
                        : null,
                lookupTargetObject: newType === 'LOOKUP' ? newLookupTarget : undefined,
                formulaExpression: newType === 'FORMULA' ? newFormulaExpr : undefined,
                rollupChildObject:
                    newType === 'ROLLUP_SUMMARY' ? newRollupChildObject : undefined,
                rollupForeignKeyField:
                    newType === 'ROLLUP_SUMMARY' ? newRollupFkField : undefined,
                rollupAggregate:
                    newType === 'ROLLUP_SUMMARY' ? newRollupAggregate : undefined,
                rollupTargetField:
                    newType === 'ROLLUP_SUMMARY' && newRollupAggregate !== 'COUNT'
                        ? newRollupTargetField
                        : undefined,
            };
            const created = await createCustomField(objectId, fieldData, {
                reason: approvalReason,
            });

            if ('approvalRequired' in created) {
                toast.success(`Approval requested: ${created.approval.id}`);
                setIsAdding(false);
                setApprovalReason('Adding custom field via Object Manager');
                router.refresh();
                return;
            }

            setFields([
                ...fields,
                {
                    id: created.id,
                    label: created.label,
                    objectId,
                    apiName: created.api_name,
                    dataType: created.data_type,
                    isCustom: true,
                    isRequired: created.is_required,
                    defaultValue: created.default_value ?? null,
                    picklistOptions: created.picklist_options,
                    validationRules: created.validation_rules ?? {},
                    status: created.status,
                    version: created.version ?? 1,
                },
            ]);

            setIsAdding(false);
            setNewLabel('');
            setNewApiName('');
            setNewType('TEXT');
            setNewOptions('');
            setNewFormulaExpr('');
            setApprovalReason('Adding custom field via Object Manager');
            if (created.object_id && created.object_id !== objectId) {
                router.replace(`/settings/objects/${created.object_id}`);
            } else {
                router.refresh();
            }
        } catch (e: unknown) {
            toast.error((e as Error).message || 'Failed to create field');
        } finally {
            setIsSaving(false);
        }
    };

    const lookupTargetChoices =
        availableObjects.length > 0
            ? availableObjects
            : [
                  { api_name: 'student', name: 'Student' },
                  { api_name: 'staff', name: 'Staff' },
                  { api_name: 'invoice', name: 'Invoice' },
              ];

    return (
        <>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Fields, Lookups, Formulas &amp; FLS</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                            Custom fields, relational lookups (`LOOKUP`), and calculated formulas (`FORMULA`) enforce per-role Field-Level Security (FLS).
                        </p>
                    </div>
                    <Dialog open={isAdding} onOpenChange={setIsAdding}>
                        <DialogTrigger asChild>
                            <Button size="sm">
                                <Plus className="w-4 h-4 mr-2" /> New Custom Field
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Create Custom Field</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 pt-4">
                                <div className="space-y-2">
                                    <Label>Field Label</Label>
                                    <Input
                                        value={newLabel}
                                        onChange={e => {
                                            setNewLabel(e.target.value);
                                            if (
                                                !newApiName ||
                                                newApiName ===
                                                    newLabel
                                                        .toLowerCase()
                                                        .replace(/[^a-z0-9]/g, '_')
                                            ) {
                                                setNewApiName(
                                                    e.target.value
                                                        .toLowerCase()
                                                        .replace(/[^a-z0-9]/g, '_'),
                                                );
                                            }
                                        }}
                                        placeholder="e.g. Sponsor Student or Balance Due"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>API Name (internal)</Label>
                                    <Input
                                        value={newApiName}
                                        onChange={e => setNewApiName(e.target.value)}
                                        placeholder="e.g. sponsor_student_id"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Data Type</Label>
                                    <Select value={newType} onValueChange={setNewType}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="TEXT">Text</SelectItem>
                                            <SelectItem value="NUMBER">Number</SelectItem>
                                            <SelectItem value="CURRENCY">Currency</SelectItem>
                                            <SelectItem value="DATE">Date</SelectItem>
                                            <SelectItem value="BOOLEAN">Checkbox (Boolean)</SelectItem>
                                            <SelectItem value="PICKLIST">Picklist (Dropdown)</SelectItem>
                                            <SelectItem value="LOOKUP">Relational Lookup (Parent Object)</SelectItem>
                                            <SelectItem value="FORMULA">Calculated Formula (f(x))</SelectItem>
                                            <SelectItem value="ROLLUP_SUMMARY">Roll-Up Summary (Child Aggregate)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {newType === 'ROLLUP_SUMMARY' && (
                                    <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs">Child Object API Name</Label>
                                            <Select
                                                value={newRollupChildObject}
                                                onValueChange={setNewRollupChildObject}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {lookupTargetChoices.map(obj => (
                                                        <SelectItem
                                                            key={obj.api_name}
                                                            value={obj.api_name}
                                                        >
                                                            {obj.name} ({obj.api_name})
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1.5">
                                                <Label className="text-xs">Child Lookup Field</Label>
                                                <Input
                                                    value={newRollupFkField}
                                                    onChange={e => setNewRollupFkField(e.target.value)}
                                                    placeholder="e.g. program_id"
                                                    className="font-mono text-xs"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className="text-xs">Aggregate Function</Label>
                                                <Select
                                                    value={newRollupAggregate}
                                                    onValueChange={setNewRollupAggregate}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="COUNT">COUNT</SelectItem>
                                                        <SelectItem value="SUM">SUM</SelectItem>
                                                        <SelectItem value="AVG">AVG</SelectItem>
                                                        <SelectItem value="MIN">MIN</SelectItem>
                                                        <SelectItem value="MAX">MAX</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        {newRollupAggregate !== 'COUNT' && (
                                            <div className="space-y-1.5">
                                                <Label className="text-xs">Child Numeric Field to Aggregate</Label>
                                                <Input
                                                    value={newRollupTargetField}
                                                    onChange={e => setNewRollupTargetField(e.target.value)}
                                                    placeholder="e.g. paid_amount or credits_earned"
                                                    className="font-mono text-xs"
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {newType === 'PICKLIST' && (
                                    <div className="space-y-2">
                                        <Label>Options (comma separated)</Label>
                                        <Input
                                            value={newOptions}
                                            onChange={e => setNewOptions(e.target.value)}
                                            placeholder="A+, A-, B+, O+"
                                        />
                                    </div>
                                )}

                                {newType === 'LOOKUP' && (
                                    <div className="space-y-2">
                                        <Label>Target Parent Object</Label>
                                        <Select
                                            value={newLookupTarget}
                                            onValueChange={setNewLookupTarget}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {lookupTargetChoices.map(obj => (
                                                    <SelectItem
                                                        key={obj.api_name}
                                                        value={obj.api_name}
                                                    >
                                                        {obj.name} ({obj.api_name})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground">
                                            Links each record to a parent {newLookupTarget} record with a searchable picker and related list.
                                        </p>
                                    </div>
                                )}

                                {newType === 'FORMULA' && (
                                    <div className="space-y-2">
                                        <Label>Formula Expression</Label>
                                        <Input
                                            value={newFormulaExpr}
                                            onChange={e => setNewFormulaExpr(e.target.value)}
                                            placeholder="e.g. amount - paid_amount or CONCAT(first_name, ' ', last_name)"
                                            className="font-mono text-xs"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Supports arithmetic (`+`, `-`, `*`, `/`), `CONCAT(a, b)`, and `DAYS_BETWEEN(date_field, TODAY())`.
                                        </p>
                                    </div>
                                )}

                                {newType !== 'FORMULA' && (
                                    <div className="flex items-center space-x-2 pt-2">
                                        <Switch
                                            checked={newRequired}
                                            onCheckedChange={setNewRequired}
                                            id="required"
                                        />
                                        <Label htmlFor="required">Required Field</Label>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label>Approval Reason</Label>
                                    <Input
                                        value={approvalReason}
                                        onChange={e => setApprovalReason(e.target.value)}
                                        placeholder="Reason for publishing this field"
                                    />
                                </div>

                                <Button
                                    className="w-full mt-4"
                                    onClick={handleCreateField}
                                    disabled={
                                        isSaving ||
                                        !newLabel.trim() ||
                                        !newApiName.trim() ||
                                        !approvalReason.trim() ||
                                        (newType === 'FORMULA' && !newFormulaExpr.trim())
                                    }
                                >
                                    {isSaving ? 'Submitting…' : 'Create Field'}
                                </Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border border-border">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-muted text-muted-foreground border-b border-border">
                                <tr>
                                    <th className="px-4 py-3 font-medium">Field Label</th>
                                    <th className="px-4 py-3 font-medium">API Name</th>
                                    <th className="px-4 py-3 font-medium">Data Type</th>
                                    <th className="px-4 py-3 font-medium">Status</th>
                                    <th className="px-4 py-3 font-medium text-center">Origin</th>
                                    <th className="px-4 py-3 font-medium text-right">Permissions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {fields.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan={6}
                                            className="px-4 py-10 text-center text-muted-foreground"
                                        >
                                            This object has no fields registered in the metadata
                                            catalogue yet.
                                        </td>
                                    </tr>
                                )}
                                {fields.map((f, i) => (
                                    <tr
                                        key={f.id || i}
                                        className="border-b border-border last:border-0 hover:bg-muted"
                                    >
                                        <td className="px-4 py-3 font-medium text-foreground">
                                            {f.label}
                                            {f.isRequired && (
                                                <span
                                                    className="text-destructive ml-1"
                                                    title="Required"
                                                >
                                                    *
                                                </span>
                                            )}
                                            {f.dataType === 'PICKLIST' &&
                                                f.picklistOptions?.length > 0 && (
                                                    <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                                                        {f.picklistOptions.join(', ')}
                                                    </span>
                                                )}
                                            {f.validationRules?.fieldSubType === 'LOOKUP' &&
                                                f.validationRules?.lookupTargetObject && (
                                                    <span className="block text-xs font-mono text-primary mt-0.5">
                                                        Lookup → {f.validationRules.lookupTargetObject}
                                                    </span>
                                                )}
                                            {f.validationRules?.fieldSubType === 'FORMULA' &&
                                                f.validationRules?.formulaExpression && (
                                                    <span className="block text-xs font-mono text-info mt-0.5">
                                                        f(x) = {f.validationRules.formulaExpression}
                                                    </span>
                                                )}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                                            {f.apiName}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="px-2 py-1 bg-muted text-foreground text-xs rounded border border-border">
                                                {f.validationRules?.fieldSubType || f.dataType}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground text-xs">
                                            {f.status}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {f.isCustom ? (
                                                <span className="px-2 py-1 bg-info-subtle text-info text-xs rounded border border-info/30">
                                                    Custom
                                                </span>
                                            ) : (
                                                <span className="px-2 py-1 bg-accent text-primary text-xs rounded border border-primary/20">
                                                    Standard
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => openFlsDialog(f)}
                                                data-testid={`fls-btn-${f.apiName}`}
                                                className="text-xs text-muted-foreground hover:text-primary"
                                            >
                                                <Shield className="w-3.5 h-3.5 mr-1" />
                                                FLS Matrix
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Field-Level Security (FLS) Role Permissions Dialog */}
            <Dialog open={Boolean(flsField)} onOpenChange={open => !open && setFlsField(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            Field-Level Security · {flsField?.label} ({flsField?.apiName})
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                        <p className="text-xs text-muted-foreground">
                            Configure which tenant roles can read or edit this field across forms, tables, and `/api/data`.
                        </p>
                        <div className="rounded-lg border border-border overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-muted text-xs uppercase text-muted-foreground border-b border-border">
                                    <tr>
                                        <th className="px-3 py-2 text-left">Role</th>
                                        <th className="px-3 py-2 text-center">Read</th>
                                        <th className="px-3 py-2 text-center">Write</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {CONFIGURABLE_ROLES.map(r => {
                                        const grant = flsGrants[r.role] ?? {
                                            canRead: false,
                                            canWrite: false,
                                        };
                                        return (
                                            <tr key={r.role}>
                                                <td className="px-3 py-2.5 font-medium text-foreground">
                                                    {r.label}
                                                </td>
                                                <td className="px-3 py-2.5 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={grant.canRead || grant.canWrite}
                                                        onChange={e =>
                                                            setFlsGrants(prev => ({
                                                                ...prev,
                                                                [r.role]: {
                                                                    canRead: e.target.checked,
                                                                    canWrite: e.target.checked
                                                                        ? grant.canWrite
                                                                        : false,
                                                                },
                                                            }))
                                                        }
                                                        aria-label={`${r.label} read`}
                                                    />
                                                </td>
                                                <td className="px-3 py-2.5 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={grant.canWrite}
                                                        onChange={e =>
                                                            setFlsGrants(prev => ({
                                                                ...prev,
                                                                [r.role]: {
                                                                    canRead: e.target.checked
                                                                        ? true
                                                                        : grant.canRead,
                                                                    canWrite: e.target.checked,
                                                                },
                                                            }))
                                                        }
                                                        aria-label={`${r.label} write`}
                                                    />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <Button
                            className="w-full"
                            onClick={handleSaveFls}
                            disabled={savingFls}
                        >
                            {savingFls ? 'Saving Permissions…' : 'Save Role Permissions'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
