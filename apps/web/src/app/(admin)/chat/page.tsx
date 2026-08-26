import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAuth } from '@/lib/auth/middleware';
import { isCopilotRole, listCopilotDatasets } from '@/app/api/copilot/catalog';
import { aiToolRegistry, readTenantAiUsage, resolveAiProvider } from '@/lib/ai';
import type { AuthorizationRole } from '@school-sis/api';
import AssistantConsole, { type AssistantToolDescriptor } from './assistant-console';
import CopilotConsole from './copilot-console';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Assistant | School SIS',
    description:
        'Ask about your own school through a fixed set of permission-checked operations, and route any change through a human approval.',
};

async function readUsageSafely(tenantId: string, userId: string, role: string) {
    try {
        return await readTenantAiUsage({
            tenantId,
            userId,
            role: role as AuthorizationRole,
            requestId: 'chat-page',
        });
    } catch {
        return null;
    }
}

export default async function ChatPage() {
    const { tenantId, userId, session } = await requireAuth();

    const allowed = isCopilotRole(session.role);
    const datasets = allowed ? listCopilotDatasets({ role: session.role, tenantId, userId }) : [];
    const provider = resolveAiProvider();
    const providerConfigured = provider.configured;
    // The report copilot below still speaks only to Cerebras, so it keeps its own gate.
    const reportCopilotConfigured = Boolean(process.env.CEREBRAS_API_KEY);

    const assistantTools: AssistantToolDescriptor[] = aiToolRegistry.forRole(session.role).map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        kind: tool.kind,
        permission: tool.permission,
        approvalPolicyId: tool.kind === 'mutation' ? tool.approvalPolicyId : undefined,
    }));
    const usage = providerConfigured ? await readUsageSafely(tenantId, userId, session.role) : null;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Assistant</h1>
                <p className="mt-1 text-sm text-gray-500">
                    Two bounded tools, both human-in-the-loop. The school assistant answers questions using a fixed set
                    of permission-checked operations against your school only. The report copilot drafts a report
                    configuration you then run yourself on the{' '}
                    <Link href="/reports" className="underline">
                        Reporting Engine
                    </Link>
                    . Neither one changes anything on its own.
                </p>
            </div>

            {!providerConfigured ? (
                <Card>
                    <CardHeader>
                        <CardTitle>No model provider is configured</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-gray-600">{provider.reason}</CardContent>
                </Card>
            ) : assistantTools.length === 0 ? (
                <Card>
                    <CardHeader>
                        <CardTitle>No assistant operation is open to your role</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-gray-600">
                        Your role (<code>{session.role}</code>) holds none of the permissions the assistant&apos;s
                        operations require, so it has nothing it can look up for you.
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-2">
                    <AssistantConsole tools={assistantTools} />
                    {usage ? (
                        <p className="text-xs text-gray-500">
                            This school has used {usage.tokensUsedToday.toLocaleString('en-IN')} of{' '}
                            {usage.dailyTokenLimit.toLocaleString('en-IN')} model tokens and {usage.requestsToday} of{' '}
                            {usage.dailyRequestLimit} assistant requests today.
                        </p>
                    ) : null}
                </div>
            )}

            <h2 className="text-lg font-semibold text-gray-900">Report copilot</h2>

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
            ) : !reportCopilotConfigured ? (
                <Card>
                    <CardHeader>
                        <CardTitle>No model provider is configured for the report copilot</CardTitle>
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
