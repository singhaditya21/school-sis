'use client';

/**
 * @module app/(admin)/reports/custom-object-report-builder
 *
 * Metadata-Driven Custom & System Object Report Builder with Report Categories,
 * Persistent `bi_report_definitions` Storage, Multi-Filter Rules, Table/Bar/KPI
 * Visualization, and Sanitized CSV Export.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
    BarChart3,
    Download,
    FolderPlus,
    Layers,
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import type { RollupAggregateFunction } from '@/lib/metadata/platform';
import type {
    ReportCategoryItem,
    SavedLcncReportItem,
    SavedViewFilterRule,
    ViewFilterOperator,
} from '@/lib/metadata/lcnc-helpers';
import {
    deleteLcncReportAction,
    saveLcncObjectReportAction,
    upsertReportCategoryAction,
} from '@/lib/actions/lcnc-platform';
import { sanitizeCsvValue } from '@/lib/utils/csv-sanitize';
import {
    runCustomObjectBiReport,
    type CustomObjectReportCatalogEntry,
} from './bi-actions';
import type { BiReportColumn, BiReportRow } from './bi-types';

export function CustomObjectReportBuilder({
    catalog,
    initialCategories = [],
    initialSavedReports = [],
    canManageCategories = false,
}: {
    catalog: CustomObjectReportCatalogEntry[];
    initialCategories?: ReportCategoryItem[];
    initialSavedReports?: SavedLcncReportItem[];
    canManageCategories?: boolean;
}) {
    const router = useRouter();
    const [categories, setCategories] = useState<ReportCategoryItem[]>(initialCategories);
    const [savedReports, setSavedReports] = useState<SavedLcncReportItem[]>(
        initialSavedReports.filter(r => r.reportKind === 'OBJECT_REPORT'),
    );
    const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('ALL');

    const [selectedObjectApi, setSelectedObjectApi] = useState<string>(
        catalog.find(c => c.isCustom)?.apiName || catalog[0]?.apiName || '',
    );
    const activeObject = catalog.find(c => c.apiName === selectedObjectApi) || null;

    const [groupByField, setGroupByField] = useState<string>(
        activeObject?.dimensionFields[0]?.apiName || '',
    );
    const [aggregateFn, setAggregateFn] = useState<RollupAggregateFunction>('COUNT');
    const [metricField, setMetricField] = useState<string>(
        activeObject?.numericFields[0]?.apiName || '',
    );
    const [chartType, setChartType] = useState<'TABLE' | 'BAR' | 'KPI'>('TABLE');
    const [filterRules, setFilterRules] = useState<SavedViewFilterRule[]>([]);

    // Save report state
    const [editingReportId, setEditingReportId] = useState<string | undefined>(undefined);
    const [reportName, setReportName] = useState('');
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('__none__');
    const [savingReport, setSavingReport] = useState(false);

    // New category inline state
    const [showNewCategory, setShowNewCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [creatingCategory, setCreatingCategory] = useState(false);

    const [running, setRunning] = useState(false);
    const [columns, setColumns] = useState<BiReportColumn[]>([]);
    const [rows, setRows] = useState<BiReportRow[]>([]);
    const [scannedCount, setScannedCount] = useState<number | null>(null);

    const handleObjectChange = (nextApi: string) => {
        setSelectedObjectApi(nextApi);
        const entry = catalog.find(c => c.apiName === nextApi);
        setGroupByField(entry?.dimensionFields[0]?.apiName || '');
        setMetricField(entry?.numericFields[0]?.apiName || '');
        setFilterRules([]);
        setColumns([]);
        setRows([]);
        setScannedCount(null);
    };

    const executeReportWithParams = async (params: {
        objectApiName: string;
        groupByField: string;
        aggregateFunction: RollupAggregateFunction;
        metricField?: string;
        filterRules?: SavedViewFilterRule[];
    }) => {
        setRunning(true);
        try {
            const res = await runCustomObjectBiReport(params);
            if (!res.success || !res.columns || !res.rows) {
                toast.error(res.error || 'Report execution failed.');
                return;
            }
            setColumns(res.columns);
            setRows(res.rows);
            setScannedCount(res.totalRecordsScanned ?? 0);
            toast.success(
                `Aggregated ${res.totalRecordsScanned ?? 0} record(s) into ${res.rows.length} group(s).`,
            );
        } finally {
            setRunning(false);
        }
    };

    const handleRunReport = async () => {
        if (!selectedObjectApi || !groupByField) {
            toast.error('Select a metadata object and a Group-By dimension field.');
            return;
        }
        await executeReportWithParams({
            objectApiName: selectedObjectApi,
            groupByField,
            aggregateFunction: aggregateFn,
            metricField: aggregateFn === 'COUNT' ? undefined : metricField,
            filterRules,
        });
    };

    const handleLoadSavedReport = async (rep: SavedLcncReportItem) => {
        if (!rep.objectApiName) return;
        setEditingReportId(rep.id);
        setReportName(rep.name);
        setSelectedCategoryId(rep.categoryId || '__none__');
        setSelectedObjectApi(rep.objectApiName);
        setGroupByField(rep.groupByField);
        setAggregateFn(rep.aggregateFunction);
        setMetricField(rep.metricField || '');
        setChartType(rep.chartType || 'TABLE');
        setFilterRules(rep.filterRules || []);

        await executeReportWithParams({
            objectApiName: rep.objectApiName,
            groupByField: rep.groupByField,
            aggregateFunction: rep.aggregateFunction,
            metricField:
                rep.aggregateFunction === 'COUNT' ? undefined : rep.metricField || undefined,
            filterRules: rep.filterRules || [],
        });
    };

    const handleSaveReport = async () => {
        if (!reportName.trim()) {
            toast.error('Enter a name to save this custom report.');
            return;
        }
        if (!selectedObjectApi || !groupByField) {
            toast.error('Select an object and group-by dimension before saving.');
            return;
        }
        setSavingReport(true);
        try {
            const catId = selectedCategoryId !== '__none__' ? selectedCategoryId : null;
            const res = await saveLcncObjectReportAction({
                id: editingReportId,
                name: reportName.trim(),
                categoryId: catId,
                objectApiName: selectedObjectApi,
                groupByField,
                aggregateFunction: aggregateFn,
                metricField: aggregateFn === 'COUNT' ? null : metricField || null,
                filterRules,
                chartType,
            });
            if (!res.success) {
                toast.error(res.error || 'Failed to save custom report.');
                return;
            }
            const catName = catId ? categories.find(c => c.id === catId)?.name ?? null : null;
            const nextItem: SavedLcncReportItem = {
                id: res.reportId || editingReportId || `rep-${Date.now()}`,
                name: reportName.trim(),
                categoryId: catId,
                categoryName: catName,
                objectApiName: selectedObjectApi,
                reportKind: 'OBJECT_REPORT',
                datasetKey: `object:${selectedObjectApi}`,
                groupByField,
                aggregateFunction: aggregateFn,
                metricField: aggregateFn === 'COUNT' ? null : metricField || null,
                selectedColumns: [],
                filterRules: [...filterRules],
                chartType,
                allowedRoles: [],
                createdAt: new Date().toISOString(),
            };
            setSavedReports(prev => {
                const rest = prev.filter(p => p.id !== nextItem.id);
                return [nextItem, ...rest];
            });
            setEditingReportId(res.reportId);
            toast.success(`Saved report "${reportName.trim()}" to catalog.`);
            router.refresh();
        } finally {
            setSavingReport(false);
        }
    };

    const handleDeleteReport = async (repId: string) => {
        const res = await deleteLcncReportAction(repId);
        if (!res.success) {
            toast.error(res.error || 'Failed to archive report.');
            return;
        }
        setSavedReports(prev => prev.filter(r => r.id !== repId));
        if (editingReportId === repId) {
            setEditingReportId(undefined);
            setReportName('');
        }
        toast.success('Report archived.');
        router.refresh();
    };

    const handleCreateCategory = async () => {
        if (!newCategoryName.trim()) {
            toast.error('Enter a category name.');
            return;
        }
        setCreatingCategory(true);
        try {
            const res = await upsertReportCategoryAction({ name: newCategoryName.trim() });
            if (!res.success || !res.categoryId) {
                toast.error(res.error || 'Failed to create report category.');
                return;
            }
            const added: ReportCategoryItem = {
                id: res.categoryId,
                name: newCategoryName.trim(),
                description: null,
                sortOrder: categories.length,
            };
            setCategories(prev => [...prev, added]);
            setSelectedCategoryId(added.id);
            setNewCategoryName('');
            setShowNewCategory(false);
            toast.success(`Report category "${added.name}" created.`);
            router.refresh();
        } finally {
            setCreatingCategory(false);
        }
    };

    const handleAddFilterRule = () => {
        const firstField = activeObject?.dimensionFields[0]?.apiName || '';
        setFilterRules(prev => [
            ...prev,
            { field: firstField, operator: 'equals', value: '' },
        ]);
    };

    const handleExportCsv = () => {
        if (columns.length === 0) return;
        const headers = columns.map(c => sanitizeCsvValue(c.label)).join(',');
        const body = rows
            .map(r => columns.map(c => sanitizeCsvValue(r[c.label] ?? '')).join(','))
            .join('\n');
        const csv = `${headers}\n${body}`;
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${selectedObjectApi}_custom_report.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    if (catalog.length === 0) return null;

    const visibleSavedReports = savedReports.filter(r =>
        activeCategoryFilter === 'ALL'
            ? true
            : activeCategoryFilter === 'UNCATEGORIZED'
              ? !r.categoryId
              : r.categoryId === activeCategoryFilter,
    );

    const metricColLabel = columns[1]?.label || columns[0]?.label || '';
    const dimColLabel = columns[0]?.label || '';
    const maxMetricVal = Math.max(
        1,
        ...rows.map(r => {
            const v = Number(r[metricColLabel]);
            return Number.isFinite(v) ? v : 0;
        }),
    );

    return (
        <Card className="border-primary/20 shadow-sm" data-testid="custom-object-report-builder">
            <CardHeader className="border-b border-border pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Layers className="w-5 h-5 text-primary" />
                            Low-Code Object Report Studio &amp; Report Categories
                        </CardTitle>
                        <CardDescription>
                            Build, categorize, save, and export multi-filter reports across any System Object (19 core tables) or Custom Object (EAV, Formulas `f(x)`, Roll-Ups `Σ`).
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="w-fit font-mono text-xs">
                            {catalog.length} Objects Queryable
                        </Badge>
                        {canManageCategories && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setShowNewCategory(prev => !prev)}
                            >
                                <FolderPlus className="w-3.5 h-3.5 mr-1.5" /> New Report Category
                            </Button>
                        )}
                    </div>
                </div>

                {showNewCategory && canManageCategories && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 p-3">
                        <Input
                            value={newCategoryName}
                            onChange={e => setNewCategoryName(e.target.value)}
                            placeholder="Category name (e.g., Statutory & CBSE, Fee Aging, Hostel Ops)"
                            className="h-8 max-w-sm text-xs"
                        />
                        <Button
                            type="button"
                            size="sm"
                            onClick={handleCreateCategory}
                            disabled={creatingCategory}
                            className="h-8 text-xs"
                        >
                            {creatingCategory ? 'Creating…' : 'Create Category'}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowNewCategory(false)}
                            className="h-8 text-xs"
                        >
                            Cancel
                        </Button>
                    </div>
                )}
            </CardHeader>

            <CardContent className="pt-5 space-y-5">
                {/* Categorized Saved Object Reports Library */}
                {(categories.length > 0 || savedReports.length > 0) && (
                    <div className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setActiveCategoryFilter('ALL')}
                                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                                        activeCategoryFilter === 'ALL'
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-card text-muted-foreground border border-border hover:text-foreground'
                                    }`}
                                >
                                    All Saved Object Reports ({savedReports.length})
                                </button>
                                {categories.map(cat => (
                                    <button
                                        key={cat.id}
                                        type="button"
                                        onClick={() => setActiveCategoryFilter(cat.id)}
                                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                                            activeCategoryFilter === cat.id
                                                ? 'bg-primary text-primary-foreground'
                                                : 'bg-card text-muted-foreground border border-border hover:text-foreground'
                                        }`}
                                    >
                                        {cat.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {visibleSavedReports.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                {visibleSavedReports.map(rep => (
                                    <div
                                        key={rep.id}
                                        className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs"
                                    >
                                        <div className="min-w-0">
                                            <div className="font-semibold text-foreground truncate">
                                                {rep.name}
                                            </div>
                                            <div className="text-[11px] text-muted-foreground truncate">
                                                {rep.objectApiName} · {rep.aggregateFunction} by{' '}
                                                {rep.groupByField}
                                                {rep.categoryName ? ` · ${rep.categoryName}` : ''}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleLoadSavedReport(rep)}
                                                className="h-7 px-2 text-xs"
                                            >
                                                <Play className="w-3 h-3 mr-1" /> Run
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleDeleteReport(rep.id)}
                                                className="h-7 px-1.5 text-muted-foreground hover:text-destructive"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Report Query Designer */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                    <div className="space-y-1.5">
                        <Label className="text-xs">1. Metadata Object (System or Custom)</Label>
                        <Select value={selectedObjectApi} onValueChange={handleObjectChange}>
                            <SelectTrigger data-testid="custom-report-object-select">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {catalog.map(entry => (
                                    <SelectItem key={entry.apiName} value={entry.apiName}>
                                        {entry.label} ({entry.apiName})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs">2. Group By Dimension</Label>
                        <Select value={groupByField} onValueChange={setGroupByField}>
                            <SelectTrigger data-testid="custom-report-dimension-select">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(activeObject?.dimensionFields || []).map(dim => (
                                    <SelectItem key={dim.apiName} value={dim.apiName}>
                                        {dim.label} ({dim.dataType})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs">3. Aggregate Function</Label>
                        <Select
                            value={aggregateFn}
                            onValueChange={v => setAggregateFn(v as RollupAggregateFunction)}
                        >
                            <SelectTrigger data-testid="custom-report-agg-select">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="COUNT">COUNT (Record Count)</SelectItem>
                                <SelectItem value="SUM">SUM (Total)</SelectItem>
                                <SelectItem value="AVG">AVG (Average)</SelectItem>
                                <SelectItem value="MIN">MIN (Minimum)</SelectItem>
                                <SelectItem value="MAX">MAX (Maximum)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {aggregateFn !== 'COUNT' ? (
                        <div className="space-y-1.5">
                            <Label className="text-xs">4. Numeric / Formula Field</Label>
                            <Select value={metricField} onValueChange={setMetricField}>
                                <SelectTrigger data-testid="custom-report-metric-select">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {(activeObject?.numericFields || []).map(nf => (
                                        <SelectItem key={nf.apiName} value={nf.apiName}>
                                            {nf.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    ) : (
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                onClick={handleRunReport}
                                disabled={running || !selectedObjectApi || !groupByField}
                                data-testid="run-custom-object-report"
                                className="w-full"
                            >
                                {running ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                                        Running...
                                    </>
                                ) : (
                                    <>
                                        <BarChart3 className="w-4 h-4 mr-1.5" />
                                        Run Object Report
                                    </>
                                )}
                            </Button>
                        </div>
                    )}
                </div>

                {/* Filter Rules & Save to Report Category Toolbar */}
                <div className="rounded-xl border border-border bg-muted/20 p-3.5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleAddFilterRule}
                                className="h-7 text-xs"
                            >
                                <Plus className="w-3.5 h-3.5 mr-1" /> Add Filter Condition
                            </Button>
                            <div className="inline-flex rounded-md border border-border bg-muted p-0.5">
                                {(['TABLE', 'BAR', 'KPI'] as const).map(mode => (
                                    <button
                                        key={mode}
                                        type="button"
                                        onClick={() => setChartType(mode)}
                                        className={`px-2.5 py-1 rounded text-[11px] font-medium ${
                                            chartType === mode
                                                ? 'bg-card text-foreground shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                    >
                                        {mode === 'TABLE'
                                            ? 'Table'
                                            : mode === 'BAR'
                                              ? 'Bar Chart'
                                              : 'KPI Summary'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {aggregateFn !== 'COUNT' && (
                            <Button
                                type="button"
                                size="sm"
                                onClick={handleRunReport}
                                disabled={running || !selectedObjectApi || !groupByField}
                                data-testid="run-custom-object-report"
                            >
                                {running ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                                        Running...
                                    </>
                                ) : (
                                    <>
                                        <BarChart3 className="w-4 h-4 mr-1.5" />
                                        Run Object Report
                                    </>
                                )}
                            </Button>
                        )}
                    </div>

                    {filterRules.length > 0 && (
                        <div className="space-y-2">
                            {filterRules.map((rule, idx) => (
                                <div key={idx} className="flex flex-wrap items-center gap-2">
                                    <select
                                        value={rule.field}
                                        onChange={e => {
                                            const field = e.target.value;
                                            setFilterRules(prev =>
                                                prev.map((r, i) =>
                                                    i === idx ? { ...r, field } : r,
                                                ),
                                            );
                                        }}
                                        className="h-8 rounded border border-border bg-card px-2 text-xs text-foreground"
                                    >
                                        {(activeObject?.dimensionFields || []).map(f => (
                                            <option key={f.apiName} value={f.apiName}>
                                                {f.label}
                                            </option>
                                        ))}
                                        {(activeObject?.numericFields || []).map(f => (
                                            <option key={`num-${f.apiName}`} value={f.apiName}>
                                                {f.label}
                                            </option>
                                        ))}
                                    </select>
                                    <select
                                        value={rule.operator}
                                        onChange={e => {
                                            const operator = e.target.value as ViewFilterOperator;
                                            setFilterRules(prev =>
                                                prev.map((r, i) =>
                                                    i === idx ? { ...r, operator } : r,
                                                ),
                                            );
                                        }}
                                        className="h-8 rounded border border-border bg-card px-2 text-xs text-foreground"
                                    >
                                        <option value="equals">Equals</option>
                                        <option value="not_equals">Not Equals</option>
                                        <option value="contains">Contains</option>
                                        <option value="gt">&gt; Greater Than</option>
                                        <option value="lt">&lt; Less Than</option>
                                        <option value="not_empty">Is Not Empty</option>
                                        <option value="is_empty">Is Empty</option>
                                    </select>
                                    {rule.operator !== 'not_empty' &&
                                        rule.operator !== 'is_empty' && (
                                            <Input
                                                value={rule.value || ''}
                                                onChange={e => {
                                                    const value = e.target.value;
                                                    setFilterRules(prev =>
                                                        prev.map((r, i) =>
                                                            i === idx ? { ...r, value } : r,
                                                        ),
                                                    );
                                                }}
                                                placeholder="Filter value…"
                                                className="h-8 w-44 text-xs"
                                            />
                                        )}
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                            setFilterRules(prev => prev.filter((_, i) => i !== idx))
                                        }
                                        className="h-8 px-2 text-muted-foreground hover:text-destructive"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Save Report Bar */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
                        <Input
                            value={reportName}
                            onChange={e => setReportName(e.target.value)}
                            placeholder="Report title (e.g., Hostel Occupancy by Wing)"
                            className="h-8 max-w-xs text-xs"
                        />
                        <select
                            value={selectedCategoryId}
                            onChange={e => setSelectedCategoryId(e.target.value)}
                            className="h-8 rounded border border-border bg-card px-2.5 text-xs text-foreground"
                        >
                            <option value="__none__">No Category (General)</option>
                            {categories.map(c => (
                                <option key={c.id} value={c.id}>
                                    Category: {c.name}
                                </option>
                            ))}
                        </select>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={handleSaveReport}
                            disabled={savingReport}
                            className="h-8 text-xs"
                        >
                            <Save className="w-3.5 h-3.5 mr-1" />
                            {savingReport
                                ? 'Saving…'
                                : editingReportId
                                  ? 'Update Saved Report'
                                  : 'Save to Catalog'}
                        </Button>
                    </div>
                </div>

                {/* Execution Results */}
                {columns.length > 0 && (
                    <div className="space-y-3 pt-2 border-t border-border">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                                Scanned {scannedCount ?? 0} record(s) · {rows.length} group(s)
                            </span>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={handleExportCsv}
                                className="h-7 text-xs"
                            >
                                <Download className="w-3.5 h-3.5 mr-1" /> Export CSV
                            </Button>
                        </div>

                        {chartType === 'KPI' ? (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {rows.slice(0, 9).map((row, idx) => (
                                    <div
                                        key={idx}
                                        className="rounded-xl border border-border bg-card p-4"
                                    >
                                        <div className="text-xs text-muted-foreground truncate">
                                            {String(row[dimColLabel] ?? '—')}
                                        </div>
                                        <div className="text-2xl font-bold text-foreground mt-1">
                                            {String(row[metricColLabel] ?? 0)}
                                        </div>
                                        <div className="text-[11px] text-muted-foreground mt-0.5">
                                            {metricColLabel}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : chartType === 'BAR' ? (
                            <div className="rounded-xl border border-border bg-card p-4 space-y-2.5">
                                {rows.map((row, idx) => {
                                    const num = Number(row[metricColLabel] ?? 0);
                                    const pct = Math.max(
                                        2,
                                        Math.min(
                                            100,
                                            Math.round(
                                                ((Number.isFinite(num) ? num : 0) / maxMetricVal) *
                                                    100,
                                            ),
                                        ),
                                    );
                                    return (
                                        <div key={idx} className="space-y-1">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="font-medium text-foreground">
                                                    {String(row[dimColLabel] ?? '—')}
                                                </span>
                                                <span className="font-mono text-muted-foreground">
                                                    {String(row[metricColLabel] ?? 0)}
                                                </span>
                                            </div>
                                            <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                                                <div
                                                    className="h-full bg-primary rounded-full"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="rounded-md border border-border overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            {columns.map(col => (
                                                <TableHead key={col.label}>{col.label}</TableHead>
                                            ))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {rows.length === 0 ? (
                                            <TableRow>
                                                <TableCell
                                                    colSpan={columns.length}
                                                    className="text-center text-muted-foreground py-6"
                                                >
                                                    No records found for this object yet.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            rows.map((row, idx) => (
                                                <TableRow key={idx}>
                                                    {columns.map(col => (
                                                        <TableCell key={col.label}>
                                                            {String(row[col.label] ?? '—')}
                                                        </TableCell>
                                                    ))}
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
