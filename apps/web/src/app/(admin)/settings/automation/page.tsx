import { getWorkflows } from "@/lib/actions/automation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle, FileCode2, ToggleRight } from "lucide-react";
import Link from "next/link";
import { AutomationList } from "@/components/automation/automation-list";
import { AutomationRunnerNotice } from "./runner-notice";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export const metadata = {
  title: 'Workflow Automation | School SIS',
};

export default async function AutomationPage() {
  const workflows = await getWorkflows();
  const enabledCount = workflows.filter(w => w.isActive).length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Workflow Automation</h1>
          <p className="text-muted-foreground mt-1">
            Draft metadata-driven rules describing how your school should react to events.
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
            <FileCode2 className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{workflows.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Marked enabled</CardTitle>
            <ToggleRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{enabledCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Stored flag only — nothing runs these yet.
            </p>
          </CardContent>
        </Card>
      </div>

      <AutomationList initialWorkflows={workflows} />
    </div>
  );
}
