'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    Database,
    Gauge,
    Loader2,
    RefreshCcw,
    ShieldCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type OperatorScope = 'PLATFORM' | 'TENANT';
type OperatorSeverity = 'HEALTHY' | 'INFO' | 'WARNING' | 'CRITICAL';

type Tile = {
    id: string;
    label: string;
    description: string;
    domain: string;
    severity: OperatorSeverity;
    signalCount: number;
    dataFreshness: string;
    drilldownRoute: string;
    sourceTables: string[];
    actionTypes: string[];
};

type Signal = {
    id: string;
    domain: string;
    severity: OperatorSeverity;
    title: string;
    summary: string;
    count: number;
    source: string;
    runbookCode?: string;
    actionTypes: string[];
};

type Snapshot = {
    scope: OperatorScope;
    tenantId?: string;
    status: OperatorSeverity;
    healthScore: number;
    generatedAt: string;
    tiles: Tile[];
    signals: Signal[];
    metrics: {
        database?: {
            status?: string;
            latencyMs?: number | null;
        };
    };
};

type Props = {
    initialScope: OperatorScope;
    role: string;
    tenantId?: string;
};

const severityStyles: Record<OperatorSeverity, string> = {
    HEALTHY: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    INFO: 'border-sky-200 bg-sky-50 text-sky-700',
    WARNING: 'border-amber-200 bg-amber-50 text-amber-800',
    CRITICAL: 'border-red-200 bg-red-50 text-red-700',
};

function statusIcon(status: OperatorSeverity) {
    if (status === 'HEALTHY') return <CheckCircle2 className="h-4 w-4" aria-hidden="true" />;
    if (status === 'INFO') return <Gauge className="h-4 w-4" aria-hidden="true" />;
    return <AlertTriangle className="h-4 w-4" aria-hidden="true" />;
}

function formatDate(value: string) {
    try {
        return new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(new Date(value));
    } catch {
        return value;
    }
}

