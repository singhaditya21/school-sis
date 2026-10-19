'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    Database,
    Columns,
    Filter,
    GripHorizontal,
    Plus,
    Save,
    ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import {
    saveObjectLayout,
    updateRecordFieldValue,
} from '@/lib/actions/metadata-engine';

export type StudioObject = {
    id: string;
    name: string;
    label: string;
};

export type StudioField = {
    id: string;
    name: string;
    label: string;
    type: string;
};

export default function DataStudioClient({
    objects,
    activeObject,
    initialFields,
    initialRecords,
}: {
    objects: StudioObject[];
    activeObject: StudioObject | null;
    initialFields: StudioField[];
    initialRecords: Record<string, unknown>[];
}) {
    const router = useRouter();
    const [, startTransition] = useTransition();
    const [fields, setFields] = useState<StudioField[]>(initialFields);
    const [records, setRecords] = useState<Record<string, unknown>[]>(initialRecords);
    const [filterText, setFilterText] = useState('');
    const [showFilterBar, setShowFilterBar] = useState(false);
    const [draggedColIdx, setDraggedColIdx] = useState<number | null>(null);
    const [savingLayout, setSavingLayout] = useState(false);

    const visibleRecords = filterText.trim()
        ? records.filter(rec =>
              fields.some(f =>
                  String(rec[f.name] ?? '')
                      .toLowerCase()
                      .includes(filterText.trim().toLowerCase()),
              ),
          )
        : records;

    const handleColumnDrop = (targetIdx: number) => {
        if (draggedColIdx === null || draggedColIdx === targetIdx) return;
        setFields(prev => {
            const copy = [...prev];
            const [moved] = copy.splice(draggedColIdx, 1);
            copy.splice(targetIdx, 0, moved);
            return copy;
        });
        setDraggedColIdx(null);
    };

    const handlePersistColumnOrder = async () => {
        if (!activeObject) return;
        setSavingLayout(true);
        try {
            const res = await saveObjectLayout(activeObject.id, 'LIST', {
                columns: fields.map(f => f.name),
            });
            if (res.success) {
                toast.success('Column order saved to object LIST layout.');
                router.refresh();
            } else {
                toast.error(res.error || 'Could not save column layout.');
            }
        } finally {
            setSavingLayout(false);
        }
    };

    const handleInlineCellCommit = (
        recordId: string,
        fieldName: string,
        nextValue: string,
    ) => {
        if (!activeObject) return;
        const current = records.find(r => String(r.id) === recordId);
        if (!current || String(current[fieldName] ?? '') === nextValue) return;

        const prevVal = current[fieldName];
        setRecords(prev =>
            prev.map(r =>
                String(r.id) === recordId ? { ...r, [fieldName]: nextValue } : r,
            ),
        );

        startTransition(async () => {
            const res = await updateRecordFieldValue(
                activeObject.name,
                recordId,
                fieldName,
                nextValue,
            );
            if (res.success) {
                toast.success(`Saved ${fieldName}`);
            } else {
                setRecords(prev =>
                    prev.map(r =>
                        String(r.id) === recordId ? { ...r, [fieldName]: prevVal } : r,
                    ),
                );
                toast.error(res.error || 'Failed to update cell');
            }
        });
    };

    return (
        <div className="flex flex-col h-[calc(100vh-8rem)]">
            {/* Header & Actions */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Database className="w-6 h-6 text-primary" />
                        No-Code Metadata Engine
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Build and manage custom data structures, inline records, and drag-and-drop column layouts.
                    </p>
                </div>
                <div className="flex gap-3">
                    <Link
                        href="/settings/objects"
                        className="text-muted-foreground hover:text-foreground bg-card border border-border px-4 py-2 rounded-lg font-medium transition-colors shadow-sm text-sm"
                    >
                        Create Object
                    </Link>
                    <button
                        type="button"
                        onClick={handlePersistColumnOrder}
                        disabled={!activeObject || savingLayout}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg font-medium flex items-center transition-colors shadow-sm text-sm disabled:opacity-50"
                    >
                        <Save className="w-4 h-4 mr-2" />
                        {savingLayout ? 'Saving Layout…' : 'Save Column Order'}
                    </button>
                </div>
            </div>

            {/* Airtable-like Container */}
            <div className="bg-card rounded-xl border border-border shadow-sm flex flex-col flex-1 overflow-hidden">
                {/* Object Tabs */}
                <div className="flex border-b border-border bg-muted overflow-x-auto">
                    {objects.length === 0 ? (
                        <div className="px-6 py-3 text-sm text-muted-foreground font-medium">
                            No objects created yet.
                        </div>
                    ) : (
                        objects.map(obj => {
                            const isActive = activeObject?.id === obj.id;
                            return (
                                <Link
                                    key={obj.id}
                                    href={`/data?object=${encodeURIComponent(obj.name)}`}
                                    className={`px-6 py-3 text-sm font-medium border-r border-border transition-colors ${
                                        isActive
                                            ? 'bg-card text-primary border-b-2 border-b-primary'
                                            : 'text-muted-foreground hover:bg-muted'
                                    }`}
                                >
                                    {obj.label}
                                </Link>
                            );
                        })
                    )}
                    <Link
                        href="/settings/objects"
                        title="Manage Objects"
                        className="px-4 py-3 text-muted-foreground hover:text-foreground hover:bg-muted flex items-center transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                    </Link>
                </div>

                {/* Toolbar */}
                <div className="p-2 border-b border-border flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setShowFilterBar(v => !v)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded hover:bg-muted transition-colors"
                        >
                            <Filter className="w-4 h-4" /> Filter
                        </button>
                        {activeObject && (
                            <Link
                                href={`/settings/objects/${activeObject.id}`}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded hover:bg-muted transition-colors"
                            >
                                <Columns className="w-4 h-4" /> Fields &amp; Layout Builder
                            </Link>
                        )}
                        <div className="h-4 w-px bg-border mx-2"></div>
                        <span className="text-muted-foreground">
                            {visibleRecords.length} records
                        </span>
                    </div>

                    {activeObject && (
                        <Link
                            href={`/app/${activeObject.name}`}
                            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline px-3"
                        >
                            Open Kanban &amp; Runtime View <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                    )}
                </div>

                {showFilterBar && (
                    <div className="px-4 py-2 border-b border-border bg-muted/40">
                        <input
                            type="search"
                            value={filterText}
                            onChange={e => setFilterText(e.target.value)}
                            placeholder="Filter records across all columns…"
                            className="w-full max-w-sm rounded-md border border-border bg-card px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                        />
                    </div>
                )}

                {/* Grid Area with Drag-and-Drop Column Headers */}
                <div className="flex-1 overflow-auto bg-card">
                    <table className="w-full text-left border-collapse whitespace-nowrap">
                        <thead className="sticky top-0 bg-muted z-10 border-b border-border">
                            <tr>
                                <th className="w-12 border-r border-border px-4 py-2 text-center text-xs text-muted-foreground">
                                    #
                                </th>
                                {fields.map((f, colIdx) => (
                                    <th
                                        key={f.id}
                                        draggable
                                        onDragStart={() => setDraggedColIdx(colIdx)}
                                        onDragOver={e => e.preventDefault()}
                                        onDrop={() => handleColumnDrop(colIdx)}
                                        onDragEnd={() => setDraggedColIdx(null)}
                                        title="Drag column header to reorder"
                                        className="border-r border-border px-4 py-2 text-xs font-semibold text-muted-foreground tracking-wide uppercase group cursor-grab active:cursor-grabbing hover:bg-accent/40"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span>{f.label}</span>
                                            <GripHorizontal className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100" />
                                        </div>
                                    </th>
                                ))}
                                <th className="px-4 py-2 min-w-[200px]">
                                    {activeObject && (
                                        <Link
                                            href={`/settings/objects/${activeObject.id}`}
                                            className="text-primary hover:underline flex items-center gap-1 text-xs font-semibold uppercase"
                                        >
                                            <Plus className="w-4 h-4" /> Add Field
                                        </Link>
                                    )}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="text-sm">
                            {visibleRecords.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={fields.length + 2}
                                        className="px-6 py-12 text-center text-muted-foreground"
                                    >
                                        No data in this object. Click &ldquo;Add new record...&rdquo; below to start.
                                    </td>
                                </tr>
                            ) : (
                                visibleRecords.map((rec, idx) => (
                                    <tr
                                        key={String(rec.id)}
                                        className="border-b border-border hover:bg-muted/50 group"
                                    >
                                        <td className="border-r border-border px-4 py-2 text-center text-muted-foreground/50 group-hover:text-muted-foreground">
                                            {idx + 1}
                                        </td>
                                        {fields.map(f => (
                                            <td key={f.id} className="border-r border-border p-0">
                                                <input
                                                    type="text"
                                                    defaultValue={String(rec[f.name] ?? '')}
                                                    onBlur={e =>
                                                        handleInlineCellCommit(
                                                            String(rec.id),
                                                            f.name,
                                                            e.target.value,
                                                        )
                                                    }
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') {
                                                            (e.target as HTMLInputElement).blur();
                                                        }
                                                    }}
                                                    className="w-full h-full min-h-[38px] px-4 py-2 bg-transparent focus:bg-card focus:ring-2 focus:ring-ring outline-none transition-all"
                                                    placeholder="Empty"
                                                />
                                            </td>
                                        ))}
                                        <td></td>
                                    </tr>
                                ))
                            )}
                            {/* Ghost Row for adding new records */}
                            {activeObject && (
                                <tr className="border-b border-border">
                                    <td className="border-r border-border px-4 py-2 text-center text-muted-foreground/50 font-bold">
                                        +
                                    </td>
                                    <td
                                        colSpan={fields.length + 1}
                                        className="p-0"
                                    >
                                        <Link
                                            href={`/app/${activeObject.name}/new`}
                                            className="block px-4 py-2 text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                                        >
                                            Add new record...
                                        </Link>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
