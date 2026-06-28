import { getWorkflows } from "@/lib/actions/automation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle, Zap, Activity } from "lucide-react";
import Link from "next/link";
import { AutomationList } from "@/components/automation/automation-list";

export const metadata = {
  title: 'Workflow Automation | School SIS',
};

export default async function AutomationPage() {
  const workflows = await getWorkflows();

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Workflow Automation</h1>
          <p className="text-muted-foreground mt-1">
            Build serverless, metadata-driven rules to automate your school's operations.
          </p>
        </div>
        <Link href="/settings/automation/new">
          <Button className="gap-2">
            <PlusCircle className="h-4 w-4" />
            Create Workflow
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Workflows</CardTitle>
            <Zap className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{workflows.filter(w => w.isActive).length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Workflows</CardTitle>
            <Activity className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{workflows.length}</div>
          </CardContent>
        </Card>
      </div>

      <AutomationList initialWorkflows={workflows} />
    </div>
  );
}
