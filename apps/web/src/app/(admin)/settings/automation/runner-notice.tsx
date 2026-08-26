import { AlertTriangle } from 'lucide-react';

/**
 * Automation rules are persisted to `metadata_workflows`, but nothing in this
 * codebase reads that table to execute them — there is no dispatcher, queue
 * consumer or cron job wired to `trigger_event`. Every automation surface says
 * so plainly rather than implying rules are live.
 */
export function AutomationRunnerNotice() {
    return (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
                <p className="font-semibold">Rules are saved, not executed.</p>
                <p>
                    This release ships the rule builder only — there is no workflow runner
                    listening for these triggers, so saving or enabling a rule records the
                    definition and sends no email, SMS or notification. Use the definitions here
                    to plan automations; they will start firing when the execution engine ships.
                </p>
            </div>
        </div>
    );
}
