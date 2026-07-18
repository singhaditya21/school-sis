'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createWorkflow } from '@/lib/actions/automation';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlusCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export function WorkflowBuilder() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [objectName, setObjectName] = useState('student');
  const [triggerEvent, setTriggerEvent] = useState('object.record.upserted');
  
  const [conditions, setConditions] = useState<{ field: string, operator: string, value: string }[]>([]);
  
  const [actionType, setActionType] = useState('SEND_EMAIL');
  const [actionPayload, setActionPayload] = useState('{"to_field": "email", "template": "welcome"}');

  const handleAddCondition = () => {
    setConditions([...conditions, { field: '', operator: 'equals', value: '' }]);
  };

  const handleUpdateCondition = (index: number, key: string, value: string) => {
    const newConditions = [...conditions];
    newConditions[index] = { ...newConditions[index], [key]: value };
    setConditions(newConditions);
  };

  const handleRemoveCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
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
      toast.error("Failed to save workflow. Please check the JSON payload format.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Workflow Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Workflow Name</Label>
            <Input placeholder="e.g. Overdue Invoice Reminder" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Target Object</Label>
              <Select value={objectName} onValueChange={setObjectName}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                  <SelectItem value="employee">Employee</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Trigger Event</Label>
              <Select value={triggerEvent} onValueChange={setTriggerEvent}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="object.record.upserted">Record Upserted</SelectItem>
                  <SelectItem value="object.record.deleted">Record Deleted</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Conditions (AND)</CardTitle>
          <Button variant="outline" size="sm" onClick={handleAddCondition} className="gap-2">
            <PlusCircle className="h-4 w-4" /> Add Condition
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {conditions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4 border rounded-md border-dashed">
              No conditions set. This workflow will fire every time the event occurs.
            </p>
          ) : (
            conditions.map((cond, i) => (
              <div key={i} className="flex gap-4 items-end">
                <div className="space-y-2 flex-1">
                  <Label>Field Name</Label>
                  <Input placeholder="e.g. status" value={cond.field} onChange={e => handleUpdateCondition(i, 'field', e.target.value)} />
                </div>
                <div className="space-y-2 flex-1">
                  <Label>Operator</Label>
                  <Select value={cond.operator} onValueChange={val => handleUpdateCondition(i, 'operator', val)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equals">Equals</SelectItem>
                      <SelectItem value="not_equals">Does not equal</SelectItem>
                      <SelectItem value="exists">Exists</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 flex-1">
                  <Label>Value</Label>
                  <Input placeholder="e.g. overdue" value={cond.value} onChange={e => handleUpdateCondition(i, 'value', e.target.value)} />
                </div>
                <Button variant="ghost" size="icon" className="text-destructive mb-0.5" onClick={() => handleRemoveCondition(i)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Action</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Action Type</Label>
            <Select value={actionType} onValueChange={setActionType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SEND_EMAIL">Send Email</SelectItem>
                <SelectItem value="WEBHOOK">Trigger Webhook</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Action Payload (JSON)</Label>
            <textarea 
              className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 font-mono"
              rows={4}
              value={actionPayload}
              onChange={e => setActionPayload(e.target.value)}
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => router.back()}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading || !name}>
            {loading ? 'Saving...' : 'Save Workflow'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
