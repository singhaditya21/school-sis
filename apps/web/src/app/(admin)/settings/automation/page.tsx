import { getWorkflows, getWorkflowExecutions } from "@/lib/actions/automation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, FileCode2, ToggleRight, Zap } from "lucide-react";
import Link from "next/link";
import { AutomationList } from "@/components/automation/automation-list";
import { AutomationRunnerNotice } from "./runner-notice";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export const metadata = {
  title: 'Workflow Automation | ScholarMind',
};

export default async function AutomationPage() {
  const [workflows, executions] = await Promise.all([
    getWorkflows(),
    getWorkflowExecutions(8),
  ]);
  const enabledCount = workflows.filter(w => w.isActive).length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Workflow Automation</h1>
          <p className="text-muted-foreground mt-1">
            Metadata-driven rules that automatically update fields, schedule tasks, queue emails, or fire signed webhooks.
          </p>
        </div>
        <Link href="/settings/automation/new">
          <Button className="gap-2">
            <PlusCircle className="h-4 w-4" />
            Create Workflow
          </Button>
        </Link>
      </div>

      <AutomationRunnerNotice />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saved definitions</CardTitle>
            <FileCode2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{workflows.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active rules</CardTitle>
            <ToggleRight className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{enabledCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Evaluated automatically on record upsert
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent executions</CardTitle>
            <Zap className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{executions.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Logged in tenant audit trail
            </p>
          </CardContent>
        </Card>
      </div>

      <AutomationList initialWorkflows={workflows} />

      {executions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Workflow Execution Log</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {executions.map((exec) => (
              <div
                key={exec.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono">
                    {exec.afterState?.actionType || 'ACTION'}
                  </Badge>
                  <span className="font-medium text-foreground">
                    {exec.afterState?.workflowName || 'Workflow Rule'}
                  </span>
                  <span className="text-muted-foreground">
                    on <code className="font-mono">{exec.entityType}</code>
                  </span>
                </div>
                <span className="text-muted-foreground font-mono">
                  {exec.afterState?.executedAt
                    ? new Date(exec.afterState.executedAt).toLocaleString()
                    : new Date(exec.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
