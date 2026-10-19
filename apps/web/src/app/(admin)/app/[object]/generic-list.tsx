'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MetadataField, updateRecordFieldValue } from '@/lib/actions/metadata-engine';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/format';
import { GripVertical, Kanban, Plus, Table as TableIcon } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

/**
 * Renders a value using the field's declared data type, so a metadata-defined
 * module formats money, dates and booleans the same way a hand-built one does.
 */
function renderCell(field: MetadataField | undefined, value: unknown): string {
    if (value == null || value === '') return '-';
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

                    <Link href={`/app/${objectName}/new`}>
                        <Button>
                            <Plus className="w-4 h-4 mr-2" /> New Record
                        </Button>
                    </Link>
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
                                {localRecords.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={displayColumns.length + 1}
                                            className="px-6 py-8 text-center text-muted-foreground"
                                        >
                                            No records found.
                                        </td>
                                    </tr>
                                ) : (
                                    localRecords.map(record => (
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
                                                <Link
                                                    href={`/app/${objectName}/${String(record.id)}`}
                                                    className="font-medium text-primary hover:underline"
                                                >
                                                    Edit
                                                </Link>
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
                                const bucketRecords = localRecords.filter(
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
