'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    MetadataField,
    bulkImportRecords,
    deleteRecord,
    updateRecordFieldValue,
} from '@/lib/actions/metadata-engine';
import {
    deleteLcncReportAction,
    deleteObjectViewAction,
    saveLcncObjectReportAction,
    upsertObjectViewAction,
    upsertReportCategoryAction,
    upsertViewCategoryAction,
} from '@/lib/actions/lcnc-platform';
import { runCustomObjectBiReport } from '@/app/(admin)/reports/bi-actions';
import type { BiReportColumn, BiReportRow } from '@/app/(admin)/reports/bi-types';
import {
    applyViewFilterRules,
    computeHomeKpiCards,
    sortRecordsByField,
    type HomeLayoutSchema,
    type MetadataViewCategoryItem,
    type ReportCategoryItem,
    type SavedLcncReportItem,
    type SavedObjectViewItem,
    type SavedViewFilterRule,
    type ViewFilterOperator,
} from '@/lib/metadata/lcnc-helpers';
import type { RollupAggregateFunction } from '@/lib/metadata/platform';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/format';
import {
    ArrowUpDown,
    BarChart3,
    Download,
    FolderPlus,
    GripVertical,
    Kanban,
    Play,
    Plus,
    Save,
    Sliders,
    Table as TableIcon,
    Trash2,
    Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { sanitizeCsvValue } from '@/lib/utils/csv-sanitize';

function parseCsvToRecords(csvText: string): Record<string, unknown>[] {
    const lines = csvText
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean);
    if (lines.length < 2) return [];
    const splitCsvLine = (line: string): string[] => {
        const out: string[] = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    cur += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (ch === ',' && !inQuotes) {
                out.push(cur.trim());
                cur = '';
            } else {
                cur += ch;
            }
        }
        out.push(cur.trim());
        return out;
    };
    const headers = splitCsvLine(lines[0]);
    return lines.slice(1).map(line => {
        const cells = splitCsvLine(line);
        const row: Record<string, unknown> = {};
        headers.forEach((h, idx) => {
            if (h) row[h] = cells[idx] ?? '';
        });
        return row;
    });
}

