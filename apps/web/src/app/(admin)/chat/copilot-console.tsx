'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowRight, Loader2, Sparkles, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import type { CopilotDataset, CopilotReportDraft } from '@/app/api/copilot/catalog';

type Exchange = {
    id: string;
    question: string;
} & (
    | { kind: 'draft'; summary: string; draft: CopilotReportDraft }
    | { kind: 'refusal'; message: string }
);

type CopilotApiResponse = {
    ok?: boolean;
    summary?: string;
    draft?: CopilotReportDraft;
    error?: string;
};

export default function CopilotConsole({ datasets }: { datasets: CopilotDataset[] }) {
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
            const response = await fetch('/api/copilot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: asked }),
            });

            let payload: CopilotApiResponse = {};
            try {
                payload = (await response.json()) as CopilotApiResponse;
            } catch {
                payload = {};
            }

            if (response.ok && payload.ok && payload.draft && payload.summary) {
                setExchanges((current) => [
                    ...current,
                    {
                        id: crypto.randomUUID(),
                        question: asked,
                        kind: 'draft',
                        summary: payload.summary as string,
                        draft: payload.draft as CopilotReportDraft,
                    },
                ]);
            } else {
                const message =
                    payload.error ||
                    `The copilot returned ${response.status} without an explanation. Nothing was drafted.`;
                setExchanges((current) => [
                    ...current,
                    { id: crypto.randomUUID(), question: asked, kind: 'refusal', message },
                ]);
                toast.error(message);
            }
        } catch (error) {
            const message =
                error instanceof Error
                    ? `The request never reached the copilot: ${error.message}`
                    : 'The request never reached the copilot.';
            setExchanges((current) => [
                ...current,
                { id: crypto.randomUUID(), question: asked, kind: 'refusal', message },
            ]);
            toast.error(message);
        } finally {
            setPending(false);
        }
    }

    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="space-y-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Sparkles className="h-4 w-4" />
                            Describe the report you want
                        </CardTitle>
                        <CardDescription>
                            The copilot only chooses a dataset, its metrics and a breakdown from the catalog on the
                            right. It does not read your school&apos;s records and never returns figures — you run the
                            draft yourself on the Reporting Engine.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-3">
                            <Textarea
                                value={question}
                                onChange={(event) => setQuestion(event.target.value)}
                                placeholder="e.g. Outstanding fees by grade for this term"
                                rows={3}
                                maxLength={4000}
                                disabled={pending}
                            />
                            <div className="flex items-center justify-between">
                                <p className="text-xs text-muted-foreground">
                                    Rate limited to 10 drafts per user per window.
                                </p>
                                <Button type="submit" disabled={pending || question.trim() === ''}>
                                    {pending ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Drafting
                                        </>
                                    ) : (
                                        'Draft a report'
                                    )}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>

                {exchanges.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No drafts yet. Anything the copilot proposes is checked against your role&apos;s catalog before
                        it is shown.
                    </p>
                ) : (
                    <div className="space-y-4">
                        {[...exchanges].reverse().map((exchange) => (
                            <Card key={exchange.id}>
                                <CardHeader>
                                    <CardDescription>You asked</CardDescription>
                                    <CardTitle className="text-base font-medium">{exchange.question}</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {exchange.kind === 'refusal' ? (
                                        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                                            <span>{exchange.message}</span>
                                        </div>
                                    ) : (
                                        <DraftDetail summary={exchange.summary} draft={exchange.draft} />
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            <Card className="h-fit">
                <CardHeader>
                    <CardTitle className="text-base">Datasets your role can report on</CardTitle>
                    <CardDescription>
                        {datasets.length} runnable dataset{datasets.length === 1 ? '' : 's'} from the governed BI
                        catalog. The copilot cannot reference anything outside this list.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {datasets.map((dataset) => (
                        <div key={dataset.id} className="rounded-md border border-border p-3">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium text-foreground">{dataset.label}</p>
                                <Badge variant="outline">{dataset.domain}</Badge>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{dataset.description}</p>
                            <p className="mt-2 text-xs text-muted-foreground">
                                {dataset.metrics.length} metric{dataset.metrics.length === 1 ? '' : 's'} ·{' '}
                                {dataset.dimensions.length} dimension{dataset.dimensions.length === 1 ? '' : 's'}
                            </p>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}

function DraftDetail({ summary, draft }: { summary: string; draft: CopilotReportDraft }) {
    const discarded = [
        ...draft.discardedMetricIds.map((id) => `metric "${id}"`),
        ...draft.discardedDimensionIds.map((id) => `dimension "${id}"`),
        ...draft.discardedFilterDimensionIds.map((id) => `filter on "${id}"`),
    ];

    return (
        <div className="space-y-3">
            <p className="text-sm text-foreground">{summary}</p>

            <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Dataset</dt>
                    <dd className="text-foreground">{draft.datasetLabel}</dd>
                    <dd className="text-xs text-muted-foreground">{draft.datasetDescription}</dd>
                </div>
                <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Metrics</dt>
                    <dd className="flex flex-wrap gap-1 pt-1">
                        {draft.metrics.map((metric) => (
                            <Badge key={metric.id} variant="secondary">
                                {metric.label}
                            </Badge>
                        ))}
                    </dd>
                </div>
                <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Group by</dt>
                    <dd className="flex flex-wrap gap-1 pt-1">
                        {draft.dimensions.length === 0 ? (
                            <span className="text-xs text-muted-foreground">No breakdown</span>
                        ) : (
                            draft.dimensions.map((dimension) => (
                                <Badge key={dimension.id} variant="outline">
                                    {dimension.label}
                                </Badge>
                            ))
                        )}
                    </dd>
                </div>
                <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Filters</dt>
                    <dd className="pt-1 text-xs text-foreground">
                        {draft.filters.length === 0
                            ? 'None'
                            : draft.filters
                                .map((filter) => `${filter.dimensionLabel} = ${filter.value}`)
                                .join(', ')}
                    </dd>
                </div>
            </dl>

            {draft.dateFilterLabel && (
                <p className="text-xs text-muted-foreground">
                    An optional date range on this dataset filters by {draft.dateFilterLabel}. Set it yourself when you
                    run the report.
                </p>
            )}

            {discarded.length > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                        The copilot also asked for {discarded.join(', ')}, which {discarded.length === 1 ? 'does' : 'do'}{' '}
                        not exist in this dataset. {discarded.length === 1 ? 'It was' : 'They were'} dropped.
                    </span>
                </div>
            )}

            <Button asChild variant="outline" size="sm">
                <Link href="/reports">
                    Open the Reporting Engine to run it
                    <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
            </Button>
        </div>
    );
}
