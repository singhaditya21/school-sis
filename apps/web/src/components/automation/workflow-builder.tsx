'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createWorkflow } from '@/lib/actions/automation';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    ArrowDown,
    Filter,
    GripVertical,
    Play,
    PlusCircle,
    Trash2,
    Zap,
} from 'lucide-react';
import { toast } from 'sonner';

const PALETTE_BLOCKS = [
    {
        id: 'cond-equals',
        kind: 'CONDITION' as const,
        label: 'Filter: Field Equals',
        operator: 'equals',
        description: 'Continue only when a field matches a value',
    },
    {
        id: 'cond-not-equals',
        kind: 'CONDITION' as const,
        label: 'Filter: Field Not Equal',
        operator: 'not_equals',
        description: 'Continue when a field differs from a value',
    },
    {
        id: 'cond-contains',
        kind: 'CONDITION' as const,
        label: 'Filter: Text Contains',
        operator: 'contains',
        description: 'Continue when text contains substring',
    },
    {
        id: 'cond-changed',
        kind: 'CONDITION' as const,
        label: 'Filter: Field Is Changed / Non-Empty',
        operator: 'is_changed',
        description: 'Continue when a field value is populated or updated',
    },
    {
        id: 'act-email',
        kind: 'ACTION' as const,
        label: 'Action: Send Email',
        actionType: 'SEND_EMAIL',
        defaultPayload: '{"to_field": "email", "template": "welcome"}',
        description: 'Dispatch templated email notification',
    },
    {
        id: 'act-webhook',
        kind: 'ACTION' as const,
        label: 'Action: Call Webhook',
        actionType: 'WEBHOOK',
        defaultPayload: '{"url": "https://example.org/webhook", "method": "POST"}',
        description: 'POST record payload to external endpoint',
    },
    {
        id: 'act-update',
        kind: 'ACTION' as const,
        label: 'Action: Update Field',
        actionType: 'UPDATE_FIELD',
        defaultPayload: '{"field": "status", "value": "REVIEWED"}',
        description: 'Apply automated field update on the record',
    },
    {
        id: 'act-task',
        kind: 'ACTION' as const,
        label: 'Action: Create Follow-Up Task',
        actionType: 'CREATE_TASK',
        defaultPayload: '{"title": "Follow up on record", "due_days": 1, "type": "FOLLOW_UP"}',
        description: 'Schedule a staff task and queue background job',
    },
    {
        id: 'act-create-record',
        kind: 'ACTION' as const,
        label: 'Action: Create Linked Record',
        actionType: 'CREATE_RECORD',
        defaultPayload: '{"target_object": "scholarship_grant", "field_values": {"student_id": "{id}", "approval_status": "DRAFT"}}',
        description: 'Automatically create a child or cross-object record',
    },
    {
        id: 'act-approval',
        kind: 'ACTION' as const,
        label: 'Action: Submit for Approval',
        actionType: 'SUBMIT_FOR_APPROVAL',
        defaultPayload: '{"policy": "principal_approval", "comment": "Auto-routed by workflow"}',
        description: 'Route record into declarative approval process',
    },
];

const DEFAULT_WORKFLOW_OBJECTS = [
    { api_name: 'student', label: 'Student' },
    { api_name: 'invoice', label: 'Invoice' },
    { api_name: 'employee', label: 'Employee' },
    { api_name: 'lost_and_found_item', label: 'Lost & Found Item' },
];

