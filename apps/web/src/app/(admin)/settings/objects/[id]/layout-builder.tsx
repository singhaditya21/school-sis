'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    MetadataField,
    MetadataLayout,
    saveObjectLayout,
} from '@/lib/actions/metadata-engine';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GripVertical, Plus, Save, Trash2, Columns, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';

type SectionVisibilityRule = {
    field?: string;
    operator?: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'not_empty';
    value?: string;
};

type FormSection = {
    title: string;
    fields: string[];
    visibilityRule?: SectionVisibilityRule;
};

export default function ObjectLayoutBuilderClient({
    objectId,
    objectName,
    fields,
    initialLayouts,
}: {
    objectId: string;
    objectName: string;
    fields: MetadataField[];
    initialLayouts: MetadataLayout[];
}) {
    const router = useRouter();
    const selectableFields = fields.filter(
        f => f.apiName !== 'id' && f.apiName !== 'tenant_id',
    );

    const existingForm = initialLayouts.find(l => l.layoutType === 'FORM')?.schema as
        | { sections?: FormSection[] }
        | undefined;
    const existingList = initialLayouts.find(l => l.layoutType === 'LIST')?.schema as
        | { columns?: string[] }
        | undefined;

    const initialSections: FormSection[] =
        Array.isArray(existingForm?.sections) && existingForm.sections.length > 0
            ? existingForm.sections.map(sec => ({
                  title: sec.title || 'General Information',
                  fields: Array.isArray(sec.fields) ? [...sec.fields] : [],
                  visibilityRule: sec.visibilityRule,
              }))
            : [
                  {
                      title: `${objectName} Details`,
                      fields: selectableFields.map(f => f.apiName),
                  },
              ];

    const initialColumns: string[] =
        Array.isArray(existingList?.columns) && existingList.columns.length > 0
            ? [...existingList.columns]
            : selectableFields.slice(0, 5).map(f => f.apiName);

    const [activeTab, setActiveTab] = useState<'FORM' | 'LIST'>('FORM');
    const [sections, setSections] = useState<FormSection[]>(initialSections);
    const [listColumns, setListColumns] = useState<string[]>(initialColumns);
    const [draggedField, setDraggedField] = useState<string | null>(null);
    const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const assignedFormFields = new Set(sections.flatMap(s => s.fields));
    const unassignedFormFields = selectableFields.filter(
        f => !assignedFormFields.has(f.apiName),
    );

    const assignedListFields = new Set(listColumns);
    const unassignedListFields = selectableFields.filter(
        f => !assignedListFields.has(f.apiName),
    );

    const fieldLabel = (apiName: string) =>
        selectableFields.find(f => f.apiName === apiName)?.label || apiName;
    const fieldType = (apiName: string) =>
        selectableFields.find(f => f.apiName === apiName)?.dataType || 'TEXT';

    // Form Layout Drag & Drop Handlers
    const handleDropOnSection = (sectionIndex: number, targetIndex?: number) => {
        if (!draggedField) return;
        setSections(prev => {
            const cleaned = prev.map(sec => ({
                ...sec,
                fields: sec.fields.filter(f => f !== draggedField),
            }));
            const target = cleaned[sectionIndex];
            if (!target) return prev;
            const nextFields = [...target.fields];
            if (typeof targetIndex === 'number' && targetIndex >= 0) {
                nextFields.splice(targetIndex, 0, draggedField);
            } else {
                nextFields.push(draggedField);
            }
            cleaned[sectionIndex] = { ...target, fields: nextFields };
            return cleaned;
        });
        setDraggedField(null);
        setDragOverTarget(null);
    };

    const handleDropOnUnassignedForm = () => {
        if (!draggedField) return;
        setSections(prev =>
            prev.map(sec => ({
                ...sec,
                fields: sec.fields.filter(f => f !== draggedField),
            })),
        );
        setDraggedField(null);
        setDragOverTarget(null);
    };

    const handleAddSection = () => {
        setSections(prev => [
            ...prev,
            { title: `Section ${prev.length + 1}`, fields: [] },
        ]);
    };

    const handleRemoveSection = (index: number) => {
        if (sections.length <= 1) {
            toast.error('A form layout must have at least one section.');
            return;
        }
        setSections(prev => prev.filter((_, i) => i !== index));
    };

    // List Layout Drag & Drop Handlers
    const handleDropOnListColumns = (targetIndex?: number) => {
        if (!draggedField) return;
        setListColumns(prev => {
            const filtered = prev.filter(c => c !== draggedField);
            if (typeof targetIndex === 'number' && targetIndex >= 0) {
                filtered.splice(targetIndex, 0, draggedField);
            } else {
                filtered.push(draggedField);
            }
            return filtered;
        });
        setDraggedField(null);
        setDragOverTarget(null);
    };

    const handleDropOnUnassignedList = () => {
        if (!draggedField) return;
        setListColumns(prev => prev.filter(c => c !== draggedField));
        setDraggedField(null);
        setDragOverTarget(null);
    };

    const handleSaveLayout = async () => {
        setSaving(true);
        try {
            const schema =
                activeTab === 'FORM'
                    ? { sections }
                    : { columns: listColumns };
            const res = await saveObjectLayout(objectId, activeTab, schema);
            if (!res.success) {
                toast.error(res.error || 'Failed to save layout.');
                return;
            }
            toast.success(
                `${activeTab === 'FORM' ? 'Form' : 'List'} layout published.`,
            );
            if (res.objectId && res.objectId !== objectId) {
                router.replace(`/settings/objects/${res.objectId}`);
            } else {
                router.refresh();
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card data-testid="layout-builder-card">
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
                <div>
                    <CardTitle className="flex items-center gap-2">
                        <LayoutGrid className="w-5 h-5 text-primary" />
                        Drag-and-Drop Page &amp; List Layout Designer
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                        Drag fields between the palette and canvas sections to customize how{' '}
                        <span className="font-medium text-foreground">{objectName}</span> forms and tables render across the platform.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-lg border border-border bg-muted p-1">
                        <button
                            type="button"
                            onClick={() => setActiveTab('FORM')}
                            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                activeTab === 'FORM'
                                    ? 'bg-card text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <LayoutGrid className="w-3.5 h-3.5" /> Form Canvas
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('LIST')}
                            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                activeTab === 'LIST'
                                    ? 'bg-card text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <Columns className="w-3.5 h-3.5" /> List Columns
                        </button>
                    </div>
                    <Button
                        size="sm"
                        onClick={handleSaveLayout}
                        disabled={saving}
                        data-testid="save-layout-btn"
                    >
                        <Save className="w-4 h-4 mr-1.5" />
                        {saving ? 'Saving…' : `Save ${activeTab === 'FORM' ? 'Form' : 'List'} Layout`}
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="pt-6">
                {activeTab === 'FORM' ? (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Left Palette: Unassigned Fields */}
                        <div
                            onDragOver={e => {
                                e.preventDefault();
                                setDragOverTarget('unassigned-form');
                            }}
                            onDragLeave={() => setDragOverTarget(null)}
                            onDrop={handleDropOnUnassignedForm}
                            data-testid="palette-unassigned-fields"
                            className={`rounded-xl border-2 border-dashed p-4 transition-colors ${
                                dragOverTarget === 'unassigned-form'
                                    ? 'border-primary bg-accent/50'
                                    : 'border-border bg-muted/40'
                            }`}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Field Palette ({unassignedFormFields.length} unassigned)
                                </h3>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleAddSection}
                                    data-testid="add-layout-section-btn"
                                >
                                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Section
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground mb-4">
                                Drag fields onto any section on the right, or drag fields back here to hide them from the form.
                            </p>
                            <div className="space-y-2">
                                {unassignedFormFields.length === 0 ? (
                                    <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                                        All fields are placed on the form canvas.
                                    </div>
                                ) : (
                                    unassignedFormFields.map(field => (
                                        <div
                                            key={field.apiName}
                                            draggable
                                            onDragStart={() => setDraggedField(field.apiName)}
                                            onDragEnd={() => {
                                                setDraggedField(null);
                                                setDragOverTarget(null);
                                            }}
                                            data-testid={`draggable-field-${field.apiName}`}
                                            className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm cursor-grab active:cursor-grabbing hover:border-primary"
                                        >
                                            <div className="flex items-center gap-2">
                                                <GripVertical className="w-4 h-4 text-muted-foreground" />
                                                <span className="font-medium text-foreground">{field.label}</span>
                                            </div>
                                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                                {field.dataType}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Right Canvas: Form Sections */}
                        <div className="lg:col-span-2 space-y-4">
                            {sections.map((section, sectionIdx) => (
                                <div
                                    key={sectionIdx}
                                    onDragOver={e => {
                                        e.preventDefault();
                                        setDragOverTarget(`section-${sectionIdx}`);
                                    }}
                                    onDragLeave={() => setDragOverTarget(null)}
                                    onDrop={() => handleDropOnSection(sectionIdx)}
                                    data-testid={`form-section-${sectionIdx}`}
                                    className={`rounded-xl border-2 p-4 transition-colors ${
                                        dragOverTarget === `section-${sectionIdx}`
                                            ? 'border-primary bg-accent/30'
                                            : 'border-border bg-card'
                                    }`}
                                >
                                    <div className="flex flex-col gap-2 mb-4 pb-3 border-b border-border">
                                        <div className="flex items-center justify-between gap-3">
                                            <Input
                                                value={section.title}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    setSections(prev =>
                                                        prev.map((s, idx) =>
                                                            idx === sectionIdx
                                                                ? { ...s, title: val }
                                                                : s,
                                                        ),
                                                    );
                                                }}
                                                className="h-8 max-w-xs font-semibold text-sm"
                                                aria-label={`Section ${sectionIdx + 1} title`}
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRemoveSection(sectionIdx)}
                                                className="text-muted-foreground hover:text-destructive"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                        <div
                                            className="flex flex-wrap items-center gap-2 text-xs"
                                            data-testid={`section-visibility-rule-${sectionIdx}`}
                                        >
                                            <span className="text-[11px] font-medium text-muted-foreground">
                                                Dynamic Form Visibility:
                                            </span>
                                            <select
                                                value={section.visibilityRule?.field || ''}
                                                onChange={e => {
                                                    const field = e.target.value;
                                                    setSections(prev =>
                                                        prev.map((s, idx) =>
                                                            idx === sectionIdx
                                                                ? {
                                                                      ...s,
                                                                      visibilityRule: field
                                                                          ? {
                                                                                field,
                                                                                operator:
                                                                                    s.visibilityRule
                                                                                        ?.operator ||
                                                                                    'equals',
                                                                                value:
                                                                                    s.visibilityRule
                                                                                        ?.value || '',
                                                                            }
                                                                          : undefined,
                                                                  }
                                                                : s,
                                                        ),
                                                    );
                                                }}
                                                className="h-7 rounded border border-border bg-card px-2 text-xs text-foreground"
                                            >
                                                <option value="">Always Visible</option>
                                                {selectableFields.map(f => (
                                                    <option key={f.apiName} value={f.apiName}>
                                                        Show when {f.label}
                                                    </option>
                                                ))}
                                            </select>
                                            {section.visibilityRule?.field && (
                                                <>
                                                    <select
                                                        value={
                                                            section.visibilityRule.operator ||
                                                            'equals'
                                                        }
                                                        onChange={e => {
                                                            const operator = e.target
                                                                .value as SectionVisibilityRule['operator'];
                                                            setSections(prev =>
                                                                prev.map((s, idx) =>
                                                                    idx === sectionIdx
                                                                        ? {
                                                                              ...s,
                                                                              visibilityRule: {
                                                                                  ...s.visibilityRule,
                                                                                  operator,
                                                                              },
                                                                          }
                                                                        : s,
                                                                ),
                                                            );
                                                        }}
                                                        className="h-7 rounded border border-border bg-card px-2 text-xs text-foreground"
                                                    >
                                                        <option value="equals">Equals</option>
                                                        <option value="not_equals">
                                                            Not Equals
                                                        </option>
                                                        <option value="greater_than">
                                                            &gt; Greater Than
                                                        </option>
                                                        <option value="not_empty">
                                                            Is Not Empty
                                                        </option>
                                                    </select>
                                                    {section.visibilityRule.operator !==
                                                        'not_empty' && (
                                                        <Input
                                                            value={
                                                                section.visibilityRule.value || ''
                                                            }
                                                            onChange={e => {
                                                                const value = e.target.value;
                                                                setSections(prev =>
                                                                    prev.map((s, idx) =>
                                                                        idx === sectionIdx
                                                                            ? {
                                                                                  ...s,
                                                                                  visibilityRule: {
                                                                                      ...s.visibilityRule,
                                                                                      value,
                                                                                  },
                                                                              }
                                                                            : s,
                                                                    ),
                                                                );
                                                            }}
                                                            placeholder="Expected value..."
                                                            className="h-7 w-36 text-xs"
                                                        />
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {section.fields.length === 0 ? (
                                        <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                                            Drop fields here to include them in &ldquo;{section.title}&rdquo;
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {section.fields.map((apiName, fieldIdx) => (
                                                <div
                                                    key={apiName}
                                                    draggable
                                                    onDragStart={() => setDraggedField(apiName)}
                                                    onDragOver={e => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                    }}
                                                    onDrop={e => {
                                                        e.stopPropagation();
                                                        handleDropOnSection(sectionIdx, fieldIdx);
                                                    }}
                                                    onDragEnd={() => {
                                                        setDraggedField(null);
                                                        setDragOverTarget(null);
                                                    }}
                                                    data-testid={`canvas-field-${apiName}`}
                                                    className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm cursor-grab active:cursor-grabbing hover:border-primary transition-colors"
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <GripVertical className="w-4 h-4 shrink-0 text-muted-foreground" />
                                                        <div className="truncate">
                                                            <div className="font-medium text-foreground truncate">
                                                                {fieldLabel(apiName)}
                                                            </div>
                                                            <div className="text-[11px] font-mono text-muted-foreground">
                                                                {apiName}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-card border border-border text-muted-foreground shrink-0">
                                                        {fieldType(apiName)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    /* LIST Columns Drag-and-Drop Designer */
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div
                            onDragOver={e => {
                                e.preventDefault();
                                setDragOverTarget('unassigned-list');
                            }}
                            onDragLeave={() => setDragOverTarget(null)}
                            onDrop={handleDropOnUnassignedList}
                            className={`rounded-xl border-2 border-dashed p-4 transition-colors ${
                                dragOverTarget === 'unassigned-list'
                                    ? 'border-primary bg-accent/50'
                                    : 'border-border bg-muted/40'
                            }`}
                        >
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                                Available Columns ({unassignedListFields.length})
                            </h3>
                            <p className="text-xs text-muted-foreground mb-4">
                                Drag fields to the right to show them as columns in the table view.
                            </p>
                            <div className="space-y-2">
                                {unassignedListFields.map(field => (
                                    <div
                                        key={field.apiName}
                                        draggable
                                        onDragStart={() => setDraggedField(field.apiName)}
                                        onDragEnd={() => {
                                            setDraggedField(null);
                                            setDragOverTarget(null);
                                        }}
                                        className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm cursor-grab active:cursor-grabbing hover:border-primary"
                                    >
                                        <div className="flex items-center gap-2">
                                            <GripVertical className="w-4 h-4 text-muted-foreground" />
                                            <span className="font-medium text-foreground">{field.label}</span>
                                        </div>
                                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                            {field.dataType}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div
                            onDragOver={e => {
                                e.preventDefault();
                                setDragOverTarget('active-list');
                            }}
                            onDragLeave={() => setDragOverTarget(null)}
                            onDrop={() => handleDropOnListColumns()}
                            className={`lg:col-span-2 rounded-xl border-2 p-4 transition-colors ${
                                dragOverTarget === 'active-list'
                                    ? 'border-primary bg-accent/30'
                                    : 'border-border bg-card'
                            }`}
                        >
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                                Active Table Columns (Drag to Reorder)
                            </h3>
                            {listColumns.length === 0 ? (
                                <div className="py-10 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                                    Drop fields here to configure visible table columns.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {listColumns.map((apiName, colIdx) => (
                                        <div
                                            key={apiName}
                                            draggable
                                            onDragStart={() => setDraggedField(apiName)}
                                            onDragOver={e => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                            }}
                                            onDrop={e => {
                                                e.stopPropagation();
                                                handleDropOnListColumns(colIdx);
                                            }}
                                            onDragEnd={() => {
                                                setDraggedField(null);
                                                setDragOverTarget(null);
                                            }}
                                            className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm cursor-grab active:cursor-grabbing hover:border-primary"
                                        >
                                            <div className="flex items-center gap-3">
                                                <GripVertical className="w-4 h-4 text-muted-foreground" />
                                                <span className="text-xs font-mono text-muted-foreground">
                                                    #{colIdx + 1}
                                                </span>
                                                <span className="font-medium text-foreground">
                                                    {fieldLabel(apiName)}
                                                </span>
                                                <span className="text-xs font-mono text-muted-foreground">
                                                    ({apiName})
                                                </span>
                                            </div>
                                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-card border border-border text-muted-foreground">
                                                {fieldType(apiName)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
