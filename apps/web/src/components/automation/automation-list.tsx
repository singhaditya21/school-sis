'use client';

import { useState } from 'react';
import {
  Workflow,
  toggleWorkflow,
  deleteWorkflow,
  triggerWorkflowTestRun,
} from '@/lib/actions/automation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Trash2, ArrowRight, Play } from 'lucide-react';
import { toast } from 'sonner';

export function AutomationList({ initialWorkflows }: { initialWorkflows: Workflow[] }) {
  const [workflows, setWorkflows] = useState(initialWorkflows);
  const [pendingDelete, setPendingDelete] = useState<Workflow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);

  const handleToggle = async (id: string, current: boolean) => {
    await toggleWorkflow(id, !current);
    setWorkflows(workflows.map(w => w.id === id ? { ...w, isActive: !current } : w));
  };

  const handleTestRun = async (workflow: Workflow) => {
    setRunningId(workflow.id);
    try {
      const res = await triggerWorkflowTestRun(workflow.id);
      if (res.success && res.result) {
        toast.success(
          `Executed "${workflow.name}" (${res.result.actionType}) — logged to tenant audit trail.`,
        );
      } else {
        toast.error(res.error || 'Workflow test run failed.');
      }
    } catch {
      toast.error('Workflow test run failed.');
    } finally {
      setRunningId(null);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteWorkflow(pendingDelete.id);
      setWorkflows(workflows.filter(w => w.id !== pendingDelete.id));
      setPendingDelete(null);
      toast.success('Workflow deleted.');
    } catch {
      toast.error('Could not delete the workflow.');
    } finally {
      setDeleting(false);
    }
  };

  if (workflows.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center py-12 text-center">
        <CardTitle className="text-xl mb-2">No workflows found</CardTitle>
        <CardDescription>Create your first workflow to automate your operations.</CardDescription>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {workflows.map((workflow) => (
        <Card key={workflow.id} className={`transition-all ${!workflow.isActive ? 'opacity-60' : ''}`}>
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-lg">{workflow.name}</CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="font-mono text-xs">{workflow.objectName}</Badge>
                <ArrowRight className="h-3 w-3" />
                <span className="text-xs font-medium">{workflow.triggerEvent}</span>
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={runningId === workflow.id}
                onClick={() => handleTestRun(workflow)}
                data-testid={`test-run-workflow-${workflow.id}`}
              >
                <Play className="h-3.5 w-3.5 text-primary" />
                {runningId === workflow.id ? 'Running…' : 'Test Run'}
              </Button>
              <Switch 
                checked={workflow.isActive} 
                onCheckedChange={() => handleToggle(workflow.id, workflow.isActive)}
              />
              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setPendingDelete(workflow)} aria-label={`Delete ${workflow.name}`}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="secondary">
                Action: {workflow.actionType}
              </Badge>
              {workflow.conditions && workflow.conditions.length > 0 && (
                <Badge variant="secondary">
                  {workflow.conditions.length} Condition(s)
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
      <Dialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open && !deleting) setPendingDelete(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete workflow?</DialogTitle>
            <DialogDescription>
              {pendingDelete ? `${pendingDelete.name} will be permanently removed.` : 'This workflow will be permanently removed.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={deleting} onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={deleting} onClick={handleDelete}>
              {deleting ? 'Deleting…' : 'Delete workflow'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
