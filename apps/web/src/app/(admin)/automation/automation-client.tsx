'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Zap, Mail, Bell } from 'lucide-react';
import { toggleWorkflow, createWorkflow, deleteWorkflow, Workflow } from '@/lib/actions/automation';

export default function AutomationClient({ initialWorkflows }: { initialWorkflows: Workflow[] }) {
    const [workflows, setWorkflows] = useState<Workflow[]>(initialWorkflows);
    const [isCreating, setIsCreating] = useState(false);
    
    // Form state
    const [name, setName] = useState('');
    const [triggerEvent, setTriggerEvent] = useState('FEE_OVERDUE');
    const [actionType, setActionType] = useState('SEND_EMAIL');
    const [actionPayload, setActionPayload] = useState('{"template": "fee_reminder"}');
    
    const handleToggle = async (id: string, currentStatus: boolean) => {
        setWorkflows(workflows.map(w => w.id === id ? { ...w, isActive: !currentStatus } : w));
        await toggleWorkflow(id, !currentStatus);
    };

    const handleDelete = async (id: string) => {
        setWorkflows(workflows.filter(w => w.id !== id));
        await deleteWorkflow(id);
    };

    const handleCreate = async () => {
        let payload = {};
        try { payload = JSON.parse(actionPayload); } catch (e) { payload = { raw: actionPayload }; }
        
        await createWorkflow({
            name,
            triggerEvent,
            actionType,
            actionPayload: payload,
            isActive: true
        });
        
        setIsCreating(false);
        // Refresh page to get new items (or we could fetch via action)
        window.location.reload();
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-slate-800">Active Rules</h2>
                <Button onClick={() => setIsCreating(!isCreating)}>
                    <Plus className="w-4 h-4 mr-2" /> New Rule
                </Button>
            </div>

            {isCreating && (
                <Card className="border-blue-200 shadow-sm bg-blue-50/30">
                    <CardHeader>
                        <CardTitle className="text-lg">Create New Workflow Rule</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Rule Name</Label>
                                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Overdue Fee Reminder" />
                            </div>
                            <div className="space-y-2">
                                <Label>Trigger Event</Label>
                                <select className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    value={triggerEvent} onChange={e => setTriggerEvent(e.target.value)}>
                                    <option value="FEE_OVERDUE">Fee Overdue</option>
                                    <option value="STUDENT_ABSENT">Student Absent</option>
                                    <option value="EXAM_PUBLISHED">Exam Published</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label>Action Type</Label>
                                <select className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    value={actionType} onChange={e => setActionType(e.target.value)}>
                                    <option value="SEND_EMAIL">Send Email</option>
                                    <option value="SEND_SMS">Send SMS</option>
                                    <option value="NOTIFY_APP">In-App Notification</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label>Action Payload (JSON)</Label>
                                <Input value={actionPayload} onChange={e => setActionPayload(e.target.value)} />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-4">
                            <Button variant="outline" onClick={() => setIsCreating(false)}>Cancel</Button>
                            <Button onClick={handleCreate}>Save Rule</Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {workflows.map(workflow => (
                    <Card key={workflow.id} className={!workflow.isActive ? "opacity-60" : ""}>
                        <CardHeader className="pb-2 flex flex-row items-start justify-between">
                            <div>
                                <CardTitle className="text-md flex items-center gap-2">
                                    <Zap className="w-4 h-4 text-amber-500" /> {workflow.name}
                                </CardTitle>
                                <CardDescription className="mt-1">
                                    When: <Badge variant="secondary" className="text-xs">{workflow.triggerEvent}</Badge>
                                </CardDescription>
                            </div>
                            <Switch 
                                checked={workflow.isActive} 
                                onCheckedChange={() => handleToggle(workflow.id, workflow.isActive)} 
                            />
                        </CardHeader>
                        <CardContent className="pt-4 border-t mt-4 flex justify-between items-center">
                            <div className="flex items-center text-sm text-slate-600 gap-2">
                                {workflow.actionType.includes('EMAIL') ? <Mail className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                                {workflow.actionType}
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(workflow.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </CardContent>
                    </Card>
                ))}
                
                {workflows.length === 0 && !isCreating && (
                    <div className="col-span-full py-12 text-center border-2 border-dashed rounded-lg text-slate-500">
                        No automation rules configured yet.
                    </div>
                )}
            </div>
        </div>
    );
}
