'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Zap, ArrowRight } from 'lucide-react';
import { toggleWorkflow, deleteWorkflow, type Workflow } from '@/lib/actions/automation';

type Condition = { field?: string; operator?: string; value?: string };

function conditionCount(conditions: Workflow['conditions']): number {
    return Array.isArray(conditions) ? (conditions as Condition[]).length : 0;
}

export default function AutomationClient({ initialWorkflows }: { initialWorkflows: Workflow[] }) {
    const router = useRouter();
    const [workflows, setWorkflows] = useState<Workflow[]>(initialWorkflows);
    const [pendingId, setPendingId] = useState<string | null>(null);
    const [, startTransition] = useTransition();

    const handleToggle = async (workflow: Workflow) => {
        const next = !workflow.isActive;
        setPendingId(workflow.id);
        setWorkflows((prev) =>
            prev.map((w) => (w.id === workflow.id ? { ...w, isActive: next } : w)),
        );

        try {
            await toggleWorkflow(workflow.id, next);
            toast.success(
                next
                    ? `"${workflow.name}" marked enabled. It is stored, not executed.`
                    : `"${workflow.name}" marked disabled.`,
            );
            startTransition(() => router.refresh());
        } catch {
            setWorkflows((prev) =>
                prev.map((w) => (w.id === workflow.id ? { ...w, isActive: !next } : w)),
            );
            toast.error('Could not update this rule.');
        } finally {
            setPendingId(null);
        }
    };

    const handleDelete = async (workflow: Workflow) => {
        const snapshot = workflows;
        setPendingId(workflow.id);
        setWorkflows((prev) => prev.filter((w) => w.id !== workflow.id));

        try {
            await deleteWorkflow(workflow.id);
            toast.success(`Deleted "${workflow.name}".`);
            startTransition(() => router.refresh());
        } catch {
            setWorkflows(snapshot);
            toast.error('Could not delete this rule.');
        } finally {
            setPendingId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-foreground dark:text-slate-100">
                    Saved rules ({workflows.length})
                </h2>
                <Link href="/settings/automation/new">
                    <Button className="gap-2">
                        <Plus className="h-4 w-4" /> New rule
                    </Button>
                </Link>
            </div>

            {workflows.length === 0 ? (
                <div className="rounded-lg border-2 border-dashed py-12 text-center text-muted-foreground">
                    <p className="font-medium text-foreground dark:text-slate-200">
                        No automation rules defined yet.
                    </p>
                    <p className="mt-1 text-sm">
                        Use the rule builder to describe a trigger, its conditions and the action
                        it should take.
                    </p>
                    <Link href="/settings/automation/new">
                        <Button variant="outline" className="mt-4 gap-2">
                            <Plus className="h-4 w-4" /> Open the rule builder
                        </Button>
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {workflows.map((workflow) => {
                        const conditions = conditionCount(workflow.conditions);
                        const busy = pendingId === workflow.id;

                        return (
                            <Card
                                key={workflow.id}
                                className={workflow.isActive ? undefined : 'opacity-60'}
                            >
                                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
                                    <div className="min-w-0">
                                        <CardTitle className="flex items-center gap-2 text-base">
                                            <Zap className="h-4 w-4 shrink-0 text-amber-500" />
                                            <span className="truncate">{workflow.name}</span>
                                        </CardTitle>
                                        <CardDescription className="mt-2 flex flex-wrap items-center gap-2">
                                            <Badge variant="outline" className="font-mono text-xs">
                                                {workflow.objectName}
                                            </Badge>
                                            <ArrowRight className="h-3 w-3" />
                                            <span className="text-xs font-medium">
                                                {workflow.triggerEvent}
                                            </span>
                                        </CardDescription>
                                    </div>
                                    <Switch
                                        checked={workflow.isActive}
                                        disabled={busy}
                                        aria-label={`Mark ${workflow.name} enabled`}
                                        onCheckedChange={() => handleToggle(workflow)}
                                    />
                                </CardHeader>
                                <CardContent className="mt-4 flex items-center justify-between border-t pt-4">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant="secondary" className="text-xs">
                                            {workflow.actionType}
                                        </Badge>
                                        <Badge variant="secondary" className="text-xs">
                                            {conditions === 1
                                                ? '1 condition'
                                                : `${conditions} conditions`}
                                        </Badge>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        disabled={busy}
                                        aria-label={`Delete ${workflow.name}`}
                                        onClick={() => handleDelete(workflow)}
                                        className="text-red-500 hover:bg-red-50 hover:text-red-700"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
