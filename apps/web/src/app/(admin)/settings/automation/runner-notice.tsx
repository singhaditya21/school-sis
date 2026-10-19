import { Zap } from 'lucide-react';

/**
 * Automation rules in `metadata_workflows` are evaluated inline when metadata
 * records are created or updated (`object.record.upserted`), recording each
 * matched execution in `audit_logs` (`WORKFLOW_EXECUTED`).
 */
export function AutomationRunnerNotice() {
    return (
        <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-accent/50 p-4 text-sm text-foreground">
            <Zap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="space-y-1">
                <p className="font-semibold">Live Metadata Workflow Engine Active</p>
                <p className="text-muted-foreground">
                    Active rules on <code className="font-mono text-xs">object.record.upserted</code> are
                    evaluated automatically whenever records are created or updated in the Metadata
                    Engine or Drag-and-Drop Kanban boards, and log every matched execution to the
                    tenant audit trail.
                </p>
            </div>
        </div>
    );
}
