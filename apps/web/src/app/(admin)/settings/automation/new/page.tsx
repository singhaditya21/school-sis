import { WorkflowBuilder } from "@/components/automation/workflow-builder";

export const metadata = {
  title: 'Create Workflow | School SIS',
};

export default function NewWorkflowPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Automation</h1>
        <p className="text-muted-foreground mt-1">
          Define triggers, conditions, and actions for your new workflow.
        </p>
      </div>
      
      <WorkflowBuilder />
    </div>
  );
}
