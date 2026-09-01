'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Bot, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency } from '@/lib/utils';
import type { AiRow, AiToolRun } from '@/lib/ai/types';

export type AssistantToolDescriptor = {
    name: string;
    title: string;
    description: string;
    kind: 'read' | 'mutation';
    permission: string;
    approvalPolicyId?: string;
};

type TurnResponse = {
    ok?: boolean;
    outcome?: string;
    message?: string;
    toolRuns?: AiToolRun[];
    error?: string;
};

type Exchange = {
    id: string;
    question: string;
    ok: boolean;
    message: string;
    toolRuns: AiToolRun[];
};

function renderCell(value: AiRow[string], format: string) {
    if (value === null || value === undefined) return '—';
    if (format === 'currency') return formatCurrency(Number(value));
    if (format === 'number') return Number(value).toLocaleString('en-IN');
    return String(value);
}

function ToolEvidence({ run }: { run: AiToolRun }) {
    if (run.status === 'read') {
        return (
            <div className="rounded-md border border-border bg-white p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                    <code>{run.toolName}</code>
                    <span className="text-muted-foreground">read this school only</span>
                </div>
                <p className="mt-2 text-sm text-foreground">{run.output.summary}</p>
                {run.output.rows.length > 0 && run.output.fields.length > 0 ? (
                    <div className="mt-2 overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="text-muted-foreground">
                                <tr>
                                    {run.output.fields.map((field) => (
                                        <th key={field.key} className="py-1 pr-4 font-medium">
                                            {field.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="text-foreground">
                                {run.output.rows.map((row, index) => (
                                    <tr key={index} className="border-t border-border">
                                        {run.output.fields.map((field) => (
                                            <td key={field.key} className="py-1 pr-4">
                                                {renderCell(row[field.key], field.format)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : null}
            </div>
        );
    }

    if (run.status === 'approval_requested') {
        return (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-amber-800">
                    <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
                    <code>{run.toolName}</code>
                    <span>nothing was changed</span>
                </div>
                <p className="mt-2 text-sm text-amber-900">{run.summary}</p>
                <Link href="/approvals" className="mt-2 inline-block text-xs font-medium text-amber-900 underline">
                    Open the approvals queue
                </Link>
            </div>
        );
    }

    return (
        <div className="rounded-md border border-border bg-muted p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <code>{run.toolName}</code>
                <span>refused</span>
            </div>
            <p className="mt-1 text-sm text-foreground">{run.reason}</p>
        </div>
    );
}

export default function AssistantConsole({ tools }: { tools: AssistantToolDescriptor[] }) {
    const [question, setQuestion] = useState('');
    const [exchanges, setExchanges] = useState<Exchange[]>([]);
    const [pending, setPending] = useState(false);

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        const asked = question.trim();
        if (!asked || pending) return;

        setPending(true);
        setQuestion('');

        try {
            const response = await fetch('/api/copilot/assist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: asked }),
            });

            let payload: TurnResponse = {};
            try {
                payload = (await response.json()) as TurnResponse;
            } catch {
                payload = {};
            }

            const message =
                payload.message ||
                payload.error ||
                `The assistant returned ${response.status} without an explanation. Nothing ran.`;

            setExchanges((current) => [
                ...current,
                {
                    id: crypto.randomUUID(),
                    question: asked,
                    ok: Boolean(payload.ok),
                    message,
                    toolRuns: payload.toolRuns ?? [],
                },
            ]);
            if (!payload.ok) toast.error(message);
        } catch (error) {
            const message =
                error instanceof Error
                    ? `The request never reached the assistant: ${error.message}`
                    : 'The request never reached the assistant.';
            setExchanges((current) => [
                ...current,
                { id: crypto.randomUUID(), question: asked, ok: false, message, toolRuns: [] },
            ]);
            toast.error(message);
        } finally {
            setPending(false);
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Bot className="h-5 w-5" aria-hidden /> School assistant
                </CardTitle>
                <CardDescription>
                    It can only run the {tools.length} operation{tools.length === 1 ? '' : 's'} listed below, only
                    against your school, and it answers only from what those operations returned. Anything that would
                    change a record becomes an approval request for a person to decide.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-1.5">
                    {tools.map((tool) => (
                        <Badge
                            key={tool.name}
                            variant={tool.kind === 'mutation' ? 'outline' : 'secondary'}
                            title={`${tool.description} Requires ${tool.permission}.`}
                        >
                            {tool.title}
                            {tool.kind === 'mutation' ? ' · needs approval' : ''}
                        </Badge>
                    ))}
                </div>

                <form onSubmit={handleSubmit} className="space-y-2">
                    <Textarea
                        value={question}
                        onChange={(event) => setQuestion(event.target.value)}
                        rows={3}
                        maxLength={2000}
                        placeholder="How many students are active in each grade? What is outstanding on invoice INV-2025-014?"
                        disabled={pending}
                    />
                    <Button type="submit" disabled={pending || question.trim().length === 0}>
                        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                        Ask
                    </Button>
                </form>

                <div className="space-y-4">
                    {exchanges.map((exchange) => (
                        <div key={exchange.id} className="space-y-2 rounded-lg border border-border p-3">
                            <p className="text-sm font-medium text-foreground">{exchange.question}</p>
                            <p className={exchange.ok ? 'text-sm text-foreground' : 'text-sm text-muted-foreground'}>
                                {exchange.message}
                            </p>
                            {exchange.toolRuns.length > 0 ? (
                                <div className="space-y-2">
                                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                        What it actually ran
                                    </p>
                                    {exchange.toolRuns.map((run, index) => (
                                        <ToolEvidence key={`${run.toolName}-${index}`} run={run} />
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
