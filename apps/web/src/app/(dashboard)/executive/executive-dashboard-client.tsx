'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, Metric, Text, Flex, Title, BadgeDelta } from '@tremor/react';
import { FeeBreakdownChart } from './fee-breakdown-chart';
import { formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { MultiCampusGroupRollup } from '@/lib/actions/executive-analytics';
import {
    Building2,
    Check,
    Database,
    ExternalLink,
    GripVertical,
    LayoutGrid,
    Plus,
    RotateCcw,
    ShieldCheck,
    TrendingUp,
    Users,
    X,
} from 'lucide-react';
import { toast } from 'sonner';

export interface CustomObjectSummary {
    id: string;
    apiName: string;
    name: string;
    isCustom: boolean;
}

export interface ExecutiveMetricsPayload {
    totalExpectedFees: number;
    totalCollectedFees: number;
    collectionDeficit: number;
    overdueBalance: number;
    defaulterCount: number;
}

const DEFAULT_WIDGET_ORDER = [
    'kpi-billed',
    'kpi-collected',
    'kpi-outstanding',
    'chart-fee-breakdown',
    'panel-past-due',
];

const WIDGET_LABELS: Record<string, string> = {
    'kpi-billed': 'KPI: Total Billed Fees',
    'kpi-collected': 'KPI: Total Collected & Rate',
    'kpi-outstanding': 'KPI: Outstanding Deficit',
    'chart-fee-breakdown': 'Chart: Fee Collection Breakdown',
    'panel-past-due': 'Panel: Past Due & Defaulters',
};

export function ExecutiveDashboardClient({
    metrics,
    groupRollup,
    customObjects = [],
}: {
    metrics: ExecutiveMetricsPayload;
    groupRollup?: MultiCampusGroupRollup;
    customObjects?: CustomObjectSummary[];
}) {
    const [isCustomizing, setIsCustomizing] = useState(false);
    const [campusFilter, setCampusFilter] = useState<'ALL' | 'INTERVENTION'>('ALL');
    const [widgetOrder, setWidgetOrder] = useState<string[]>(() => [
        ...DEFAULT_WIDGET_ORDER,
        ...customObjects.filter((o) => o.isCustom).slice(0, 3).map((o) => `obj:${o.apiName}`),
    ]);
    const [draggedWidgetId, setDraggedWidgetId] = useState<string | null>(null);
    const [dragOverWidgetId, setDragOverWidgetId] = useState<string | null>(null);

    const collectionRate =
        metrics.totalExpectedFees > 0
            ? (metrics.totalCollectedFees / metrics.totalExpectedFees) * 100
            : 0;

    const chartData = [
        { name: 'Expected', Amount: metrics.totalExpectedFees },
        { name: 'Collected', Amount: metrics.totalCollectedFees },
        { name: 'Outstanding', Amount: metrics.collectionDeficit },
    ];

    const handleWidgetDrop = (targetId: string) => {
        setDragOverWidgetId(null);
        if (!draggedWidgetId || draggedWidgetId === targetId) return;

        setWidgetOrder((prev) => {
            const next = [...prev];
            const fromIdx = next.indexOf(draggedWidgetId);
            const toIdx = next.indexOf(targetId);
            if (fromIdx === -1 && toIdx !== -1) {
                next.splice(toIdx, 0, draggedWidgetId);
                return next;
            }
            if (fromIdx === -1 || toIdx === -1) return prev;
            const [moved] = next.splice(fromIdx, 1);
            next.splice(toIdx, 0, moved);
            return next;
        });
        setDraggedWidgetId(null);
    };

    const handleAddWidget = (widgetId: string) => {
        if (widgetOrder.includes(widgetId)) return;
        setWidgetOrder((prev) => [...prev, widgetId]);
        toast.success('Added widget to dashboard canvas');
    };

    const handleRemoveWidget = (widgetId: string) => {
        if (widgetOrder.length <= 1) {
            toast.error('Keep at least one widget on the dashboard.');
            return;
        }
        setWidgetOrder((prev) => prev.filter((id) => id !== widgetId));
    };

    const handleResetLayout = () => {
        setWidgetOrder([
            ...DEFAULT_WIDGET_ORDER,
            ...customObjects.filter((o) => o.isCustom).slice(0, 3).map((o) => `obj:${o.apiName}`),
        ]);
        toast.success('Reset dashboard layout to default');
    };

    const handleSaveLayout = () => {
        try {
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(
                    'scholarmind.executive.widgetOrder',
                    JSON.stringify(widgetOrder),
                );
            }
        } catch {
            // Ignore storage errors in restricted environments
        }
        setIsCustomizing(false);
        toast.success('Saved customized Executive Dashboard layout');
    };

    const allAvailableWidgets: { id: string; label: string }[] = [
        ...Object.entries(WIDGET_LABELS).map(([id, label]) => ({ id, label })),
        ...customObjects.map((obj) => ({
            id: `obj:${obj.apiName}`,
            label: `Object Module: ${obj.name} (${obj.apiName})`,
        })),
    ];

    const hiddenWidgets = allAvailableWidgets.filter((w) => !widgetOrder.includes(w.id));

    const visibleCampuses =
        groupRollup?.campuses.filter(
            (c) => campusFilter === 'ALL' || c.healthStatus === 'INTERVENTION',
        ) ?? [];

    const renderWidgetContent = (widgetId: string) => {
        switch (widgetId) {
            case 'kpi-billed':
                return (
                    <Card decoration="top" decorationColor="slate">
                        <Text>Active Campus Billed</Text>
                        <Metric>{formatCurrency(metrics.totalExpectedFees)}</Metric>
                    </Card>
                );
            case 'kpi-collected':
                return (
                    <Card decoration="top" decorationColor="amber">
                        <Text>Active Campus Collected</Text>
                        <Metric>{formatCurrency(metrics.totalCollectedFees)}</Metric>
                        <Text className="mt-2">{collectionRate.toFixed(1)}% collection rate</Text>
                    </Card>
                );
            case 'kpi-outstanding':
                return (
                    <Card decoration="top" decorationColor="red">
                        <Flex alignItems="start">
                            <div>
                                <Text>Active Campus Outstanding</Text>
                                <Metric>{formatCurrency(metrics.collectionDeficit)}</Metric>
                            </div>
                            {metrics.collectionDeficit > 0 && (
                                <BadgeDelta deltaType="moderateDecrease">Needs Attention</BadgeDelta>
                            )}
                        </Flex>
                    </Card>
                );
            case 'chart-fee-breakdown':
                return (
                    <Card>
                        <Title>Active Campus Fee Breakdown</Title>
                        <FeeBreakdownChart data={chartData} />
                    </Card>
                );
            case 'panel-past-due':
                return (
                    <Card>
                        <Title>Past Due &amp; Defaulters</Title>
                        <div className="mt-6 space-y-4">
                            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                                <Text className="font-medium text-foreground">Overdue Balance</Text>
                                <Text className="text-xl font-bold text-destructive">
                                    {formatCurrency(metrics.overdueBalance)}
                                </Text>
                            </div>
                            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                                <Text className="font-medium text-foreground">Students With Dues</Text>
                                <Text className="text-xl font-bold text-destructive">
                                    {metrics.defaulterCount}
                                </Text>
                            </div>
                            <p className="text-sm text-muted-foreground mt-4">
                                Counts invoices whose due date has passed and which still carry a balance.
                                Cancelled, waived and draft invoices are excluded.
                            </p>
                        </div>
                    </Card>
                );
            default: {
                if (widgetId.startsWith('obj:')) {
                    const apiName = widgetId.slice(4);
                    const obj = customObjects.find((o) => o.apiName === apiName);
                    return (
                        <Card decoration="top" decorationColor="amber">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <div className="flex items-center gap-1.5 text-xs font-mono text-primary uppercase">
                                        <Database className="w-3.5 h-3.5 text-brass" />
                                        {obj?.isCustom ? 'Custom Object Widget' : 'Standard Object Widget'}
                                    </div>
                                    <Title className="mt-1">{obj?.name || apiName}</Title>
                                    <Text className="mt-1 text-xs">
                                        Quick launch into the live runtime list, Kanban board, and record studio for{' '}
                                        <code className="font-mono">{apiName}</code>.
                                    </Text>
                                </div>
                                <Link
                                    href={`/app/${apiName}`}
                                    className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-muted"
                                >
                                    Open <ExternalLink className="w-3 h-3" />
                                </Link>
                            </div>
                        </Card>
                    );
                }
                return null;
            }
        }
    };

    const isWideWidget = (widgetId: string) =>
        widgetId === 'chart-fee-breakdown' || widgetId === 'panel-past-due';

    return (
        <div className="space-y-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <Title className="text-3xl font-bold text-foreground">
                        Executive &amp; Multi-Campus Command Center
                    </Title>
                    <Text className="mt-1 text-muted-foreground">
                        Consolidated trust treasury, campus benchmarking, and customizable board KPIs.
                    </Text>
                </div>
                <div className="flex items-center gap-2">
                    {isCustomizing ? (
                        <>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleResetLayout}
                                className="gap-1.5"
                            >
                                <RotateCcw className="w-3.5 h-3.5" /> Reset
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                onClick={handleSaveLayout}
                                data-testid="save-dashboard-layout"
                                className="gap-1.5"
                            >
                                <Check className="w-3.5 h-3.5" /> Done Customizing
                            </Button>
                        </>
                    ) : (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setIsCustomizing(true)}
                            data-testid="toggle-customize-dashboard"
                            className="gap-1.5"
                        >
                            <LayoutGrid className="w-3.5 h-3.5 text-brass" /> Customize Dashboard (Drag &amp; Drop)
                        </Button>
                    )}
                </div>
            </div>

            {/* Multi-Campus Group Trust Rollup Command Center */}
            {groupRollup && groupRollup.campuses.length > 0 && (
                <section
                    data-testid="multi-campus-command-center"
                    className="rounded-2xl border border-brass/35 bg-card shadow-sm overflow-hidden"
                >
                    <div className="bg-primary text-primary-foreground px-6 py-5 flex flex-wrap items-center justify-between gap-4 border-b border-brass/40">
                        <div className="flex items-center gap-3.5">
                            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 border border-brass/40">
                                <Building2 className="h-5 w-5 text-brass" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-lg font-bold tracking-tight">
                                        {groupRollup.companyName}
                                    </h2>
                                    <Badge
                                        variant="outline"
                                        className="border-brass/50 bg-white/10 text-white text-[11px]"
                                    >
                                        {groupRollup.totalCampuses} Active{' '}
                                        {groupRollup.totalCampuses === 1 ? 'Campus' : 'Campuses'}
                                    </Badge>
                                </div>
                                <p className="text-xs text-primary-foreground/80 mt-0.5">
                                    Trust-level consolidation strictly isolated to your institutional group (`company_id`).
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setCampusFilter('ALL')}
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                                    campusFilter === 'ALL'
                                        ? 'bg-brass text-white'
                                        : 'bg-white/10 text-primary-foreground/85 hover:bg-white/20'
                                }`}
                            >
                                All Campuses ({groupRollup.campuses.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setCampusFilter('INTERVENTION')}
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                                    campusFilter === 'INTERVENTION'
                                        ? 'bg-brass text-white'
                                        : 'bg-white/10 text-primary-foreground/85 hover:bg-white/20'
                                }`}
                            >
                                Needs Intervention (
                                {groupRollup.campuses.filter((c) => c.healthStatus === 'INTERVENTION').length})
                            </button>
                        </div>
                    </div>

                    {/* Group Trust Summary Strip */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border bg-accent/35 border-b border-border">
                        <div className="p-4 sm:p-5">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                <Users className="h-3.5 w-3.5 text-brass" />
                                Consolidated Scholars
                            </p>
                            <p className="mt-1.5 text-2xl font-bold text-foreground">
                                {groupRollup.totalStudents}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {groupRollup.groupActiveLeads} active admission inquiries
                            </p>
                        </div>

                        <div className="p-4 sm:p-5">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                <TrendingUp className="h-3.5 w-3.5 text-brass" />
                                Group Fee Realization
                            </p>
                            <p className="mt-1.5 text-2xl font-bold text-foreground">
                                {formatCurrency(groupRollup.groupCollectedFees)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                of {formatCurrency(groupRollup.groupExpectedFees)} billed (
                                {groupRollup.groupCollectionRate}%)
                            </p>
                        </div>

                        <div className="p-4 sm:p-5">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Group Past-Due Arrears
                            </p>
                            <p className="mt-1.5 text-2xl font-bold text-destructive">
                                {formatCurrency(groupRollup.groupOverdueBalance)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {groupRollup.groupDefaulterCount} students carrying overdue balances
                            </p>
                        </div>

                        <div className="p-4 sm:p-5">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                <ShieldCheck className="h-3.5 w-3.5 text-brass" />
                                Governance Tier
                            </p>
                            <p className="mt-1.5 text-2xl font-bold text-foreground">
                                {groupRollup.subscriptionTier.replace(/_/g, ' ')}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Real-time ledger &amp; attendance benchmarking
                            </p>
                        </div>
                    </div>

                    {/* Per-Campus Benchmarking Table */}
                    <div className="overflow-x-auto">
                        <table
                            data-testid="multi-campus-rollup-table"
                            className="w-full text-sm text-left"
                        >
                            <thead>
                                <tr className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    <th className="px-5 py-3.5">Campus &amp; Board</th>
                                    <th className="px-4 py-3.5 text-right">Enrolled</th>
                                    <th className="px-4 py-3.5 text-right">Billed</th>
                                    <th className="px-4 py-3.5 text-right">Collected</th>
                                    <th className="px-4 py-3.5">Realization %</th>
                                    <th className="px-4 py-3.5 text-right">Overdue</th>
                                    <th className="px-4 py-3.5 text-center">Attendance</th>
                                    <th className="px-4 py-3.5 text-center">Admissions</th>
                                    <th className="px-5 py-3.5 text-right">Standing</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {visibleCampuses.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={9}
                                            className="px-5 py-8 text-center text-sm text-muted-foreground"
                                        >
                                            Zero campuses currently flagged for financial or attendance intervention.
                                        </td>
                                    </tr>
                                ) : (
                                    visibleCampuses.map((c) => {
                                        const badgeClass =
                                            c.healthStatus === 'EXEMPLARY'
                                                ? 'bg-success-subtle text-success border-success/30'
                                                : c.healthStatus === 'INTERVENTION'
                                                    ? 'bg-destructive-subtle text-destructive border-destructive/30'
                                                    : 'bg-accent text-accent-foreground border-brass/40';
                                        const barClass =
                                            c.collectionRate >= 75
                                                ? 'bg-success'
                                                : c.collectionRate >= 50
                                                    ? 'bg-brass'
                                                    : 'bg-destructive';

                                        return (
                                            <tr
                                                key={c.tenantId}
                                                data-testid={`campus-rollup-row-${c.campusCode}`}
                                                className="hover:bg-muted/40 transition-colors"
                                            >
                                                <td className="px-5 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold text-foreground">
                                                            {c.campusName}
                                                        </span>
                                                        {c.isCurrentCampus && (
                                                            <Badge
                                                                variant="outline"
                                                                className="border-brass/40 bg-accent text-accent-foreground text-[10px]"
                                                            >
                                                                Current Session
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground mt-0.5">
                                                        {c.campusCode} · {c.board}
                                                        {c.city ? ` · ${c.city}` : ''}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 text-right font-medium text-foreground">
                                                    {c.activeStudents}
                                                </td>
                                                <td className="px-4 py-4 text-right font-medium text-foreground">
                                                    {formatCurrency(c.expectedFees)}
                                                </td>
                                                <td className="px-4 py-4 text-right font-semibold text-foreground">
                                                    {formatCurrency(c.collectedFees)}
                                                </td>
                                                <td className="px-4 py-4 min-w-[140px]">
                                                    <div className="flex items-center justify-between text-xs mb-1">
                                                        <span className="font-semibold text-foreground">
                                                            {c.collectionRate.toFixed(1)}%
                                                        </span>
                                                    </div>
                                                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full ${barClass}`}
                                                            style={{
                                                                width: `${Math.min(100, Math.max(c.collectionRate, 3))}%`,
                                                            }}
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 text-right">
                                                    <div className="font-semibold text-destructive">
                                                        {formatCurrency(c.overdueBalance)}
                                                    </div>
                                                    <div className="text-[11px] text-muted-foreground">
                                                        {c.defaulterCount} student{c.defaulterCount !== 1 ? 's' : ''}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 text-center font-medium text-foreground">
                                                    {c.attendanceRate !== null ? `${c.attendanceRate}%` : '—'}
                                                </td>
                                                <td className="px-4 py-4 text-center">
                                                    <span className="font-semibold text-foreground">
                                                        {c.activeLeads}
                                                    </span>{' '}
                                                    <span className="text-xs text-muted-foreground">open</span>
                                                </td>
                                                <td className="px-5 py-4 text-right">
                                                    <Badge variant="outline" className={badgeClass}>
                                                        {c.healthStatus === 'EXEMPLARY'
                                                            ? 'Exemplary'
                                                            : c.healthStatus === 'INTERVENTION'
                                                                ? 'Intervention'
                                                                : 'Healthy'}
                                                    </Badge>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {isCustomizing && (
                <div className="rounded-xl border-2 border-dashed border-primary/40 bg-accent/30 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                            Drag-and-Drop Dashboard Builder Active · Drag any card below to reorder
                        </span>
                        <span className="text-xs text-muted-foreground">
                            {widgetOrder.length} active widget(s)
                        </span>
                    </div>
                    {hiddenWidgets.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                            <span className="text-xs text-muted-foreground">Available to pin:</span>
                            {hiddenWidgets.map((w) => (
                                <button
                                    key={w.id}
                                    type="button"
                                    draggable
                                    onDragStart={() => setDraggedWidgetId(w.id)}
                                    onClick={() => handleAddWidget(w.id)}
                                    className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:border-primary"
                                >
                                    <Plus className="w-3 h-3 text-primary" /> {w.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div
                data-testid="executive-dashboard-grid"
                className="grid grid-cols-1 lg:grid-cols-6 gap-6"
            >
                {widgetOrder.map((widgetId) => {
                    const colSpan = isWideWidget(widgetId) ? 'lg:col-span-3' : 'lg:col-span-2';
                    const isOver = dragOverWidgetId === widgetId;
                    return (
                        <div
                            key={widgetId}
                            draggable={isCustomizing}
                            onDragStart={() => setDraggedWidgetId(widgetId)}
                            onDragOver={(e) => {
                                if (!isCustomizing) return;
                                e.preventDefault();
                                setDragOverWidgetId(widgetId);
                            }}
                            onDragLeave={() => setDragOverWidgetId(null)}
                            onDrop={(e) => {
                                if (!isCustomizing) return;
                                e.preventDefault();
                                handleWidgetDrop(widgetId);
                            }}
                            onDragEnd={() => {
                                setDraggedWidgetId(null);
                                setDragOverWidgetId(null);
                            }}
                            data-testid={`dashboard-widget-${widgetId}`}
                            className={`${colSpan} relative transition-all ${
                                isCustomizing
                                    ? 'cursor-grab active:cursor-grabbing rounded-xl ring-2 ring-primary/30 p-1'
                                    : ''
                            } ${isOver ? 'ring-primary bg-accent/20' : ''}`}
                        >
                            {isCustomizing && (
                                <div className="flex items-center justify-between rounded-t-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground border-b border-border">
                                    <span className="inline-flex items-center gap-1.5">
                                        <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                                        {WIDGET_LABELS[widgetId] || widgetId}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveWidget(widgetId)}
                                        className="text-muted-foreground hover:text-destructive"
                                        title="Hide widget"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            )}
                            {renderWidgetContent(widgetId)}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
