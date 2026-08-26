'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCustomObject } from '@/lib/actions/metadata-engine';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type DraftField = {
    label: string;
    apiName: string;
    dataType: string;
    isRequired: boolean;
    picklistOptions: string;
};

const DATA_TYPES = ['TEXT', 'NUMBER', 'CURRENCY', 'BOOLEAN', 'DATE', 'PICKLIST'] as const;

function slugify(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 60);
}

function emptyField(): DraftField {
    return { label: '', apiName: '', dataType: 'TEXT', isRequired: false, picklistOptions: '' };
}

/**
 * Defines a new tenant object without writing a page, a migration, or a service.
 * On success the runtime surface at /app/<api_name> exists immediately.
 */
export default function NewObjectDialog() {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [name, setName] = useState('');
    const [apiName, setApiName] = useState('');
    const [description, setDescription] = useState('');
    const [reason, setReason] = useState('');
    const [fields, setFields] = useState<DraftField[]>([emptyField()]);
    const [pendingApprovalId, setPendingApprovalId] = useState<string | null>(null);

    const updateField = (index: number, patch: Partial<DraftField>) => {
        setFields(current => current.map((field, i) => (i === index ? { ...field, ...patch } : field)));
    };

    const submit = async (approvalRequestId?: string) => {
        setIsSaving(true);
        try {
            const result = await createCustomObject(
                {
                    name,
                    apiName,
                    description,
                    fields: fields.map(field => ({
                        label: field.label,
                        apiName: field.apiName,
                        dataType: field.dataType,
                        isRequired: field.isRequired,
                        picklistOptions:
                            field.dataType === 'PICKLIST'
                                ? field.picklistOptions.split(',').map(option => option.trim()).filter(Boolean)
                                : [],
                    })),
                },
                { reason, approvalRequestId },
            );

            if (result.success) {
                toast.success(`Object "${result.apiName}" is live at /app/${result.apiName}`);
                setOpen(false);
                setPendingApprovalId(null);
                setName('');
                setApiName('');
                setDescription('');
                setReason('');
                setFields([emptyField()]);
                router.refresh();
                return;
            }

            if (result.approvalRequired && result.approvalId) {
                setPendingApprovalId(result.approvalId);
                toast.message('Approval requested', {
                    description: 'Approve it in Approvals, then press Publish again.',
                });
                return;
            }

            toast.error(result.error || 'Could not create the object.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <Plus className="mr-2 h-4 w-4" /> New Custom Object
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>New Custom Object</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="object-name">Name</Label>
                            <Input
                                id="object-name"
                                placeholder="e.g. Lost and Found Item"
                                value={name}
                                onChange={event => {
                                    setName(event.target.value);
                                    if (!apiName) setApiName(slugify(event.target.value));
                                }}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="object-api-name">API Name</Label>
                            <Input
                                id="object-api-name"
                                placeholder="e.g. lost_and_found_item"
                                value={apiName}
                                onChange={event => setApiName(slugify(event.target.value))}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="object-description">Description</Label>
                        <Textarea
                            id="object-description"
                            placeholder="What does this object track?"
                            value={description}
                            onChange={event => setDescription(event.target.value)}
                        />
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label>Fields</Label>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setFields(current => [...current, emptyField()])}
                            >
                                <Plus className="mr-1 h-3 w-3" /> Add field
                            </Button>
                        </div>

                        {fields.map((field, index) => (
                            <div key={index} className="space-y-3 rounded-md border p-3">
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                    <Input
                                        aria-label={`Field ${index + 1} label`}
                                        placeholder="Label"
                                        value={field.label}
                                        onChange={event => {
                                            const label = event.target.value;
                                            updateField(index, {
                                                label,
                                                apiName: field.apiName || slugify(label),
                                            });
                                        }}
                                    />
                                    <Input
                                        aria-label={`Field ${index + 1} API name`}
                                        placeholder="api_name"
                                        value={field.apiName}
                                        onChange={event => updateField(index, { apiName: slugify(event.target.value) })}
                                    />
                                    <Select
                                        value={field.dataType}
                                        onValueChange={value => updateField(index, { dataType: value })}
                                    >
                                        <SelectTrigger aria-label={`Field ${index + 1} type`}>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {DATA_TYPES.map(type => (
                                                <SelectItem key={type} value={type}>
                                                    {type}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {field.dataType === 'PICKLIST' && (
                                    <Input
                                        aria-label={`Field ${index + 1} options`}
                                        placeholder="Comma separated options"
                                        value={field.picklistOptions}
                                        onChange={event => updateField(index, { picklistOptions: event.target.value })}
                                    />
                                )}

                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Switch
                                            id={`required-${index}`}
                                            checked={field.isRequired}
                                            onCheckedChange={checked => updateField(index, { isRequired: checked })}
                                        />
                                        <Label htmlFor={`required-${index}`} className="text-sm font-normal">
                                            Required
                                        </Label>
                                    </div>
                                    {fields.length > 1 && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setFields(current => current.filter((_, i) => i !== index))}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="object-reason">Reason for publishing</Label>
                        <Input
                            id="object-reason"
                            placeholder="Required by the metadata publish approval policy"
                            value={reason}
                            onChange={event => setReason(event.target.value)}
                        />
                    </div>

                    {pendingApprovalId && (
                        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                            Approval request <span className="font-mono">{pendingApprovalId}</span> is pending. Approve
                            it under Approvals, then press Publish again.
                        </p>
                    )}

                    <div className="flex justify-end gap-2 border-t pt-4">
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            disabled={isSaving}
                            onClick={() => submit(pendingApprovalId ?? undefined)}
                        >
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Publish Object
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
