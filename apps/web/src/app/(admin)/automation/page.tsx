import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { isAdminRole } from '@/lib/rbac';
import { getWorkflows } from '@/lib/actions/automation';
import AutomationClient from './automation-client';
import { AutomationRunnerNotice } from '../settings/automation/runner-notice';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function AutomationPage() {
    const session = await getSession();

    if (!session.isLoggedIn || !isAdminRole(session.role!)) {
        redirect('/dashboard');
    }

    const workflows = await getWorkflows();

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                        Workflow Automation
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Rules describing how your school should react to events.
                    </p>
                </div>
            </div>

            <AutomationRunnerNotice />

            <AutomationClient initialWorkflows={workflows} />
        </div>
    );
}
