'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
    LayoutDashboard,
    Loader2,
    Play,
    Plus,
    Save,
    Trash2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type {
    DashboardWidgetConfig,
    MetadataDashboardItem,
    SavedLcncReportItem,
} from '@/lib/metadata/lcnc-helpers';
import {
    deleteMetadataDashboardAction,
    saveMetadataDashboardAction,
} from '@/lib/actions/lcnc-tier2';
import { runCustomObjectBiReport } from './bi-actions';
import type { BiReportColumn, BiReportRow } from './bi-types';

const SYSTEM_ROLES = [
    'SCHOOL_ADMIN',
    'PRINCIPAL',
    'VICE_PRINCIPAL',
    'HOD',
    'TEACHER',
    'FINANCE_LEAD',
    'ACCOUNTANT',
    'ADMISSIONS_COUNSELOR',
    'HOSTEL_WARDEN',
    'TRANSPORT_MANAGER',
];

interface LoadedWidgetResult {
    columns: BiReportColumn[];
    rows: BiReportRow[];
    scannedCount: number;
}

export function CustomDashboardStudio({
    initialDashboards = [],
    savedObjectReports = [],
    customRoles = [],
    canManageDashboards = false,
}: {
    initialDashboards?: MetadataDashboardItem[];
    savedObjectReports?: SavedLcncReportItem[];
    customRoles?: { code: string; name: string }[];
    canManageDashboards?: boolean;
}) {
    const router = useRouter();
    const [dashboards, setDashboards] = useState<MetadataDashboardItem[]>(initialDashboards);
    const [activeDashboardId, setActiveDashboardId] = useState<string>(
        initialDashboards[0]?.id || '',
    );
    const [showBuilder, setShowBuilder] = useState(false);

    // Builder state
    const [editingId, setEditingId] = useState<string | undefined>(undefined);
    const [dashName, setDashName] = useState('');
    const [dashDesc, setDashDesc] = useState('');
    const [isDefault, setIsDefault] = useState(false);
    const [allowedRoles, setAllowedRoles] = useState<string[]>([]);
    const [widgets, setWidgets] = useState<DashboardWidgetConfig[]>([]);
    const [selectedReportToPin, setSelectedReportToPin] = useState<string>(
        savedObjectReports[0]?.id || '',
    );
    const [pinChartMode, setPinChartMode] = useState<'KPI' | 'BAR' | 'TABLE'>('BAR');
    const [pinWidth, setPinWidth] = useState<'HALF' | 'FULL'>('HALF');
    const [saving, setSaving] = useState(false);

    // Runtime execution state
    const [loadingWidgets, setLoadingWidgets] = useState(false);
    const [widgetResults, setWidgetResults] = useState<Record<string, LoadedWidgetResult>>({});

    const activeDashboard = dashboards.find(d => d.id === activeDashboardId) || null;
    const pinnableReports = savedObjectReports.filter(
        r =>
            (r.reportKind === 'OBJECT_REPORT' || r.reportKind === 'JOINED_OBJECT_REPORT') &&
            Boolean(r.objectApiName),
    );

    const roleOptions = [
        ...SYSTEM_ROLES.map(code => ({ code, label: code })),
        ...customRoles.map(r => ({ code: r.code, label: `${r.name} (${r.code})` })),
    ];

    const runDashboardWidgets = useCallback(
        async (dash: MetadataDashboardItem) => {
            if (dash.widgets.length === 0) {
                setWidgetResults({});
                return;
            }
            setLoadingWidgets(true);
            try {
                const nextResults: Record<string, LoadedWidgetResult> = {};
                await Promise.all(
                    dash.widgets.map(async w => {
                        const rep = savedObjectReports.find(r => r.id === w.reportId);
                        if (!rep || !rep.objectApiName) return;
                        const res = await runCustomObjectBiReport({
                            objectApiName: rep.objectApiName,
                            groupByField: rep.groupByField,
                            aggregateFunction: rep.aggregateFunction,
                            metricField:
                                rep.aggregateFunction === 'COUNT'
                                    ? undefined
                                    : rep.metricField || undefined,
                            filterRules: rep.filterRules || [],
                            joinConfig: rep.joinConfig || null,
                        });
                        if (res.success && res.columns && res.rows) {
                            nextResults[w.id] = {
                                columns: res.columns,
                                rows: res.rows,
                                scannedCount: res.totalRecordsScanned ?? 0,
                            };
                        }
                    }),
                );
                setWidgetResults(nextResults);
            } finally {
                setLoadingWidgets(false);
            }
        },
        [savedObjectReports],
    );

    useEffect(() => {
        if (activeDashboard) {
            void runDashboardWidgets(activeDashboard);
        }
    }, [activeDashboard, runDashboardWidgets]);

    const handleAddWidget = () => {
        const rep = pinnableReports.find(r => r.id === selectedReportToPin);
        if (!rep) {
            toast.error('Save at least one Object or Joined Report first to pin to a dashboard.');
            return;
        }
        const nextWidget: DashboardWidgetConfig = {
            id: `w-${Date.now()}-${widgets.length}`,
            reportId: rep.id,
            title: rep.name,
            chartOverride: pinChartMode,
            width: pinWidth,
        };
        setWidgets(prev => [...prev, nextWidget]);
    };

    const handleSaveDashboard = async () => {
        if (!dashName.trim()) {
            toast.error('Enter a dashboard name.');
            return;
        }
        if (widgets.length === 0) {
            toast.error('Pin at least one saved report widget to the dashboard.');
            return;
        }
        setSaving(true);
        try {
            const res = await saveMetadataDashboardAction({
                id: editingId,
                name: dashName.trim(),
                description: dashDesc.trim() || null,
                allowedRoles,
                isDefault,
                widgets,
            });
            if (!res.success) {
                toast.error(res.error || 'Failed to save dashboard');
                return;
            }
            const nextDash: MetadataDashboardItem = {
                id: res.id || editingId || `dash-${Date.now()}`,
                name: dashName.trim(),
                description: dashDesc.trim() || null,
                allowedRoles,
                isDefault,
                widgets,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            setDashboards(prev => {
                const rest = prev.filter(d => d.id !== nextDash.id);
                return [nextDash, ...rest];
            });
            setActiveDashboardId(nextDash.id);
            setShowBuilder(false);
            setEditingId(undefined);
            setDashName('');
            setDashDesc('');
            setWidgets([]);
            toast.success(`Saved role-scoped dashboard "${nextDash.name}"`);
            router.refresh();
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteDashboard = async (id: string) => {
        const res = await deleteMetadataDashboardAction(id);
        if (!res.success) {
            toast.error(res.error || 'Failed to delete dashboard');
            return;
        }
        const remaining = dashboards.filter(d => d.id !== id);
        setDashboards(remaining);
        setActiveDashboardId(remaining[0]?.id || '');
        toast.success('Dashboard deleted');
        router.refresh();
    };

    if (dashboards.length === 0 && !canManageDashboards) {
        return null;
    }

    return (
        <Card className="border-border shadow-sm" data-testid="custom-dashboard-studio">
            <CardHeader className="border-b border-border pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <LayoutDashboard className="w-5 h-5 text-primary" />
                            Role-Scoped Custom Dashboards Studio
                        </CardTitle>
                        <CardDescription>
                            Compose multi-widget executive &amp; operational cockpits from saved
                            Object and Cross-Object Joined Reports, scoped to System or Custom
                            Roles.
                        </CardDescription>
                    </div>
                    {canManageDashboards && (
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setShowBuilder(prev => !prev)}
                        >
                            <Plus className="w-3.5 h-3.5 mr-1.5" />
                            {showBuilder ? 'Close Dashboard Builder' : 'New Custom Dashboard'}
                        </Button>
                    )}
                </div>
            </CardHeader>

            <CardContent className="pt-5 space-y-5">
                {showBuilder && canManageDashboards && (
                    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="space-y-1">
                                <Label className="text-xs">Dashboard Name</Label>
                                <Input
                                    value={dashName}
                                    onChange={e => setDashName(e.target.value)}
                                    placeholder="e.g., Principal Morning Cockpit"
                                    className="h-8 text-xs"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Description (Optional)</Label>
                                <Input
                                    value={dashDesc}
                                    onChange={e => setDashDesc(e.target.value)}
                                    placeholder="Daily KPIs across admissions, fees & hostel"
                                    className="h-8 text-xs"
                                />
                            </div>
                            <div className="flex items-end pb-1">
                                <label className="inline-flex items-center gap-2 text-xs text-foreground cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isDefault}
                                        onChange={e => setIsDefault(e.target.checked)}
                                        className="rounded border-border"
                                    />
                                    Set as default tenant dashboard
                                </label>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs">
                                Role Visibility (Leave empty for All Staff, or restrict to roles)
                            </Label>
                            <div className="flex flex-wrap gap-1.5">
                                {roleOptions.map(role => {
                                    const selected = allowedRoles.includes(role.code);
                                    return (
                                        <button
                                            key={role.code}
                                            type="button"
                                            onClick={() =>
                                                setAllowedRoles(prev =>
                                                    prev.includes(role.code)
                                                        ? prev.filter(r => r !== role.code)
                                                        : [...prev, role.code],
                                                )
                                            }
                                            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                                                selected
                                                    ? 'border-primary bg-primary text-primary-foreground'
                                                    : 'border-border bg-card text-muted-foreground hover:text-foreground'
                                            }`}
                                        >
                                            {role.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="rounded-lg border border-border bg-card p-3 space-y-2.5">
                            <Label className="text-xs">Pin Saved Report Widget</Label>
                            <div className="flex flex-wrap items-center gap-2">
                                <select
                                    value={selectedReportToPin}
                                    onChange={e => setSelectedReportToPin(e.target.value)}
                                    className="h-8 flex-1 min-w-[200px] rounded border border-border bg-card px-2.5 text-xs text-foreground"
                                >
                                    {pinnableReports.length === 0 ? (
                                        <option value="">
                                            Save an Object Report below first…
                                        </option>
                                    ) : (
                                        pinnableReports.map(rep => (
                                            <option key={rep.id} value={rep.id}>
                                                {rep.name} ({rep.objectApiName})
                                            </option>
                                        ))
                                    )}
                                </select>
                                <select
                                    value={pinChartMode}
                                    onChange={e =>
                                        setPinChartMode(
                                            e.target.value as 'KPI' | 'BAR' | 'TABLE',
                                        )
                                    }
                                    className="h-8 rounded border border-border bg-card px-2 text-xs text-foreground"
                                >
                                    <option value="KPI">KPI Cards</option>
                                    <option value="BAR">Bar Chart</option>
                                    <option value="TABLE">Summary Table</option>
                                </select>
                                <select
                                    value={pinWidth}
                                    onChange={e =>
                                        setPinWidth(e.target.value as 'HALF' | 'FULL')
                                    }
                                    className="h-8 rounded border border-border bg-card px-2 text-xs text-foreground"
                                >
                                    <option value="HALF">Half Width (1 Col)</option>
                                    <option value="FULL">Full Width (2 Cols)</option>
                                </select>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={pinnableReports.length === 0}
                                    onClick={handleAddWidget}
                                    className="h-8 text-xs"
                                >
                                    <Plus className="w-3.5 h-3.5 mr-1" /> Pin Widget
                                </Button>
                            </div>

                            {widgets.length > 0 && (
                                <div className="divide-y divide-border pt-2">
                                    {widgets.map(w => (
                                        <div
                                            key={w.id}
                                            className="flex items-center justify-between py-1.5 text-xs"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-foreground">
                                                    {w.title}
                                                </span>
                                                <Badge variant="outline" className="font-mono">
                                                    {w.chartOverride || 'BAR'} · {w.width}
                                                </Badge>
                                            </div>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                onClick={() =>
                                                    setWidgets(prev =>
                                                        prev.filter(item => item.id !== w.id),
                                                    )
                                                }
                                                className="h-7 px-2 text-muted-foreground hover:text-destructive"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end">
                            <Button
                                type="button"
                                size="sm"
                                disabled={saving}
                                onClick={handleSaveDashboard}
                            >
                                <Save className="w-3.5 h-3.5 mr-1.5" />
                                {saving ? 'Saving…' : 'Save Dashboard'}
                            </Button>
                        </div>
                    </div>
                )}

                {dashboards.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                        No custom dashboards published yet. Click &ldquo;New Custom
                        Dashboard&rdquo; above to pin saved Object or Cross-Object Joined Reports
                        into a role-scoped cockpit.
                    </p>
                ) : (
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                                {dashboards.map(d => (
                                    <button
                                        key={d.id}
                                        type="button"
                                        onClick={() => setActiveDashboardId(d.id)}
                                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                            activeDashboardId === d.id
                                                ? 'bg-primary text-primary-foreground'
                                                : 'border border-border bg-card text-muted-foreground hover:text-foreground'
                                        }`}
                                    >
                                        {d.name}
                                        {d.allowedRoles.length > 0
                                            ? ` (${d.allowedRoles.length} Roles)`
                                            : ''}
                                    </button>
                                ))}
                            </div>
                            {activeDashboard && (
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={loadingWidgets}
                                        onClick={() => void runDashboardWidgets(activeDashboard)}
                                        className="h-7 text-xs"
                                    >
                                        {loadingWidgets ? (
                                            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                                        ) : (
                                            <Play className="w-3.5 h-3.5 mr-1" />
                                        )}
                                        Refresh Widgets
                                    </Button>
                                    {canManageDashboards && (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            onClick={() =>
                                                void handleDeleteDashboard(activeDashboard.id)
                                            }
                                            className="h-7 px-2 text-muted-foreground hover:text-destructive"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    )}
                                </div>
                            )}
                        </div>

                        {activeDashboard && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {activeDashboard.widgets.map(w => {
                                    const data = widgetResults[w.id];
                                    const dimLabel = data?.columns[0]?.label || '';
                                    const metricLabel =
                                        data?.columns[1]?.label || data?.columns[0]?.label || '';
                                    const maxVal = Math.max(
                                        1,
                                        ...(data?.rows || []).map(r => {
                                            const n = Number(r[metricLabel]);
                                            return Number.isFinite(n) ? n : 0;
                                        }),
                                    );
                                    const mode = w.chartOverride || 'BAR';

                                    return (
                                        <div
                                            key={w.id}
                                            className={`rounded-xl border border-border bg-card p-4 space-y-3 ${
                                                w.width === 'FULL' ? 'lg:col-span-2' : ''
                                            }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-sm font-semibold text-foreground">
                                                    {w.title}
                                                </h4>
                                                {data && (
                                                    <Badge
                                                        variant="outline"
                                                        className="font-mono text-[10px]"
                                                    >
                                                        {data.scannedCount} records
                                                    </Badge>
                                                )}
                                            </div>

                                            {!data ? (
                                                <p className="text-xs text-muted-foreground">
                                                    {loadingWidgets
                                                        ? 'Running report widget…'
                                                        : 'Report widget ready.'}
                                                </p>
                                            ) : mode === 'KPI' ? (
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                                                    {data.rows.slice(0, 6).map((r, i) => (
                                                        <div
                                                            key={i}
                                                            className="rounded-lg border border-border bg-muted/20 p-2.5"
                                                        >
                                                            <div className="text-[11px] text-muted-foreground truncate">
                                                                {String(r[dimLabel] ?? '—')}
                                                            </div>
                                                            <div className="text-lg font-bold text-foreground">
                                                                {String(r[metricLabel] ?? 0)}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : mode === 'BAR' ? (
                                                <div className="space-y-2">
                                                    {data.rows.slice(0, 6).map((r, i) => {
                                                        const v = Number(r[metricLabel] ?? 0);
                                                        const pct = Math.max(
                                                            2,
                                                            Math.min(
                                                                100,
                                                                Math.round(
                                                                    ((Number.isFinite(v) ? v : 0) /
                                                                        maxVal) *
                                                                        100,
                                                                ),
                                                            ),
                                                        );
                                                        return (
                                                            <div key={i} className="space-y-1">
                                                                <div className="flex justify-between text-xs">
                                                                    <span className="truncate text-foreground">
                                                                        {String(
                                                                            r[dimLabel] ?? '—',
                                                                        )}
                                                                    </span>
                                                                    <span className="font-mono text-muted-foreground">
                                                                        {String(
                                                                            r[metricLabel] ?? 0,
                                                                        )}
                                                                    </span>
                                                                </div>
                                                                <progress
                                                                    value={pct}
                                                                    max={100}
                                                                    className="h-2 w-full overflow-hidden rounded-full accent-primary"
                                                                />
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="divide-y divide-border text-xs">
                                                    {data.rows.slice(0, 6).map((r, i) => (
                                                        <div
                                                            key={i}
                                                            className="flex justify-between py-1.5"
                                                        >
                                                            <span className="text-foreground">
                                                                {String(r[dimLabel] ?? '—')}
                                                            </span>
                                                            <span className="font-mono font-semibold text-primary">
                                                                {String(r[metricLabel] ?? 0)}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