export default function OperatorConsoleClient({ initialScope, role, tenantId }: Props) {
    const [scope, setScope] = useState<OperatorScope>(initialScope);
    const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const canUsePlatformScope = role === 'PLATFORM_ADMIN';

    const endpoint = useMemo(() => {
        const params = new URLSearchParams({ scope });
        if (scope === 'TENANT' && tenantId) params.set('tenantId', tenantId);
        return `/api/operator/console?${params.toString()}`;
    }, [scope, tenantId]);

    async function loadSnapshot() {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(endpoint, {
                cache: 'no-store',
                credentials: 'include',
            });
            if (!response.ok) {
                throw new Error(`Operator console returned ${response.status}`);
            }
            const data = await response.json();
            setSnapshot(data.snapshot);
        } catch (err) {
            setSnapshot(null);
            setError(err instanceof Error ? err.message : 'Operator console failed to load.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void loadSnapshot();
    }, [endpoint]);

    const visibleSignals = snapshot?.signals.slice(0, 8) ?? [];

    return (
        <main className="min-h-screen bg-slate-50 text-slate-950">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
                <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                            Operator Console
                        </div>
                        <h1 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950">
                            Production Operations
                        </h1>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {canUsePlatformScope && (
                            <div className="inline-flex rounded-md border border-slate-200 bg-white p-1">
                                {(['PLATFORM', 'TENANT'] as const).map((value) => (
                                    <button
                                        key={value}
                                        type="button"
                                        className={`rounded px-3 py-1.5 text-sm font-medium transition ${
                                            scope === value
                                                ? 'bg-slate-900 text-white'
                                                : 'text-slate-600 hover:bg-slate-100'
                                        }`}
                                        onClick={() => setScope(value)}
                                    >
                                        {value.toLowerCase()}
                                    </button>
                                ))}
                            </div>
                        )}
                        <Button type="button" variant="outline" onClick={loadSnapshot} disabled={loading}>
                            {loading ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                            ) : (
                                <RefreshCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                            )}
                            Refresh
                        </Button>
                    </div>
                </header>

                {error && (
                    <section className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error}
                    </section>
                )}

                <section className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-md border border-slate-200 bg-white p-4">
                        <div className="text-sm text-slate-500">Status</div>
                        <div className="mt-2 flex items-center gap-2">
                            <Badge className={snapshot ? severityStyles[snapshot.status] : 'border-slate-200 bg-slate-50 text-slate-600'}>
                                {snapshot ? statusIcon(snapshot.status) : <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                                <span className="ml-1">{snapshot?.status ?? 'LOADING'}</span>
                            </Badge>
                        </div>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-white p-4">
                        <div className="text-sm text-slate-500">Health score</div>
                        <div className="mt-2 text-3xl font-semibold">{snapshot?.healthScore ?? '--'}</div>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-white p-4">
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                            <Database className="h-4 w-4" aria-hidden="true" />
                            Database
                        </div>
                        <div className="mt-2 text-lg font-semibold">{snapshot?.metrics.database?.status ?? 'unknown'}</div>
                        <div className="text-sm text-slate-500">
                            {typeof snapshot?.metrics.database?.latencyMs === 'number'
                                ? `${snapshot.metrics.database.latencyMs} ms`
                                : 'latency unavailable'}
                        </div>
                    </div>
                </section>

                <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {(snapshot?.tiles ?? []).map((tile) => (
                        <article key={tile.id} className="rounded-md border border-slate-200 bg-white p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-base font-semibold text-slate-950">{tile.label}</h2>
                                    <p className="mt-1 text-sm leading-6 text-slate-600">{tile.description}</p>
                                </div>
                                <Badge className={severityStyles[tile.severity]}>
                                    {statusIcon(tile.severity)}
                                    <span className="ml-1">{tile.severity}</span>
                                </Badge>
                            </div>
                            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <dt className="text-slate-500">Signals</dt>
                                    <dd className="font-semibold text-slate-950">{tile.signalCount}</dd>
                                </div>
                                <div>
                                    <dt className="text-slate-500">Freshness</dt>
                                    <dd className="font-semibold text-slate-950">{tile.dataFreshness.replaceAll('_', ' ')}</dd>
                                </div>
                            </dl>
                            <div className="mt-4 flex flex-wrap gap-1">
                                {tile.actionTypes.slice(0, 3).map((action) => (
                                    <span key={action} className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600">
                                        {action.toLowerCase().replaceAll('_', ' ')}
                                    </span>
                                ))}
                            </div>
                        </article>
                    ))}
                </section>

                <section className="rounded-md border border-slate-200 bg-white">
                    <div className="flex flex-col gap-1 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <h2 className="text-base font-semibold text-slate-950">Active Signals</h2>
                        <span className="text-sm text-slate-500">
                            {snapshot ? `Generated ${formatDate(snapshot.generatedAt)}` : 'Waiting for snapshot'}
                        </span>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {loading && !snapshot ? (
                            <div className="flex items-center gap-2 px-4 py-5 text-sm text-slate-600">
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                Loading operator signals
                            </div>
                        ) : visibleSignals.length === 0 ? (
                            <div className="px-4 py-5 text-sm text-slate-600">No active operator signals.</div>
                        ) : (
                            visibleSignals.map((signal) => (
                                <div key={signal.id} className="grid gap-3 px-4 py-4 md:grid-cols-[160px_1fr_100px] md:items-center">
                                    <Badge className={severityStyles[signal.severity]}>
                                        {statusIcon(signal.severity)}
                                        <span className="ml-1">{signal.severity}</span>
                                    </Badge>
                                    <div>
                                        <div className="font-medium text-slate-950">{signal.title}</div>
                                        <div className="mt-1 text-sm text-slate-600">{signal.summary}</div>
                                    </div>
                                    <div className="text-left text-sm text-slate-500 md:text-right">
                                        {signal.count} from {signal.source}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </section>
            </div>
        </main>
    );
}