export function WorkflowBuilder({
    availableObjects,
}: {
    availableObjects?: Array<{ api_name: string; label: string }>;
} = {}) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [name, setName] = useState('');
    const mergedObjects = (() => {
        const map = new Map<string, string>();
        for (const item of DEFAULT_WORKFLOW_OBJECTS) {
            map.set(item.api_name, item.label);
        }
        for (const item of availableObjects ?? []) {
            if (item.api_name) {
                map.set(item.api_name, item.label || item.api_name);
            }
        }
        return Array.from(map.entries()).map(([api_name, label]) => ({ api_name, label }));
    })();
    const [objectName, setObjectName] = useState(mergedObjects[0]?.api_name || 'student');
    const [triggerEvent, setTriggerEvent] = useState('object.record.upserted');

    const [conditions, setConditions] = useState<
        { field: string; operator: string; value: string }[]
    >([]);

    const [actionType, setActionType] = useState('SEND_EMAIL');
    const [actionPayload, setActionPayload] = useState(
        '{"to_field": "email", "template": "welcome"}',
    );

    const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
    const [draggedCondIdx, setDraggedCondIdx] = useState<number | null>(null);
    const [canvasDropActive, setCanvasDropActive] = useState(false);

    const handleAddCondition = (operator = 'equals') => {
        setConditions(prev => [...prev, { field: '', operator, value: '' }]);
    };

    const handleUpdateCondition = (index: number, key: string, value: string) => {
        const newConditions = [...conditions];
        newConditions[index] = { ...newConditions[index], [key]: value };
        setConditions(newConditions);
    };

    const handleRemoveCondition = (index: number) => {
        setConditions(conditions.filter((_, i) => i !== index));
    };

    const handleCanvasDrop = () => {
        setCanvasDropActive(false);
        if (!draggedBlockId) return;
        const block = PALETTE_BLOCKS.find(b => b.id === draggedBlockId);
        setDraggedBlockId(null);
        if (!block) return;

        if (block.kind === 'CONDITION') {
            handleAddCondition(block.operator);
            toast.success(`Added "${block.label}" node to workflow canvas`);
        } else if (block.kind === 'ACTION') {
            setActionType(block.actionType);
            setActionPayload(block.defaultPayload);
            toast.success(`Switched action node to "${block.label}"`);
        }
    };

    const handleReorderCondition = (targetIdx: number) => {
        if (draggedCondIdx === null || draggedCondIdx === targetIdx) return;
        setConditions(prev => {
            const copy = [...prev];
            const [moved] = copy.splice(draggedCondIdx, 1);
            copy.splice(targetIdx, 0, moved);
            return copy;
        });
        setDraggedCondIdx(null);
    };

    const handleSave = async () => {
        try {
            setLoading(true);
            await createWorkflow({
                name,
                objectName,
                triggerEvent,
                conditions,
                actionType,
                actionPayload: JSON.parse(actionPayload),
                isActive: true,
            });
            router.push('/settings/automation');
        } catch (error) {
            console.error(error);
            toast.error('Failed to save workflow. Please check the JSON payload format.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Workflow Identity</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        <Label>Workflow Name</Label>
                        <Input
                            placeholder="e.g. Overdue Invoice Reminder"
                            value={name}
                            onChange={e => setName(e.target.value)}
                        />
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Draggable Node Palette */}
                <Card className="lg:col-span-1 h-fit">
                    <CardHeader className="pb-3 border-b border-border">
                        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                            Drag-and-Drop Node Palette
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                            Drag condition or action nodes onto the workflow canvas on the right.
                        </p>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-2.5">
                        {PALETTE_BLOCKS.map(block => (
                            <div
                                key={block.id}
                                draggable
                                onDragStart={() => setDraggedBlockId(block.id)}
                                onDragEnd={() => {
                                    setDraggedBlockId(null);
                                    setCanvasDropActive(false);
                                }}
                                data-testid={`palette-node-${block.id}`}
                                className="flex items-start gap-2.5 rounded-lg border border-border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing hover:border-primary transition-colors"
                            >
                                <GripVertical className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-semibold text-foreground">
                                            {block.label}
                                        </span>
                                        <span
                                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                                block.kind === 'CONDITION'
                                                    ? 'bg-warning-subtle text-warning'
                                                    : 'bg-accent text-primary'
                                            }`}
                                        >
                                            {block.kind}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {block.description}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                {/* Right Visual Workflow Canvas */}
                <div
                    onDragOver={e => {
                        e.preventDefault();
                        setCanvasDropActive(true);
                    }}
                    onDragLeave={() => setCanvasDropActive(false)}
                    onDrop={handleCanvasDrop}
                    data-testid="workflow-visual-canvas"
                    className={`lg:col-span-2 rounded-xl border-2 p-6 space-y-3 transition-colors ${
                        canvasDropActive
                            ? 'border-primary bg-accent/30'
                            : 'border-border bg-muted/30'
                    }`}
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Visual Automation Canvas (Drop Nodes Here)
                        </span>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddCondition('equals')}
                            className="gap-1.5"
                        >
                            <PlusCircle className="h-3.5 w-3.5" /> Add Condition Node
                        </Button>
                    </div>

                    {/* Node 1: Trigger Node */}
                    <Card className="border-2 border-primary/40 shadow-sm">
                        <CardHeader className="py-3 px-4 bg-accent/50 border-b border-border flex flex-row items-center gap-2">
                            <Play className="w-4 h-4 text-primary" />
                            <CardTitle className="text-sm font-semibold">
                                1. Trigger Node · When Event Occurs
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs">Target Object</Label>
                                <Select value={objectName} onValueChange={setObjectName}>
                                    <SelectTrigger data-testid="workflow-target-object-trigger">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {mergedObjects.map(obj => (
                                            <SelectItem key={obj.api_name} value={obj.api_name}>
                                                {obj.label} ({obj.api_name})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Trigger Event</Label>
                                <Select value={triggerEvent} onValueChange={setTriggerEvent}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="object.record.upserted">
                                            Record Upserted (Created / Updated)
                                        </SelectItem>
                                        <SelectItem value="object.record.deleted">
                                            Record Deleted
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex justify-center py-1">
                        <ArrowDown className="w-5 h-5 text-muted-foreground" />
                    </div>

                    {/* Node 2: Draggable Condition Nodes */}
                    <Card className="border border-border shadow-sm">
                        <CardHeader className="py-3 px-4 bg-muted/60 border-b border-border flex flex-row items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Filter className="w-4 h-4 text-warning" />
                                <CardTitle className="text-sm font-semibold">
                                    2. Condition Nodes (AND) · Drag to Reorder
                                </CardTitle>
                            </div>
                            <span className="text-xs text-muted-foreground">
                                {conditions.length} active
                            </span>
                        </CardHeader>
                        <CardContent className="p-4 space-y-3">
                            {conditions.length === 0 ? (
                                <p className="text-xs text-muted-foreground text-center py-4 border rounded-md border-dashed border-border">
                                    No filter conditions — drag a Filter block from the left palette or click &ldquo;Add Condition Node&rdquo;.
                                </p>
                            ) : (
                                conditions.map((cond, i) => (
                                    <div
                                        key={i}
                                        draggable
                                        onDragStart={() => setDraggedCondIdx(i)}
                                        onDragOver={e => e.preventDefault()}
                                        onDrop={() => handleReorderCondition(i)}
                                        onDragEnd={() => setDraggedCondIdx(null)}
                                        className="flex flex-wrap sm:flex-nowrap gap-3 items-end rounded-lg border border-border bg-card p-3 cursor-grab active:cursor-grabbing"
                                    >
                                        <GripVertical className="w-4 h-4 text-muted-foreground mb-2.5 shrink-0" />
                                        <div className="space-y-1 flex-1 min-w-[120px]">
                                            <Label className="text-xs">Field Name</Label>
                                            <Input
                                                placeholder="e.g. status"
                                                value={cond.field}
                                                onChange={e =>
                                                    handleUpdateCondition(
                                                        i,
                                                        'field',
                                                        e.target.value,
                                                    )
                                                }
                                            />
                                        </div>
                                        <div className="space-y-1 flex-1 min-w-[130px]">
                                            <Label className="text-xs">Operator</Label>
                                            <Select
                                                value={cond.operator}
                                                onValueChange={val =>
                                                    handleUpdateCondition(i, 'operator', val)
                                                }
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="equals">Equals</SelectItem>
                                                    <SelectItem value="not_equals">
                                                        Does not equal
                                                    </SelectItem>
                                                    <SelectItem value="contains">
                                                        Contains
                                                    </SelectItem>
                                                    <SelectItem value="greater_than">
                                                        Greater than
                                                    </SelectItem>
                                                    <SelectItem value="less_than">
                                                        Less than
                                                    </SelectItem>
                                                    <SelectItem value="is_changed">
                                                        Is Changed / Populated
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1 flex-1 min-w-[120px]">
                                            <Label className="text-xs">Value</Label>
                                            <Input
                                                placeholder="e.g. overdue"
                                                value={cond.value}
                                                onChange={e =>
                                                    handleUpdateCondition(
                                                        i,
                                                        'value',
                                                        e.target.value,
                                                    )
                                                }
                                            />
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="text-destructive mb-0.5"
                                            onClick={() => handleRemoveCondition(i)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    <div className="flex justify-center py-1">
                        <ArrowDown className="w-5 h-5 text-muted-foreground" />
                    </div>

                    {/* Node 3: Action Node */}
                    <Card className="border-2 border-success/40 shadow-sm">
                        <CardHeader className="py-3 px-4 bg-success-subtle border-b border-border flex flex-row items-center gap-2">
                            <Zap className="w-4 h-4 text-success" />
                            <CardTitle className="text-sm font-semibold">
                                3. Action Node · Execute When Matched
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs">Action Type</Label>
                                <Select value={actionType} onValueChange={setActionType}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="SEND_EMAIL">Send Email</SelectItem>
                                        <SelectItem value="WEBHOOK">Trigger Signed Webhook</SelectItem>
                                        <SelectItem value="UPDATE_FIELD">Update Record Field</SelectItem>
                                        <SelectItem value="CREATE_TASK">Create Follow-Up Task</SelectItem>
                                        <SelectItem value="CREATE_RECORD">Create Linked Record (Cross-Object)</SelectItem>
                                        <SelectItem value="SUBMIT_FOR_APPROVAL">Submit Record for Approval</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Action Payload (JSON)</Label>
                                <textarea
                                    className="flex min-h-[80px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
                                    rows={4}
                                    value={actionPayload}
                                    onChange={e => setActionPayload(e.target.value)}
                                />
                            </div>
                        </CardContent>
                        <CardFooter className="flex justify-end gap-2 border-t border-border pt-4">
                            <Button variant="ghost" onClick={() => router.back()}>
                                Cancel
                            </Button>
                            <Button onClick={handleSave} disabled={loading || !name}>
                                {loading ? 'Saving...' : 'Save Workflow'}
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            </div>
        </div>
    );
}
