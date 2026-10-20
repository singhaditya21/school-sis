import { WorkflowBuilder } from "@/components/automation/workflow-builder";
import { getAllMetadataObjects } from "@/lib/actions/metadata-engine";
import { AutomationRunnerNotice } from "../runner-notice";

export const metadata = {
  title: 'Create Workflow | ScholarMind',
};

export default async function NewWorkflowPage() {
  const objects = await getAllMetadataObjects().catch(() => []);
  const availableObjects = objects.map(obj => ({
    api_name: String(obj.api_name),
    label: String(obj.name || obj.label || obj.plural_label || obj.api_name),
  }));

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Automation</h1>
        <p className="text-muted-foreground mt-1">
          Define triggers, conditions, and actions. The definition is saved to your school&apos;s
          workflow metadata.
        </p>
      </div>

      <AutomationRunnerNotice />

      <WorkflowBuilder availableObjects={availableObjects} />
    </div>
  );
}