function renderCell(field: MetadataField | undefined, value: unknown): React.ReactNode {
    if (value == null || value === '') return '-';

    if (
        field?.validationRules?.fieldSubType === 'LOOKUP' &&
        field?.validationRules?.lookupTargetObject
    ) {
        const targetObj = field.validationRules.lookupTargetObject;
        const valStr = String(value);
        return (
            <Link
                href={`/app/${targetObj}/${valStr}`}
                className="inline-flex items-center gap-1 rounded bg-accent px-2 py-0.5 font-mono text-xs font-medium text-primary hover:underline"
            >
                {targetObj}:{valStr.slice(0, 8)}
            </Link>
        );
    }

    if (field?.validationRules?.fieldSubType === 'FORMULA') {
        return (
            <span className="inline-flex items-center gap-1.5 font-mono text-foreground">
                <span className="rounded bg-info-subtle px-1 py-0.5 text-[10px] font-semibold text-info">
                    f(x)
                </span>
                {String(value)}
            </span>
        );
    }

    if (field?.validationRules?.fieldSubType === 'ROLLUP_SUMMARY') {
        return (
            <span className="inline-flex items-center gap-1.5 font-mono text-foreground">
                <span className="rounded bg-accent px-1 py-0.5 text-[10px] font-semibold text-primary">
                    Σ {field.validationRules.rollupAggregate || 'COUNT'}
                </span>
                {String(value)}
            </span>
        );
    }

    if (field?.validationRules?.fieldSubType === 'AUTO_NUMBER') {
        return (
            <span className="inline-flex items-center rounded bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-foreground border border-border">
                {String(value)}
            </span>
        );
    }

    if (field?.validationRules?.fieldSubType === 'EMAIL') {
        const email = String(value);
        return (
            <a href={`mailto:${email}`} className="font-medium text-primary hover:underline">
                {email}
            </a>
        );
    }

    if (field?.validationRules?.fieldSubType === 'PHONE') {
        const phone = String(value);
        const digits = phone.replace(/[^\d]/g, '');
        return (
            <span className="inline-flex items-center gap-2">
                <a href={`tel:${phone}`} className="font-mono text-xs text-primary hover:underline">
                    {phone}
                </a>
                {digits.length >= 10 && (
                    <a
                        href={`https://wa.me/${digits}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded bg-success-subtle px-1.5 py-0.5 text-[10px] font-semibold text-success hover:underline"
                    >
                        WhatsApp
                    </a>
                )}
            </span>
        );
    }

    if (field?.validationRules?.fieldSubType === 'URL') {
        const url = String(value).trim();
        if (!/^https?:\/\//i.test(url)) {
            return <span className="font-mono text-xs text-muted-foreground">{url}</span>;
        }
        return (
            <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-primary hover:underline"
            >
                {url}
            </a>
        );
    }

    switch (field?.dataType) {
        case 'CURRENCY':
            return formatCurrency(value as string | number);
        case 'DATE':
            return formatDate(String(value));
        case 'BOOLEAN':
            return value === true || value === 'true' ? 'Yes' : 'No';
        default:
            return String(value);
    }
}

export default function GenericListClient({
    objectId,
    objectLabel,
    objectName,
    fields,
    records,
    layout,
    homeSchema,
    initialViewCategories = [],
    initialSavedViews = [],
    initialReportCategories = [],
    initialObjectReports = [],
    permittedForms = [],
    canCustomizeObject = false,
    canManageCategories = false,
}: {
    objectId?: string;
    objectLabel?: string;
    objectName: string;
    fields: MetadataField[];
    records: Record<string, unknown>[];
    layout?: { columns?: string[] };
    homeSchema?: HomeLayoutSchema;
    initialViewCategories?: MetadataViewCategoryItem[];
    initialSavedViews?: SavedObjectViewItem[];
    initialReportCategories?: ReportCategoryItem[];
    initialObjectReports?: SavedLcncReportItem[];
    permittedForms?: { id: string; name: string; isDefault: boolean }[];
    canCustomizeObject?: boolean;
    canManageCategories?: boolean;
}) {
    const router = useRouter();
    const [, startTransition] = useTransition();
    const [localRecords, setLocalRecords] = useState<Record<string, unknown>[]>(records);
    const [workspaceMode, setWorkspaceMode] = useState<'VIEWS' | 'REPORTS'>('VIEWS');

    const readableNames = new Set(fields.map(f => f.apiName));
    const layoutColumns: string[] = Array.isArray(layout?.columns) ? layout.columns : [];
    const configured = layoutColumns.filter(col => readableNames.has(col));
    const defaultColumns =
        configured.length > 0 ? configured : fields.slice(0, 5).map(f => f.apiName);

    const defaultSavedView = initialSavedViews.find(v => v.isDefault);

    // Persistent View Categories & Saved Views state
    const [viewCategories, setViewCategories] =
        useState<MetadataViewCategoryItem[]>(initialViewCategories);
    const [dbViews, setDbViews] = useState<SavedObjectViewItem[]>(initialSavedViews);
    const [activeViewCategoryFilter, setActiveViewCategoryFilter] = useState<string>('ALL');
    const [activeViewId, setActiveViewId] = useState<string>(defaultSavedView?.id ?? '__all__');

    const [activeColumns, setActiveColumns] = useState<string[]>(
        defaultSavedView?.columns?.filter(c => readableNames.has(c)).length
            ? defaultSavedView.columns.filter(c => readableNames.has(c))
            : defaultColumns,
    );
    const [activeRules, setActiveRules] = useState<SavedViewFilterRule[]>(
        defaultSavedView?.filterRules ?? [],
    );
    const [sortField, setSortField] = useState<string>(defaultSavedView?.sortField || '');
    const [sortDirection, setSortDirection] = useState<'ASC' | 'DESC'>(
        defaultSavedView?.sortDirection || 'DESC',
    );

    const kanbanFields = fields.filter(
        f =>
            (f.dataType === 'PICKLIST' && f.picklistOptions?.length > 0) ||
            ['status', 'stage', 'category', 'gender'].includes(f.apiName),
    );
    const [viewMode, setViewMode] = useState<'TABLE' | 'KANBAN'>(
        defaultSavedView?.displayMode === 'KANBAN' && kanbanFields.length > 0
            ? 'KANBAN'
            : 'TABLE',
    );
    const [groupByField, setGroupByField] = useState<string>(
        defaultSavedView?.kanbanGroupField || kanbanFields[0]?.apiName || '',
    );

    // Quick inline filter + Pin View compatibility state
    const [filterField, setFilterField] = useState<string>(fields[0]?.apiName || '');
    const [filterOperator, setFilterOperator] = useState<
        'ALL' | 'equals' | 'contains' | 'greater_than' | 'less_than'
    >('ALL');
    const [filterValue, setFilterValue] = useState<string>('');
    const [newViewName, setNewViewName] = useState<string>('');
    const [newViewCategoryId, setNewViewCategoryId] = useState<string>('__none__');
    const [newViewVisibility, setNewViewVisibility] = useState<'SHARED' | 'PRIVATE'>('SHARED');
    const [newViewIsDefault, setNewViewIsDefault] = useState<boolean>(false);
    const [showViewStudio, setShowViewStudio] = useState<boolean>(false);
    const [showNewViewCat, setShowNewViewCat] = useState<boolean>(false);
    const [newViewCatName, setNewViewCatName] = useState<string>('');
    const [savingView, setSavingView] = useState<boolean>(false);

    // Kanban drag state
    const [draggedRecordId, setDraggedRecordId] = useState<string | null>(null);
    const [dragOverBucket, setDragOverBucket] = useState<string | null>(null);

    // CSV Import state
    const [showImportPanel, setShowImportPanel] = useState(false);
    const [csvInputText, setCsvInputText] = useState('');
    const [importingCsv, setImportingCsv] = useState(false);

    // Object Reports Drawer state
    const [reportCategories, setReportCategories] =
        useState<ReportCategoryItem[]>(initialReportCategories);
    const [objectReports, setObjectReports] =
        useState<SavedLcncReportItem[]>(initialObjectReports);
    const [activeReportCatFilter, setActiveReportCatFilter] = useState<string>('ALL');
    const [repGroupBy, setRepGroupBy] = useState<string>(fields[0]?.apiName || '');
    const [repAgg, setRepAgg] = useState<RollupAggregateFunction>('COUNT');
    const numericFields = fields.filter(
        f => f.dataType === 'NUMBER' || f.dataType === 'CURRENCY',
    );
    const [repMetricField, setRepMetricField] = useState<string>(numericFields[0]?.apiName || '');
    const [repName, setRepName] = useState<string>('');
    const [repCategoryId, setRepCategoryId] = useState<string>('__none__');
    const [newRepCatName, setNewRepCatName] = useState<string>('');
    const [showNewRepCat, setShowNewRepCat] = useState<boolean>(false);
    const [runningRep, setRunningRep] = useState<boolean>(false);
    const [repCols, setRepCols] = useState<BiReportColumn[]>([]);
    const [repRows, setRepRows] = useState<BiReportRow[]>([]);

    const displayColumns = activeColumns.length > 0 ? activeColumns : defaultColumns;

    // Combine persistent saved-view rules with quick-filter bar rule
    const combinedRules: SavedViewFilterRule[] = [...activeRules];
    if (filterOperator !== 'ALL' && filterField && filterValue.trim()) {
        const mappedOp: ViewFilterOperator =
            filterOperator === 'greater_than'
                ? 'gt'
                : filterOperator === 'less_than'
                  ? 'lt'
                  : filterOperator;
        combinedRules.push({
            field: filterField,
            operator: mappedOp,
            value: filterValue.trim(),
        });
    }

    const filteredRecords = sortRecordsByField(
        applyViewFilterRules(localRecords, combinedRules),
        sortField || null,
        sortDirection,
    );

    const kpiCards = computeHomeKpiCards(localRecords, fields, homeSchema);

    const activeKanbanField = fields.find(f => f.apiName === groupByField);
    const kanbanBuckets: string[] = (() => {
        if (!activeKanbanField) return [];
        if (
            Array.isArray(activeKanbanField.picklistOptions) &&
            activeKanbanField.picklistOptions.length > 0
        ) {
            return activeKanbanField.picklistOptions;
        }
        const distinct = Array.from(
            new Set(
                localRecords
                    .map(r => String(r[activeKanbanField.apiName] ?? '').trim())
                    .filter(Boolean),
            ),
        );
        return distinct.length > 0 ? distinct : ['PENDING', 'ACTIVE', 'COMPLETED'];
    })();

    const primaryTitleField =
        displayColumns.find(c => c !== 'id' && c !== groupByField) ||
        fields[0]?.apiName ||
        'id';

    const handleSelectSavedView = (view: SavedObjectViewItem | null) => {
        if (!view) {
            setActiveViewId('__all__');
            setActiveColumns(defaultColumns);
            setActiveRules([]);
            setFilterOperator('ALL');
            setFilterValue('');
            setSortField('');
            setViewMode('TABLE');
            return;
        }
        setActiveViewId(view.id);
        const validCols = view.columns.filter(c => readableNames.has(c));
        setActiveColumns(validCols.length > 0 ? validCols : defaultColumns);
        setActiveRules(Array.isArray(view.filterRules) ? [...view.filterRules] : []);
        setFilterOperator('ALL');
        setFilterValue('');
        setSortField(view.sortField || '');
        setSortDirection(view.sortDirection || 'DESC');
        if (view.displayMode === 'KANBAN' && kanbanFields.length > 0) {
            setViewMode('KANBAN');
            if (view.kanbanGroupField) setGroupByField(view.kanbanGroupField);
        } else {
            setViewMode('TABLE');
        }
    };

    const handlePersistView = async () => {
        const trimmed = newViewName.trim();
        if (!trimmed) {
            toast.error('Enter a name for this Saved View.');
            return;
        }
        setSavingView(true);
        try {
            const catId = newViewCategoryId !== '__none__' ? newViewCategoryId : null;
            const rulesToSave = [...combinedRules];
            const res = await upsertObjectViewAction({
                id: activeViewId !== '__all__' && showViewStudio ? activeViewId : undefined,
                objectApiName: objectName,
                categoryId: catId,
                name: trimmed,
                columns: displayColumns,
                filterRules: rulesToSave,
                sortField: sortField || null,
                sortDirection,
                displayMode: viewMode,
                kanbanGroupField: viewMode === 'KANBAN' ? groupByField : null,
                isDefault: newViewIsDefault,
                visibility: newViewVisibility,
            });
            if (!res.success) {
                toast.error(res.error || 'Failed to save view.');
                return;
            }
            const catName = catId
                ? viewCategories.find(c => c.id === catId)?.name ?? null
                : null;
            const savedItem: SavedObjectViewItem = {
                id: res.viewId || `view-${Date.now()}`,
                objectApiName: objectName,
                categoryId: catId,
                categoryName: catName,
                name: trimmed,
                columns: [...displayColumns],
                filterRules: rulesToSave,
                sortField: sortField || null,
                sortDirection,
                displayMode: viewMode,
                kanbanGroupField: viewMode === 'KANBAN' ? groupByField : null,
                isDefault: newViewIsDefault,
                visibility: newViewVisibility,
                allowedRoles: [],
                createdBy: null,
            };
            setDbViews(prev => {
                const withoutDup = prev.filter(v => v.id !== savedItem.id && v.name !== trimmed);
                return [...withoutDup, savedItem];
            });
            setActiveViewId(savedItem.id);
            setActiveRules(rulesToSave);
            setFilterOperator('ALL');
            setFilterValue('');
            setNewViewName('');
            setShowViewStudio(false);
            toast.success(`Saved List View "${trimmed}" to database.`);
            router.refresh();
        } finally {
            setSavingView(false);
        }
    };

    const handleDeleteActiveView = async (viewId: string) => {
        const res = await deleteObjectViewAction(viewId);
        if (!res.success) {
            toast.error(res.error || 'Could not delete view.');
            return;
        }
        setDbViews(prev => prev.filter(v => v.id !== viewId));
        if (activeViewId === viewId) {
            handleSelectSavedView(null);
        }
        toast.success('Saved view removed.');
        router.refresh();
    };

    const handleCreateViewCategory = async () => {
        if (!newViewCatName.trim()) {
            toast.error('Enter a View Category name.');
            return;
        }
        const res = await upsertViewCategoryAction({
            objectApiName: objectName,
            name: newViewCatName.trim(),
        });
        if (!res.success || !res.categoryId) {
            toast.error(res.error || 'Failed to create View Category.');
            return;
        }
        const added: MetadataViewCategoryItem = {
            id: res.categoryId,
            objectApiName: objectName,
            name: newViewCatName.trim(),
            description: null,
            sortOrder: viewCategories.length,
        };
        setViewCategories(prev => [...prev, added]);
        setNewViewCategoryId(added.id);
        setActiveViewCategoryFilter(added.id);
        setNewViewCatName('');
        setShowNewViewCat(false);
        toast.success(`View Category "${added.name}" created.`);
        router.refresh();
    };

    const handleDropOnBucket = (recordId: string, nextValue: string) => {
        if (!activeKanbanField) return;
        const target = localRecords.find(r => String(r.id) === recordId);
        if (!target || String(target[activeKanbanField.apiName] ?? '') === nextValue) {
            return;
        }

        const prevValue = target[activeKanbanField.apiName];
        setLocalRecords(prev =>
            prev.map(r =>
                String(r.id) === recordId
                    ? { ...r, [activeKanbanField.apiName]: nextValue }
                    : r,
            ),
        );

        startTransition(async () => {
            const res = await updateRecordFieldValue(
                objectName,
                recordId,
                activeKanbanField.apiName,
                nextValue,
            );
            if (res.success) {
                toast.success(`Moved to ${nextValue}`);
                router.refresh();
            } else {
                setLocalRecords(prev =>
                    prev.map(r =>
                        String(r.id) === recordId
                            ? { ...r, [activeKanbanField.apiName]: prevValue }
                            : r,
                    ),
                );
                toast.error(res.error || 'Failed to move record.');
            }
        });
    };

    const handleExportCsv = () => {
        const exportCols = displayColumns.length > 0 ? displayColumns : fields.map(f => f.apiName);
        const headerLine = exportCols.map(col => sanitizeCsvValue(col)).join(',');
        const bodyLines = filteredRecords.map(rec =>
            exportCols.map(col => sanitizeCsvValue(rec[col])).join(','),
        );
        const csvContent = [headerLine, ...bodyLines].join('\n');
        if (typeof window !== 'undefined') {
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `${objectName}_export_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
        }
        toast.success(`Exported ${filteredRecords.length} record(s) to CSV.`);
    };

    const handleImportCsv = async () => {
        const parsedRows = parseCsvToRecords(csvInputText);
        if (parsedRows.length === 0) {
            toast.error('Provide a CSV header row and at least one data row.');
            return;
        }
        setImportingCsv(true);
        try {
            const res = await bulkImportRecords(objectName, parsedRows);
            if (res.importedCount > 0) {
                toast.success(`Imported ${res.importedCount} record(s) into ${objectName}.`);
                setCsvInputText('');
                setShowImportPanel(false);
                router.refresh();
            }
            if (res.errors.length > 0) {
                toast.error(res.errors.slice(0, 3).join(' | '));
            }
        } finally {
            setImportingCsv(false);
        }
    };

    const handleDeleteRecord = (recordId: string) => {
        const previous = localRecords;
        setLocalRecords(prev => prev.filter(r => String(r.id) !== recordId));
        startTransition(async () => {
            const res = await deleteRecord(objectName, recordId);
            if (res.success) {
                toast.success('Record deleted and deletion workflows evaluated.');
                router.refresh();
            } else {
                setLocalRecords(previous);
                toast.error(res.error || 'Failed to delete record.');
            }
        });
    };

    // Object Home Reports handlers
    const handleRunObjectReport = async (params?: {
        groupByField: string;
        aggregateFunction: RollupAggregateFunction;
        metricField?: string | null;
        filterRules?: SavedViewFilterRule[];
    }) => {
        const gb = params?.groupByField || repGroupBy;
        const ag = params?.aggregateFunction || repAgg;
        const mf = params ? params.metricField || undefined : ag === 'COUNT' ? undefined : repMetricField;
        if (!gb) {
            toast.error('Select a Group-By field.');
            return;
        }
        setRunningRep(true);
        try {
            const res = await runCustomObjectBiReport({
                objectApiName: objectName,
                groupByField: gb,
                aggregateFunction: ag,
                metricField: mf,
                filterRules: params?.filterRules,
            });
            if (!res.success || !res.columns || !res.rows) {
                toast.error(res.error || 'Failed to run report.');
                return;
            }
            setRepCols(res.columns);
            setRepRows(res.rows);
            toast.success(`Report executed across ${res.totalRecordsScanned ?? 0} record(s).`);
        } finally {
            setRunningRep(false);
        }
    };

    const handleSaveObjectReport = async () => {
        if (!repName.trim()) {
            toast.error('Enter a report name.');
            return;
        }
        const catId = repCategoryId !== '__none__' ? repCategoryId : null;
        const res = await saveLcncObjectReportAction({
            name: repName.trim(),
            categoryId: catId,
            objectApiName: objectName,
            groupByField: repGroupBy,
            aggregateFunction: repAgg,
            metricField: repAgg === 'COUNT' ? null : repMetricField || null,
            chartType: 'TABLE',
        });
        if (!res.success) {
            toast.error(res.error || 'Failed to save report.');
            return;
        }
        const catName = catId ? reportCategories.find(c => c.id === catId)?.name ?? null : null;
        setObjectReports(prev => [
            {
                id: res.reportId || `rep-${Date.now()}`,
                name: repName.trim(),
                categoryId: catId,
                categoryName: catName,
                objectApiName: objectName,
                reportKind: 'OBJECT_REPORT',
                datasetKey: `object:${objectName}`,
                groupByField: repGroupBy,
                aggregateFunction: repAgg,
                metricField: repAgg === 'COUNT' ? null : repMetricField || null,
                selectedColumns: [],
                filterRules: [],
                chartType: 'TABLE',
                allowedRoles: [],
                createdAt: new Date().toISOString(),
            },
            ...prev,
        ]);
        setRepName('');
        toast.success('Saved report to Object Home & Reports Catalog.');
        router.refresh();
    };

    const handleCreateReportCategory = async () => {
        if (!newRepCatName.trim()) return;
        const res = await upsertReportCategoryAction({ name: newRepCatName.trim() });
        if (!res.success || !res.categoryId) {
            toast.error(res.error || 'Could not create Report Category.');
            return;
        }
        const added: ReportCategoryItem = {
            id: res.categoryId,
            name: newRepCatName.trim(),
            description: null,
            sortOrder: reportCategories.length,
        };
        setReportCategories(prev => [...prev, added]);
        setRepCategoryId(added.id);
        setNewRepCatName('');
        setShowNewRepCat(false);
        toast.success(`Report Category "${added.name}" created.`);
    };

    const visibleDbViews = dbViews.filter(v =>
        activeViewCategoryFilter === 'ALL' ? true : v.categoryId === activeViewCategoryFilter,
    );

    const visibleObjectReports = objectReports.filter(r =>
        activeReportCatFilter === 'ALL' ? true : r.categoryId === activeReportCatFilter,
    );

    return (
        <div className="space-y-5" data-testid="object-home-workspace">
            {/* Object Home Live KPI Summary Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {kpiCards.map(kpi => (
                    <Card key={kpi.id} className="border-border bg-card">
                        <CardContent className="p-4">
                            <div className="text-xs font-medium text-muted-foreground truncate">
                                {kpi.label}
                            </div>
                            <div className="text-2xl font-bold text-foreground mt-1">
                                {kpi.value}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                                {kpi.subtitle}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Object Home Workspace Mode Switcher */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex rounded-lg border border-border bg-muted p-1">
                    <button
                        type="button"
                        onClick={() => setWorkspaceMode('VIEWS')}
                        className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
                            workspaceMode === 'VIEWS'
                                ? 'bg-card text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <TableIcon className="w-3.5 h-3.5" /> Categorized Views &amp; Records (
                        {filteredRecords.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setWorkspaceMode('REPORTS')}
                        data-testid="object-home-reports-tab"
                        className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
                            workspaceMode === 'REPORTS'
                                ? 'bg-card text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <BarChart3 className="w-3.5 h-3.5" /> {objectLabel || objectName} Reports (
                        {objectReports.length})
                    </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {canCustomizeObject && objectId && (
                        <Button variant="outline" size="sm" asChild>
                            <Link href={`/settings/objects/${objectId}`}>
                                <Sliders className="w-3.5 h-3.5 mr-1.5" /> Customize Object, Forms &amp; FLS
                            </Link>
                        </Button>
                    )}
                    {permittedForms.length > 1 && (
                        <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
                            <span>Forms:</span>
                            {permittedForms.slice(0, 3).map(frm => (
                                <Link
                                    key={frm.id}
                                    href={`/app/${objectName}/new?layoutId=${frm.id}`}
                                    className="rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground hover:border-primary"
                                >
                                    + {frm.name}
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {workspaceMode === 'REPORTS' ? (
                /* Dedicated Object Reports Workspace */
                <Card>
                    <CardContent className="p-5 space-y-5">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setActiveReportCatFilter('ALL')}
                                    className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                                        activeReportCatFilter === 'ALL'
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-muted text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    All Categories ({objectReports.length})
                                </button>
                                {reportCategories.map(cat => (
                                    <button
                                        key={cat.id}
                                        type="button"
                                        onClick={() => setActiveReportCatFilter(cat.id)}
                                        className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                                            activeReportCatFilter === cat.id
                                                ? 'bg-primary text-primary-foreground'
                                                : 'bg-muted text-muted-foreground hover:text-foreground'
                                        }`}
                                    >
                                        {cat.name}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-2">
                                {canManageCategories && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setShowNewRepCat(prev => !prev)}
                                        className="h-7 text-xs"
                                    >
                                        <FolderPlus className="w-3.5 h-3.5 mr-1" /> New Report Category
                                    </Button>
                                )}
                                <Button variant="outline" size="sm" asChild className="h-7 text-xs">
                                    <Link href="/reports">Open Full Report Studio</Link>
                                </Button>
                            </div>
                        </div>

                        {showNewRepCat && (
                            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3">
                                <Input
                                    value={newRepCatName}
                                    onChange={e => setNewRepCatName(e.target.value)}
                                    placeholder="New Report Category name…"
                                    className="h-8 max-w-xs text-xs"
                                />
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={handleCreateReportCategory}
                                    className="h-8 text-xs"
                                >
                                    Save Category
                                </Button>
                            </div>
                        )}

                        {visibleObjectReports.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {visibleObjectReports.map(rep => (
                                    <div
                                        key={rep.id}
                                        className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 p-3 text-xs"
                                    >
                                        <div className="min-w-0">
                                            <div className="font-semibold text-foreground truncate">
                                                {rep.name}
                                            </div>
                                            <div className="text-[11px] text-muted-foreground truncate">
                                                {rep.aggregateFunction} by {rep.groupByField}
                                                {rep.categoryName ? ` · ${rep.categoryName}` : ''}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={() => {
                                                    setRepGroupBy(rep.groupByField);
                                                    setRepAgg(rep.aggregateFunction);
                                                    setRepMetricField(rep.metricField || '');
                                                    void handleRunObjectReport({
                                                        groupByField: rep.groupByField,
                                                        aggregateFunction: rep.aggregateFunction,
                                                        metricField: rep.metricField,
                                                        filterRules: rep.filterRules,
                                                    });
                                                }}
                                                className="h-7 px-2 text-xs"
                                            >
                                                <Play className="w-3 h-3 mr-1" /> Run
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                onClick={async () => {
                                                    const r = await deleteLcncReportAction(rep.id);
                                                    if (r.success) {
                                                        setObjectReports(prev =>
                                                            prev.filter(x => x.id !== rep.id),
                                                        );
                                                        toast.success('Report archived.');
                                                    }
                                                }}
                                                className="h-7 px-1.5 text-muted-foreground hover:text-destructive"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Quick Object Report Builder */}
                        <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Build &amp; Save Custom Report on {objectLabel || objectName}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                                <div>
                                    <label className="block text-xs text-muted-foreground mb-1">
                                        Group By Field
                                    </label>
                                    <select
                                        value={repGroupBy}
                                        onChange={e => setRepGroupBy(e.target.value)}
                                        className="h-9 w-full rounded-md border border-border bg-card px-2.5 text-xs text-foreground"
                                    >
                                        {fields.map(f => (
                                            <option key={f.apiName} value={f.apiName}>
                                                {f.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs text-muted-foreground mb-1">
                                        Aggregation
                                    </label>
                                    <select
                                        value={repAgg}
                                        onChange={e =>
                                            setRepAgg(e.target.value as RollupAggregateFunction)
                                        }
                                        className="h-9 w-full rounded-md border border-border bg-card px-2.5 text-xs text-foreground"
                                    >
                                        <option value="COUNT">COUNT</option>
                                        <option value="SUM">SUM</option>
                                        <option value="AVG">AVG</option>
                                        <option value="MIN">MIN</option>
                                        <option value="MAX">MAX</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs text-muted-foreground mb-1">
                                        Metric Field (SUM/AVG)
                                    </label>
                                    <select
                                        value={repMetricField}
                                        disabled={repAgg === 'COUNT'}
                                        onChange={e => setRepMetricField(e.target.value)}
                                        className="h-9 w-full rounded-md border border-border bg-card px-2.5 text-xs text-foreground disabled:opacity-50"
                                    >
                                        <option value="">Select numeric field…</option>
                                        {numericFields.map(nf => (
                                            <option key={nf.apiName} value={nf.apiName}>
                                                {nf.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <Button
                                    type="button"
                                    onClick={() => handleRunObjectReport()}
                                    disabled={runningRep}
                                    className="h-9"
                                >
                                    <BarChart3 className="w-4 h-4 mr-1.5" />
                                    {runningRep ? 'Running…' : 'Run Report'}
                                </Button>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
                                <Input
                                    value={repName}
                                    onChange={e => setRepName(e.target.value)}
                                    placeholder={`Save report as (e.g., ${objectLabel || objectName} Breakdown)`}
                                    className="h-8 max-w-xs text-xs"
                                />
                                <select
                                    value={repCategoryId}
                                    onChange={e => setRepCategoryId(e.target.value)}
                                    className="h-8 rounded border border-border bg-card px-2.5 text-xs text-foreground"
                                >
                                    <option value="__none__">No Report Category</option>
                                    {reportCategories.map(c => (
                                        <option key={c.id} value={c.id}>
                                            {c.name}
                                        </option>
                                    ))}
                                </select>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleSaveObjectReport}
                                    className="h-8 text-xs"
                                >
                                    <Save className="w-3.5 h-3.5 mr-1" /> Save Object Report
                                </Button>
                            </div>
                        </div>

                        {repCols.length > 0 && (
                            <div className="rounded-xl border border-border overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs uppercase bg-muted border-b border-border text-foreground">
                                        <tr>
                                            {repCols.map(c => (
                                                <th key={c.label} className="px-4 py-2.5 font-medium">
                                                    {c.label}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border bg-card">
                                        {repRows.map((row, i) => (
                                            <tr key={i}>
                                                {repCols.map(c => (
                                                    <td key={c.label} className="px-4 py-2.5 text-xs">
                                                        {String(row[c.label] ?? '—')}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            ) : (
                /* Categorized Persistent Views & Records Card */
                <Card>
                    <CardContent className="p-0">
                        {/* Top Toolbar: Table/Kanban + Sort + CSV + New Record */}
                        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-border">
                            <div className="flex flex-wrap items-center gap-2">
                                {kanbanFields.length > 0 && (
                                    <>
                                        <div className="inline-flex rounded-lg border border-border bg-muted p-1">
                                            <button
                                                type="button"
                                                onClick={() => setViewMode('TABLE')}
                                                className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                                                    viewMode === 'TABLE'
                                                        ? 'bg-card text-foreground shadow-sm'
                                                        : 'text-muted-foreground hover:text-foreground'
                                                }`}
                                            >
                                                <TableIcon className="w-3.5 h-3.5" /> Table
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setViewMode('KANBAN')}
                                                data-testid="toggle-kanban-view"
                                                className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                                                    viewMode === 'KANBAN'
                                                        ? 'bg-card text-foreground shadow-sm'
                                                        : 'text-muted-foreground hover:text-foreground'
                                                }`}
                                            >
                                                <Kanban className="w-3.5 h-3.5" /> Kanban Board
                                            </button>
                                        </div>
                                        {viewMode === 'KANBAN' && kanbanFields.length > 1 && (
                                            <select
                                                value={groupByField}
                                                onChange={e => setGroupByField(e.target.value)}
                                                aria-label="Group Kanban by field"
                                                className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
                                            >
                                                {kanbanFields.map(kf => (
                                                    <option key={kf.apiName} value={kf.apiName}>
                                                        Group by: {kf.label}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                    </>
                                )}

                                <div className="inline-flex items-center gap-1.5">
                                    <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
                                    <select
                                        value={sortField}
                                        onChange={e => setSortField(e.target.value)}
                                        aria-label="Sort field"
                                        className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
                                    >
                                        <option value="">Default Order</option>
                                        {fields.map(f => (
                                            <option key={f.apiName} value={f.apiName}>
                                                Sort: {f.label}
                                            </option>
                                        ))}
                                    </select>
                                    {sortField && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setSortDirection(d => (d === 'ASC' ? 'DESC' : 'ASC'))
                                            }
                                            className="h-8 rounded-md border border-border bg-card px-2 text-xs font-mono text-foreground"
                                        >
                                            {sortDirection}
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowViewStudio(s => !s)}
                                >
                                    <Sliders className="w-3.5 h-3.5 mr-1.5" /> View Builder
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleExportCsv}
                                    data-testid="export-object-csv"
                                >
                                    <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowImportPanel(v => !v)}
                                    data-testid="import-object-csv"
                                >
                                    <Upload className="w-3.5 h-3.5 mr-1.5" /> Import CSV
                                </Button>
                                <Link href={`/app/${objectName}/new`}>
                                    <Button size="sm">
                                        <Plus className="w-4 h-4 mr-1.5" /> New Record
                                    </Button>
                                </Link>
                            </div>
                        </div>

                        {/* View Categories Strip */}
                        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-border bg-muted/30 text-xs">
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-semibold text-muted-foreground mr-1">
                                    View Categories:
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setActiveViewCategoryFilter('ALL')}
                                    className={`rounded-md px-2.5 py-0.5 font-medium transition-colors ${
                                        activeViewCategoryFilter === 'ALL'
                                            ? 'bg-foreground text-background'
                                            : 'bg-card text-muted-foreground border border-border hover:text-foreground'
                                    }`}
                                >
                                    All Categories
                                </button>
                                {viewCategories.map(cat => (
                                    <button
                                        key={cat.id}
                                        type="button"
                                        onClick={() => setActiveViewCategoryFilter(cat.id)}
                                        className={`rounded-md px-2.5 py-0.5 font-medium transition-colors ${
                                            activeViewCategoryFilter === cat.id
                                                ? 'bg-foreground text-background'
                                                : 'bg-card text-muted-foreground border border-border hover:text-foreground'
                                        }`}
                                    >
                                        {cat.name}
                                    </button>
                                ))}
                            </div>
                            {canManageCategories && (
                                <button
                                    type="button"
                                    onClick={() => setShowNewViewCat(v => !v)}
                                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                >
                                    <FolderPlus className="w-3.5 h-3.5" /> + View Category
                                </button>
                            )}
                        </div>

                        {showNewViewCat && canManageCategories && (
                            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/40">
                                <Input
                                    value={newViewCatName}
                                    onChange={e => setNewViewCatName(e.target.value)}
                                    placeholder="View Category (e.g., Daily Ops, Escalations, Approvals)"
                                    className="h-8 max-w-xs text-xs"
                                />
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={handleCreateViewCategory}
                                    className="h-8 text-xs"
                                >
                                    Create Category
                                </Button>
                            </div>
                        )}

                        {/* Advanced View Studio Panel */}
                        {showViewStudio && (
                            <div className="p-4 border-b border-border bg-muted/30 space-y-4 text-xs">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                                    <div>
                                        <label className="block font-semibold text-muted-foreground mb-1">
                                            Saved View Name
                                        </label>
                                        <Input
                                            value={newViewName}
                                            onChange={e => setNewViewName(e.target.value)}
                                            placeholder="e.g. Pending Hostel Requests"
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-semibold text-muted-foreground mb-1">
                                            View Category
                                        </label>
                                        <select
                                            value={newViewCategoryId}
                                            onChange={e => setNewViewCategoryId(e.target.value)}
                                            className="h-8 w-full rounded border border-border bg-card px-2 text-xs text-foreground"
                                        >
                                            <option value="__none__">Uncategorized</option>
                                            {viewCategories.map(vc => (
                                                <option key={vc.id} value={vc.id}>
                                                    {vc.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block font-semibold text-muted-foreground mb-1">
                                            Sharing Visibility
                                        </label>
                                        <select
                                            value={newViewVisibility}
                                            onChange={e =>
                                                setNewViewVisibility(
                                                    e.target.value as 'SHARED' | 'PRIVATE',
                                                )
                                            }
                                            className="h-8 w-full rounded border border-border bg-card px-2 text-xs text-foreground"
                                        >
                                            <option value="SHARED">Shared with Tenant</option>
                                            <option value="PRIVATE">Private (Only Me)</option>
                                        </select>
                                    </div>
                                    <div className="flex items-center justify-between gap-2">
                                        <label className="inline-flex items-center gap-1.5 cursor-pointer text-foreground">
                                            <input
                                                type="checkbox"
                                                checked={newViewIsDefault}
                                                onChange={e => setNewViewIsDefault(e.target.checked)}
                                            />
                                            <span>Default View</span>
                                        </label>
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={handlePersistView}
                                            disabled={savingView}
                                            className="h-8"
                                        >
                                            <Save className="w-3.5 h-3.5 mr-1" />
                                            {savingView ? 'Saving…' : 'Save Persistent View'}
                                        </Button>
                                    </div>
                                </div>

                                <div>
                                    <div className="font-semibold text-muted-foreground mb-1.5">
                                        Visible Columns in this View
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {fields.map(f => {
                                            const checked = displayColumns.includes(f.apiName);
                                            return (
                                                <button
                                                    key={f.apiName}
                                                    type="button"
                                                    onClick={() => {
                                                        if (checked && displayColumns.length > 1) {
                                                            setActiveColumns(
                                                                displayColumns.filter(
                                                                    c => c !== f.apiName,
                                                                ),
                                                            );
                                                        } else if (!checked) {
                                                            setActiveColumns([
                                                                ...displayColumns,
                                                                f.apiName,
                                                            ]);
                                                        }
                                                    }}
                                                    className={`px-2 py-0.5 rounded border text-xs ${
                                                        checked
                                                            ? 'bg-primary text-primary-foreground border-primary'
                                                            : 'bg-card text-muted-foreground border-border'
                                                    }`}
                                                >
                                                    {f.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}

                        {showImportPanel && (
                            <div className="p-4 border-b border-border bg-muted/40 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wider text-foreground">
                                            Bulk CSV Import ({objectName})
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Expected headers:{' '}
                                            <code className="font-mono text-primary">
                                                {fields
                                                    .filter(
                                                        f =>
                                                            f.validationRules?.fieldSubType !==
                                                            'FORMULA',
                                                    )
                                                    .map(f => f.apiName)
                                                    .join(', ')}
                                            </code>
                                        </p>
                                    </div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={handleImportCsv}
                                        disabled={importingCsv}
                                        data-testid="run-csv-bulk-import"
                                    >
                                        {importingCsv ? 'Importing…' : 'Run Bulk Import'}
                                    </Button>
                                </div>
                                <textarea
                                    rows={4}
                                    value={csvInputText}
                                    onChange={e => setCsvInputText(e.target.value)}
                                    placeholder={`${fields
                                        .filter(f => f.validationRules?.fieldSubType !== 'FORMULA')
                                        .slice(0, 3)
                                        .map(f => f.apiName)
                                        .join(',')}\nSample Value 1,Sample Value 2,Sample Value 3`}
                                    className="w-full rounded-md border border-border bg-card p-2.5 font-mono text-xs text-foreground"
                                />
                            </div>
                        )}

                        {/* Saved List Views & Quick Field Filter Bar */}
                        <div
                            className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-muted/20 text-xs"
                            data-testid="saved-list-views-bar"
                        >
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-semibold text-muted-foreground mr-1">
                                    Saved Views:
                                </span>
                                <button
                                    type="button"
                                    onClick={() => handleSelectSavedView(null)}
                                    className={`rounded-full px-2.5 py-0.5 font-medium border transition-colors ${
                                        activeViewId === '__all__'
                                            ? 'bg-primary text-primary-foreground border-primary'
                                            : 'bg-card text-muted-foreground border-border hover:text-foreground'
                                    }`}
                                >
                                    All Records
                                </button>
                                {visibleDbViews.map(view => {
                                    const isActive = activeViewId === view.id;
                                    return (
                                        <span key={view.id} className="inline-flex items-center gap-0.5">
                                            <button
                                                type="button"
                                                onClick={() => handleSelectSavedView(view)}
                                                className={`rounded-full px-2.5 py-0.5 font-medium border transition-colors ${
                                                    isActive
                                                        ? 'bg-primary text-primary-foreground border-primary'
                                                        : 'bg-card text-muted-foreground border-border hover:text-foreground'
                                                }`}
                                            >
                                                {view.name}
                                                {view.categoryName ? ` (${view.categoryName})` : ''}
                                            </button>
                                            {isActive && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteActiveView(view.id)}
                                                    title="Delete saved view"
                                                    className="p-0.5 text-muted-foreground hover:text-destructive"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            )}
                                        </span>
                                    );
                                })}
                                {activeRules.length > 0 && (
                                    <Badge variant="outline" className="text-[10px]">
                                        {activeRules.length} saved filter(s)
                                    </Badge>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                                <select
                                    value={filterField}
                                    onChange={e => setFilterField(e.target.value)}
                                    aria-label="Filter field"
                                    className="h-7 rounded border border-border bg-card px-2 text-xs text-foreground"
                                >
                                    {fields.map(f => (
                                        <option key={f.apiName} value={f.apiName}>
                                            {f.label}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    value={filterOperator}
                                    onChange={e =>
                                        setFilterOperator(
                                            e.target.value as
                                                | 'ALL'
                                                | 'equals'
                                                | 'contains'
                                                | 'greater_than'
                                                | 'less_than',
                                        )
                                    }
                                    aria-label="Filter operator"
                                    className="h-7 rounded border border-border bg-card px-2 text-xs text-foreground"
                                >
                                    <option value="ALL">All Values</option>
                                    <option value="contains">Contains</option>
                                    <option value="equals">Equals</option>
                                    <option value="greater_than">&gt; Greater Than</option>
                                    <option value="less_than">&lt; Less Than</option>
                                </select>
                                {filterOperator !== 'ALL' && (
                                    <>
                                        <input
                                            type="text"
                                            value={filterValue}
                                            onChange={e => setFilterValue(e.target.value)}
                                            placeholder="Filter value..."
                                            className="h-7 w-28 rounded border border-border bg-card px-2 text-xs text-foreground"
                                        />
                                        <input
                                            type="text"
                                            value={newViewName}
                                            onChange={e => setNewViewName(e.target.value)}
                                            placeholder="Pin view as..."
                                            className="h-7 w-28 rounded border border-border bg-card px-2 text-xs text-foreground"
                                        />
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={handlePersistView}
                                            disabled={savingView}
                                            data-testid="pin-list-view-btn"
                                            className="h-7 px-2 text-xs"
                                        >
                                            Pin View
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>

                        {viewMode === 'TABLE' ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left text-muted-foreground">
                                    <thead className="text-xs text-foreground uppercase bg-muted border-b border-border">
                                        <tr>
                                            {displayColumns.map((col: string) => {
                                                const field = fields.find(f => f.apiName === col);
                                                return (
                                                    <th key={col} className="px-6 py-3 font-medium">
                                                        {field ? field.label : col}
                                                    </th>
                                                );
                                            })}
                                            <th className="px-6 py-3 font-medium text-right">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredRecords.length === 0 ? (
                                            <tr>
                                                <td
                                                    colSpan={displayColumns.length + 1}
                                                    className="px-6 py-8 text-center text-muted-foreground"
                                                >
                                                    No records found matching this view.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredRecords.map(record => (
                                                <tr
                                                    key={String(record.id)}
                                                    className="bg-card border-b border-border hover:bg-muted"
                                                >
                                                    {displayColumns.map((col: string) => (
                                                        <td key={col} className="px-6 py-4">
                                                            {renderCell(
                                                                fields.find(f => f.apiName === col),
                                                                record[col],
                                                            )}
                                                        </td>
                                                    ))}
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="inline-flex items-center gap-3">
                                                            <Link
                                                                href={`/app/${objectName}/${String(record.id)}`}
                                                                className="font-medium text-primary hover:underline"
                                                            >
                                                                Edit
                                                            </Link>
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    handleDeleteRecord(
                                                                        String(record.id),
                                                                    )
                                                                }
                                                                data-testid={`delete-record-${String(record.id)}`}
                                                                title="Delete record"
                                                                className="text-muted-foreground hover:text-destructive transition-colors"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            /* Drag-and-Drop Generic Kanban Board */
                            <div className="p-4 overflow-x-auto">
                                <div className="flex gap-4 min-w-max">
                                    {kanbanBuckets.map(bucket => {
                                        const bucketRecords = filteredRecords.filter(
                                            r =>
                                                String(r[groupByField] ?? '').toLowerCase() ===
                                                bucket.toLowerCase(),
                                        );
                                        const isOver = dragOverBucket === bucket;
                                        return (
                                            <div
                                                key={bucket}
                                                onDragOver={e => {
                                                    e.preventDefault();
                                                    setDragOverBucket(bucket);
                                                }}
                                                onDragLeave={() => setDragOverBucket(null)}
                                                onDrop={e => {
                                                    e.preventDefault();
                                                    const recId =
                                                        e.dataTransfer.getData('text/plain') ||
                                                        draggedRecordId;
                                                    setDragOverBucket(null);
                                                    setDraggedRecordId(null);
                                                    if (recId) {
                                                        handleDropOnBucket(recId, bucket);
                                                    }
                                                }}
                                                data-testid={`generic-kanban-col-${bucket}`}
                                                className={`w-72 rounded-xl border p-3 transition-colors ${
                                                    isOver
                                                        ? 'border-primary bg-accent/50'
                                                        : 'border-border bg-muted/40'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between mb-3">
                                                    <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                                                        {bucket}
                                                    </span>
                                                    <span className="rounded-full bg-card border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                                        {bucketRecords.length}
                                                    </span>
                                                </div>
                                                <div className="space-y-2.5">
                                                    {bucketRecords.length === 0 ? (
                                                        <div className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
                                                            Drop card here
                                                        </div>
                                                    ) : (
                                                        bucketRecords.map(rec => (
                                                            <div
                                                                key={String(rec.id)}
                                                                draggable
                                                                onDragStart={e => {
                                                                    e.dataTransfer.setData(
                                                                        'text/plain',
                                                                        String(rec.id),
                                                                    );
                                                                    setDraggedRecordId(
                                                                        String(rec.id),
                                                                    );
                                                                }}
                                                                onDragEnd={() => {
                                                                    setDraggedRecordId(null);
                                                                    setDragOverBucket(null);
                                                                }}
                                                                className="rounded-lg border border-border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing hover:border-primary"
                                                            >
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <Link
                                                                        href={`/app/${objectName}/${String(rec.id)}`}
                                                                        className="font-semibold text-sm text-foreground hover:text-primary truncate"
                                                                    >
                                                                        {String(
                                                                            rec[primaryTitleField] ||
                                                                                rec.id,
                                                                        )}
                                                                    </Link>
                                                                    <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                                                                </div>
                                                                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                                                                    {displayColumns
                                                                        .filter(
                                                                            c =>
                                                                                c !==
                                                                                    primaryTitleField &&
                                                                                c !== groupByField,
                                                                        )
                                                                        .slice(0, 3)
                                                                        .map(col => {
                                                                            const f = fields.find(
                                                                                item =>
                                                                                    item.apiName ===
                                                                                    col,
                                                                            );
                                                                            return (
                                                                                <div
                                                                                    key={col}
                                                                                    className="flex justify-between gap-2 truncate"
                                                                                >
                                                                                    <span>
                                                                                        {f?.label ??
                                                                                            col}
                                                                                        :
                                                                                    </span>
                                                                                    <span className="font-medium text-foreground truncate">
                                                                                        {renderCell(
                                                                                            f,
                                                                                            rec[col],
                                                                                        )}
                                                                                    </span>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                </div>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
