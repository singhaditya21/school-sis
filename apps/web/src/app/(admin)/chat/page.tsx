import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAuth } from '@/lib/auth/middleware';
import { isCopilotRole, listCopilotDatasets } from '@/app/api/copilot/catalog';
import CopilotConsole from './copilot-console';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Report Copilot | School SIS',
    description: 'Draft a governed report from a plain-language description, then run it yourself.',
};

export default async function ChatPage() {
    const { tenantId, userId, session } = await requireAuth();

    const allowed = isCopilotRole(session.role);
    const datasets = allowed ? listCopilotDatasets({ role: session.role, tenantId, userId }) : [];
    const providerConfigured = Boolean(process.env.CEREBRAS_API_KEY);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Report Copilot</h1>
                <p className="mt-1 text-sm text-gray-500">
                    Describe a report in plain language and the copilot drafts a configuration from the BI catalog your
                    role is entitled to. It never reads student records, never produces figures, and nothing runs until
                    you run it on the{' '}
                    <Link href="/reports" className="underline">
                        Reporting Engine
                    </Link>
                    .
                </p>
            </div>

            {!allowed ? (
                <Card>
                    <CardHeader>
                        <CardTitle>Not available for your role</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-gray-600">
                        The report copilot is limited to administrative and teaching roles. Your role (
                        <code>{session.role}</code>) is not one of them, so nothing is drafted here.
                    </CardContent>
                </Card>
            ) : datasets.length === 0 ? (
                <Card>
                    <CardHeader>
                        <CardTitle>No dataset your role can report on</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-gray-600">
                        The BI catalog grants your role no dataset that the reporting engine can execute, so there is
                        nothing for the copilot to draft against. Ask an administrator for the relevant read permission
                        (for example <code>fees:read</code> or <code>attendance:read</code>).
                    </CardContent>
                </Card>
            ) : !providerConfigured ? (
                <Card>
                    <CardHeader>
                        <CardTitle>No model provider is configured</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-gray-600">
                        <p>
                            This deployment has no <code>CEREBRAS_API_KEY</code> set, so the copilot cannot translate a
                            request into a report draft. Rather than guess at an answer, the console is switched off.
                        </p>
                        <p>
                            The {datasets.length} dataset{datasets.length === 1 ? '' : 's'} it would draft over{' '}
                            {datasets.length === 1 ? 'is' : 'are'} already available directly on the{' '}
                            <Link href="/reports" className="underline">
                                Reporting Engine
                            </Link>
                            , which needs no model provider.
                        </p>
                        <ul className="list-disc space-y-1 pl-5 text-xs text-gray-500">
                            {datasets.map((dataset) => (
                                <li key={dataset.id}>
                                    <span className="font-medium text-gray-700">{dataset.label}</span> —{' '}
                                    {dataset.description}
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            ) : (
                <CopilotConsole datasets={datasets} />
            )}
        </div>
    );
}
