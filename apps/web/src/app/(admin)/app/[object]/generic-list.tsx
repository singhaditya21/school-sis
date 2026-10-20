'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
    MetadataField,
    bulkImportRecords,
    deleteRecord,
    updateRecordFieldValue,
} from '@/lib/actions/metadata-engine';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/format';
import {
    Download,
    GripVertical,
    Kanban,
    Plus,
    Table as TableIcon,
    Trash2,
    Upload,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

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

/**
 * Renders a value using the field's declared data type, so a metadata-defined
 * module formats money, dates and booleans the same way a hand-built one does.
 */
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
    objectName,
    fields,
    records,
    layout,
}: {
    objectName: string;
    fields: MetadataField[];
    records: Record<string, unknown>[];
    layout?: { columns?: string[] };
}) {
    const router = useRouter();
    const [, startTransition] = useTransition();
    const [localRecords, setLocalRecords] = useState<Record<string, unknown>[]>(records);

    // Prefer the configured LIST layout, but never show a column the caller is
    // not allowed to read: `fields` has already been filtered by role.
    const readableNames = new Set(fields.map(f => f.apiName));
    const layoutColumns: string[] = Array.isArray(layout?.columns) ? layout.columns : [];
    const configured = layoutColumns.filter(col => readableNames.has(col));
    const displayColumns =
        configured.length > 0 ? configured : fields.slice(0, 5).map(f => f.apiName);

    // Determine whether this object supports a Drag-and-Drop Kanban board view
    const kanbanFields = fields.filter(
        f =>
            (f.dataType === 'PICKLIST' && f.picklistOptions?.length > 0) ||
            ['status', 'stage', 'category', 'gender'].includes(f.apiName),
    );
    const [viewMode, setViewMode] = useState<'TABLE' | 'KANBAN'>('TABLE');
    const [groupByField, setGroupByField] = useState<string>(
        kanbanFields[0]?.apiName || '',
    );
    const [draggedRecordId, setDraggedRecordId] = useState<string | null>(null);
    const [dragOverBucket, setDragOverBucket] = useState<string | null>(null);

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

    const [showImportPanel, setShowImportPanel] = useState(false);
    const [csvInputText, setCsvInputText] = useState('');
    const [importingCsv, setImportingCsv] = useState(false);

    // Saved List Views & Field Filter Bar (Salesforce Lightning List Views)
    const [filterField, setFilterField] = useState<string>(fields[0]?.apiName || '');
    const [filterOperator, setFilterOperator] = useState<
        'ALL' | 'equals' | 'contains' | 'greater_than' | 'less_than'
    >('ALL');
    const [filterValue, setFilterValue] = useState<string>('');
    const [newViewName, setNewViewName] = useState<string>('');
    const [savedViews, setSavedViews] = useState<
        Array<{
            name: string;
            field: string;
            operator: 'ALL' | 'equals' | 'contains' | 'greater_than' | 'less_than';
            value: string;
        }>
    >([{ name: 'All Records', field: '', operator: 'ALL', value: '' }]);

    const filteredRecords = localRecords.filter(rec => {
        if (filterOperator === 'ALL' || !filterField || !filterValue.trim()) return true;
        const raw = rec[filterField];
        const actualStr = raw == null ? '' : String(raw).toLowerCase();
        const expectedStr = filterValue.trim().toLowerCase();
        switch (filterOperator) {
            case 'equals':
                return actualStr === expectedStr;
            case 'contains':
                return actualStr.includes(expectedStr);
            case 'greater_than':
                return Number(raw) > Number(filterValue);
            case 'less_than':
                return Number(raw) < Number(filterValue);
            default:
                return true;
        }
    });

    const handleSaveListView = () => {
        const trimmed = newViewName.trim();
        if (!trimmed) {
            toast.error('Enter a name for this List View.');
            return;
        }
        setSavedViews(prev => [
            ...prev.filter(v => v.name !== trimmed),
            { name: trimmed, field: filterField, operator: filterOperator, value: filterValue },
        ]);
        setNewViewName('');
        toast.success(`Saved List View "${trimmed}"`);
    };

    const handleExportCsv = () => {
        const exportCols = displayColumns.length > 0 ? displayColumns : fields.map(f => f.apiName);
        const escapeCell = (val: unknown): string => {
            const raw = val == null ? '' : String(val);
            if (/[",\r\n]/.test(raw)) {
                return `"${raw.replace(/"/g, '""')}"`;
            }
            return raw;
        };
        const headerLine = exportCols.map(escapeCell).join(',');
        const bodyLines = localRecords.map(rec =>
            exportCols.map(col => escapeCell(rec[col])).join(','),
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
        toast.success(`Exported ${localRecords.length} record(s) to CSV.`);
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

    return (
        <Card>
            <CardContent className="p-0">
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-border">
                    <div className="flex items-center gap-2">
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
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
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
                                            .filter(f => f.validationRules?.fieldSubType !== 'FORMULA')
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

                {/* Saved List Views & Field Filter Bar */}
                <div
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-muted/20 text-xs"
                    data-testid="saved-list-views-bar"
                >
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-muted-foreground mr-1">
                            List Views:
                        </span>
                        {savedViews.map(view => {
                            const isActive =
                                view.operator === filterOperator &&
                                view.field === filterField &&
                                view.value === filterValue;
                            return (
                                <button
                                    key={view.name}
                                    type="button"
                                    onClick={() => {
                                        setFilterField(view.field || fields[0]?.apiName || '');
                                        setFilterOperator(view.operator);
                                        setFilterValue(view.value);
                                    }}
                                    className={`rounded-full px-2.5 py-0.5 font-medium border transition-colors ${
                                        isActive
                                            ? 'bg-primary text-primary-foreground border-primary'
                                            : 'bg-card text-muted-foreground border-border hover:text-foreground'
                                    }`}
                                >
                                    {view.name}
                                </button>
                            );
                        })}
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
                                    onClick={handleSaveListView}
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
                                    <th className="px-6 py-3 font-medium text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRecords.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={displayColumns.length + 1}
                                            className="px-6 py-8 text-center text-muted-foreground"
                                        >
                                            No records found.
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
                                                            handleDeleteRecord(String(record.id))
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
                                                            setDraggedRecordId(String(rec.id));
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
                                                                        c !== primaryTitleField &&
                                                                        c !== groupByField,
                                                                )
                                                                .slice(0, 3)
                                                                .map(col => {
                                                                    const f = fields.find(
                                                                        item =>
                                                                            item.apiName === col,
                                                                    );
                                                                    return (
                                                                        <div
                                                                            key={col}
                                                                            className="flex justify-between gap-2 truncate"
                                                                        >
                                                                            <span>
                                                                                {f?.label ?? col}:
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
    );
}
