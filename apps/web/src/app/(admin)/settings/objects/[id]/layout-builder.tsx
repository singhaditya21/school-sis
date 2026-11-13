'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    MetadataField,
    MetadataLayout,
    saveObjectLayout,
} from '@/lib/actions/metadata-engine';
import { deleteNamedObjectLayoutAction } from '@/lib/actions/lcnc-platform';
import type { HomeKpiCardConfig, HomeLayoutSchema } from '@/lib/metadata/lcnc-helpers';
import type { RollupAggregateFunction } from '@/lib/metadata/platform';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    GripVertical,
    Plus,
    Save,
    Trash2,
    Columns,
    LayoutGrid,
    Sparkles,
    Shield,
} from 'lucide-react';
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

const BUILT_IN_ASSIGNABLE_ROLES: { code: string; name: string }[] = [
    { code: 'SCHOOL_ADMIN', name: 'School Admin' },
    { code: 'PRINCIPAL', name: 'Principal' },
    { code: 'REGISTRAR', name: 'Registrar' },
    { code: 'FINANCE_LEAD', name: 'Finance Lead' },
    { code: 'ACCOUNTANT', name: 'Accountant' },
    { code: 'ADMISSION_COUNSELOR', name: 'Admission Counselor' },
    { code: 'STUDENT_SUCCESS_COUNSELOR', name: 'Student Success Counselor' },
    { code: 'TEACHER', name: 'Teacher' },
    { code: 'TRANSPORT_MANAGER', name: 'Transport Manager' },
    { code: 'TRUST_OFFICER', name: 'Trust Officer' },
    { code: 'CREDENTIAL_OFFICER', name: 'Credential Officer' },
    { code: 'PARENT', name: 'Parent (Portal)' },
    { code: 'STUDENT', name: 'Student (Portal)' },
];

function extractSectionsFromLayout(
    layout: MetadataLayout | undefined,
    objectName: string,
    selectableFields: MetadataField[],
): FormSection[] {
    const raw = layout?.schema as { sections?: FormSection[] } | undefined;
    if (Array.isArray(raw?.sections) && raw.sections.length > 0) {
        return raw.sections.map(sec => ({
            title: sec.title || 'General Information',
            fields: Array.isArray(sec.fields) ? [...sec.fields] : [],
            visibilityRule: sec.visibilityRule,
        }));
    }
    return [
        {
            title: `${objectName} Details`,
            fields: selectableFields.map(f => f.apiName),
        },
    ];
}

function extractColumnsFromLayout(
    layout: MetadataLayout | undefined,
    selectableFields: MetadataField[],
): string[] {
    const raw = layout?.schema as { columns?: string[] } | undefined;
    if (Array.isArray(raw?.columns) && raw.columns.length > 0) {
        return [...raw.columns];
    }
    return selectableFields.slice(0, 5).map(f => f.apiName);
}

function extractHomeSchema(
    layout: MetadataLayout | undefined,
    objectName: string,
): HomeLayoutSchema {
    const raw = layout?.schema as HomeLayoutSchema | undefined;
    return {
        welcomeHeadline: raw?.welcomeHeadline || `${objectName} Workspace`,
        welcomeSubtitle:
            raw?.welcomeSubtitle ||
            `Monitor live KPIs, switch categorized views, and run custom reports for ${objectName}.`,
        kpiCards:
            Array.isArray(raw?.kpiCards) && raw.kpiCards.length > 0
                ? raw.kpiCards.map(c => ({ ...c }))
                : [
                      {
                          id: 'kpi-total',
                          label: `Total ${objectName} Records`,
                          aggregate: 'COUNT',
                      },
                  ],
    };
}

export default function ObjectLayoutBuilderClient({
    objectId,
    objectName,
    fields,
    initialLayouts,
    customRoles = [],
}: {
    objectId: string;
    objectName: string;
    fields: MetadataField[];
    initialLayouts: MetadataLayout[];
    customRoles?: { code: string; name: string }[];
}) {
    const router = useRouter();
    const selectableFields = fields.filter(
        f => f.apiName !== 'id' && f.apiName !== 'tenant_id',
    );
    const numericFields = selectableFields.filter(
        f => f.dataType === 'NUMBER' || f.dataType === 'CURRENCY',
    );

    const allRoleChoices = [
        ...BUILT_IN_ASSIGNABLE_ROLES,
        ...customRoles.map(cr => ({ code: cr.code, name: `${cr.name} (Custom)` })),
    ];

    const formLayouts = initialLayouts.filter(l => l.layoutType === 'FORM');
    const listLayouts = initialLayouts.filter(l => l.layoutType === 'LIST');
    const homeLayouts = initialLayouts.filter(l => l.layoutType === 'HOME');

    const defaultForm = formLayouts.find(l => l.isDefault) ?? formLayouts[0];
    const defaultList = listLayouts.find(l => l.isDefault) ?? listLayouts[0];
    const defaultHome = homeLayouts.find(l => l.isDefault) ?? homeLayouts[0];

    const [activeTab, setActiveTab] = useState<'FORM' | 'LIST' | 'HOME'>('FORM');

    // Named Form Layout state
    const [selectedFormId, setSelectedFormId] = useState<string>(defaultForm?.id ?? '__new__');
    const [formName, setFormName] = useState<string>(
        defaultForm?.name || `Default ${objectName} Form`,
    );
    const [formIsDefault, setFormIsDefault] = useState<boolean>(
        defaultForm ? Boolean(defaultForm.isDefault) : true,
    );
    const [formAssignedRoles, setFormAssignedRoles] = useState<string[]>(
        Array.isArray(defaultForm?.assignedRoles) ? [...defaultForm.assignedRoles] : [],
    );
    const [sections, setSections] = useState<FormSection[]>(
        extractSectionsFromLayout(defaultForm, objectName, selectableFields),
    );

    // Named List Layout state
    const [selectedListId, setSelectedListId] = useState<string>(defaultList?.id ?? '__new__');
    const [listName, setListName] = useState<string>(
        defaultList?.name || `Default ${objectName} List`,
    );
    const [listIsDefault, setListIsDefault] = useState<boolean>(
        defaultList ? Boolean(defaultList.isDefault) : true,
    );
    const [listAssignedRoles, setListAssignedRoles] = useState<string[]>(
        Array.isArray(defaultList?.assignedRoles) ? [...defaultList.assignedRoles] : [],
    );
    const [listColumns, setListColumns] = useState<string[]>(
        extractColumnsFromLayout(defaultList, selectableFields),
    );

    // Home KPI Layout state
    const [homeLayoutId] = useState<string | undefined>(defaultHome?.id);
    const [homeSchema, setHomeSchema] = useState<HomeLayoutSchema>(
        extractHomeSchema(defaultHome, objectName),
    );

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

    const handleSelectFormLayout = (layoutId: string) => {
        if (layoutId === '__new__') {
            setSelectedFormId('__new__');
            setFormName(`Custom ${objectName} Form ${formLayouts.length + 1}`);
            setFormIsDefault(formLayouts.length === 0);
            setFormAssignedRoles([]);
            setSections([
                {
                    title: `${objectName} Details`,
                    fields: selectableFields.slice(0, 6).map(f => f.apiName),
                },
            ]);
            return;
        }
        const chosen = formLayouts.find(l => l.id === layoutId);
        if (!chosen) return;
        setSelectedFormId(chosen.id);
        setFormName(chosen.name || `Default ${objectName} Form`);
        setFormIsDefault(Boolean(chosen.isDefault));
        setFormAssignedRoles(Array.isArray(chosen.assignedRoles) ? [...chosen.assignedRoles] : []);
        setSections(extractSectionsFromLayout(chosen, objectName, selectableFields));
    };

    const handleSelectListLayout = (layoutId: string) => {
        if (layoutId === '__new__') {
            setSelectedListId('__new__');
            setListName(`Custom ${objectName} List ${listLayouts.length + 1}`);
            setListIsDefault(listLayouts.length === 0);
            setListAssignedRoles([]);
            setListColumns(selectableFields.slice(0, 5).map(f => f.apiName));
            return;
        }
        const chosen = listLayouts.find(l => l.id === layoutId);
        if (!chosen) return;
        setSelectedListId(chosen.id);
        setListName(chosen.name || `Default ${objectName} List`);
        setListIsDefault(Boolean(chosen.isDefault));
        setListAssignedRoles(Array.isArray(chosen.assignedRoles) ? [...chosen.assignedRoles] : []);
        setListColumns(extractColumnsFromLayout(chosen, selectableFields));
    };

    const toggleRoleChip = (
        roleCode: string,
        current: string[],
        setter: (next: string[]) => void,
    ) => {
        if (current.includes(roleCode)) {
            setter(current.filter(r => r !== roleCode));
        } else {
            setter([...current, roleCode]);
        }
    };

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

    // Home KPI Handlers
    const handleAddKpiCard = () => {
        const current = homeSchema.kpiCards ?? [];
        if (current.length >= 6) {
            toast.error('Up to 6 KPI cards can be displayed on the Object Home strip.');
            return;
        }
        const nextCard: HomeKpiCardConfig = {
            id: `kpi-${Date.now()}`,
            label: `KPI Metric ${current.length + 1}`,
            aggregate: 'COUNT',
        };
        setHomeSchema(prev => ({
            ...prev,
            kpiCards: [...(prev.kpiCards ?? []), nextCard],
        }));
    };

    const handleUpdateKpiCard = (index: number, patch: Partial<HomeKpiCardConfig>) => {
        setHomeSchema(prev => ({
            ...prev,
            kpiCards: (prev.kpiCards ?? []).map((card, idx) =>
                idx === index ? { ...card, ...patch } : card,
            ),
        }));
    };

    const handleRemoveKpiCard = (index: number) => {
        setHomeSchema(prev => ({
            ...prev,
            kpiCards: (prev.kpiCards ?? []).filter((_, idx) => idx !== index),
        }));
    };

    const handleDeleteCurrentNamedLayout = async () => {
        const activeId = activeTab === 'FORM' ? selectedFormId : selectedListId;
        if (!activeId || activeId === '__new__') return;
        setSaving(true);
        try {
            const res = await deleteNamedObjectLayoutAction(objectId, activeId);
            if (!res.success) {
                toast.error(res.error || 'Could not delete layout.');
                return;
            }
            toast.success('Named layout removed.');
            router.refresh();
        } finally {
            setSaving(false);
        }
    };

    const handleSaveLayout = async () => {
        setSaving(true);
        try {
            if (activeTab === 'FORM') {
                const res = await saveObjectLayout(
                    objectId,
                    'FORM',
                    { sections },
                    {
                        layoutId: selectedFormId !== '__new__' ? selectedFormId : undefined,
                        name: formName.trim() || `Default ${objectName} Form`,
                        assignedRoles: formAssignedRoles,
                        isDefault: formIsDefault,
                    },
                );
                if (!res.success) {
                    toast.error(res.error || 'Failed to save form layout.');
                    return;
                }
                if (res.layoutId) setSelectedFormId(res.layoutId);
                toast.success(`Form layout "${formName}" published.`);
                if (res.objectId && res.objectId !== objectId) {
                    router.replace(`/settings/objects/${res.objectId}`);
                } else {
                    router.refresh();
                }
                return;
            }

            if (activeTab === 'LIST') {
                const res = await saveObjectLayout(
                    objectId,
                    'LIST',
                    { columns: listColumns },
                    {
                        layoutId: selectedListId !== '__new__' ? selectedListId : undefined,
                        name: listName.trim() || `Default ${objectName} List`,
                        assignedRoles: listAssignedRoles,
                        isDefault: listIsDefault,
                    },
                );
                if (!res.success) {
                    toast.error(res.error || 'Failed to save list layout.');
                    return;
                }
                if (res.layoutId) setSelectedListId(res.layoutId);
                toast.success(`List layout "${listName}" published.`);
                if (res.objectId && res.objectId !== objectId) {
                    router.replace(`/settings/objects/${res.objectId}`);
                } else {
                    router.refresh();
                }
                return;
            }

            const res = await saveObjectLayout(
                objectId,
                'HOME',
                homeSchema as Record<string, unknown>,
                {
                    layoutId: homeLayoutId,
                    name: `${objectName} Home KPI Workspace`,
                    assignedRoles: [],
                    isDefault: true,
                },
            );
            if (!res.success) {
                toast.error(res.error || 'Failed to save Object Home workspace.');
                return;
            }
            toast.success('Object Home KPI workspace published.');
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
                        Named Forms, Role-Scoped Layouts &amp; Object Home Designer
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                        Create multiple named forms per object, map forms to specific built-in or custom roles, and customize the{' '}
                        <span className="font-medium text-foreground">{objectName}</span> Home Page KPI strip.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
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
                            <LayoutGrid className="w-3.5 h-3.5" /> Role-Scoped Forms ({formLayouts.length || 1})
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
                        <button
                            type="button"
                            onClick={() => setActiveTab('HOME')}
                            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                activeTab === 'HOME'
                                    ? 'bg-card text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <Sparkles className="w-3.5 h-3.5" /> Object Home KPIs
                        </button>
                    </div>
                    <Button
                        size="sm"
                        onClick={handleSaveLayout}
                        disabled={saving}
                        data-testid="save-layout-btn"
                    >
                        <Save className="w-4 h-4 mr-1.5" />
                        {saving
                            ? 'Saving…'
                            : activeTab === 'FORM'
                              ? 'Save Form Layout'
                              : activeTab === 'LIST'
                                ? 'Save List Layout'
                                : 'Save Home KPIs'}
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="pt-6 space-y-6">
                {/* Named Layout & Role Assignment Toolbar for FORM and LIST */}
                {(activeTab === 'FORM' || activeTab === 'LIST') && (
                    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                                    Active Named {activeTab === 'FORM' ? 'Form' : 'List Layout'}
                                </label>
                                <div className="flex items-center gap-2">
                                    <select
                                        value={activeTab === 'FORM' ? selectedFormId : selectedListId}
                                        onChange={e =>
                                            activeTab === 'FORM'
                                                ? handleSelectFormLayout(e.target.value)
                                                : handleSelectListLayout(e.target.value)
                                        }
                                        className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground"
                                    >
                                        {(activeTab === 'FORM' ? formLayouts : listLayouts).map(l => (
                                            <option key={l.id} value={l.id}>
                                                {l.name || 'Default Layout'}
                                                {l.isDefault ? ' (Default)' : ''}
                                            </option>
                                        ))}
                                        <option value="__new__">
                                            + Create New Named {activeTab === 'FORM' ? 'Form' : 'List'}…
                                        </option>
                                    </select>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            activeTab === 'FORM'
                                                ? handleSelectFormLayout('__new__')
                                                : handleSelectListLayout('__new__')
                                        }
                                    >
                                        <Plus className="w-3.5 h-3.5 mr-1" /> New
                                    </Button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                                    Layout Display Name
                                </label>
                                <Input
                                    value={activeTab === 'FORM' ? formName : listName}
                                    onChange={e =>
                                        activeTab === 'FORM'
                                            ? setFormName(e.target.value)
                                            : setListName(e.target.value)
                                    }
                                    placeholder="e.g. Counselor Intake Form"
                                    className="h-9"
                                />
                            </div>

                            <div className="flex items-center justify-between gap-3">
                                <label className="inline-flex items-center gap-2 text-sm text-foreground cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={activeTab === 'FORM' ? formIsDefault : listIsDefault}
                                        onChange={e =>
                                            activeTab === 'FORM'
                                                ? setFormIsDefault(e.target.checked)
                                                : setListIsDefault(e.target.checked)
                                        }
                                        className="rounded border-border"
                                    />
                                    <span>Default fallback layout</span>
                                </label>

                                {((activeTab === 'FORM' &&
                                    selectedFormId !== '__new__' &&
                                    !formIsDefault) ||
                                    (activeTab === 'LIST' &&
                                        selectedListId !== '__new__' &&
                                        !listIsDefault)) && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleDeleteCurrentNamedLayout}
                                        disabled={saving}
                                        className="text-destructive hover:text-destructive"
                                    >
                                        <Trash2 className="w-4 h-4 mr-1" /> Delete
                                    </Button>
                                )}
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                                <Shield className="w-3.5 h-3.5 text-primary" />
                                Assigned Roles (leave unselected to allow as shared/fallback layout, or select specific roles)
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {allRoleChoices.map(role => {
                                    const activeRoles =
                                        activeTab === 'FORM' ? formAssignedRoles : listAssignedRoles;
                                    const isSelected = activeRoles.includes(role.code);
                                    return (
                                        <button
                                            key={role.code}
                                            type="button"
                                            onClick={() =>
                                                toggleRoleChip(
                                                    role.code,
                                                    activeRoles,
                                                    activeTab === 'FORM'
                                                        ? setFormAssignedRoles
                                                        : setListAssignedRoles,
                                                )
                                            }
                                            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                                                isSelected
                                                    ? 'bg-primary text-primary-foreground border-primary'
                                                    : 'bg-card text-muted-foreground border-border hover:text-foreground'
                                            }`}
                                        >
                                            {role.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

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
                                Drag fields onto any section on the right, or drag fields back here to hide them from this form.
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
                ) : activeTab === 'LIST' ? (
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
                ) : (
                    /* HOME KPI Workspace Designer */
                    <div className="space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                                    Object Home Headline
                                </label>
                                <Input
                                    value={homeSchema.welcomeHeadline || ''}
                                    onChange={e =>
                                        setHomeSchema(prev => ({
                                            ...prev,
                                            welcomeHeadline: e.target.value,
                                        }))
                                    }
                                    placeholder={`${objectName} Workspace`}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                                    Object Home Subtitle
                                </label>
                                <Input
                                    value={homeSchema.welcomeSubtitle || ''}
                                    onChange={e =>
                                        setHomeSchema(prev => ({
                                            ...prev,
                                            welcomeSubtitle: e.target.value,
                                        }))
                                    }
                                    placeholder="Operational command center for this data model"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-semibold text-foreground">
                                    Object Home KPI Summary Strip
                                </h3>
                                <p className="text-xs text-muted-foreground">
                                    Configure up to 6 live KPI cards rendered at the top of `/app/{objectName.toLowerCase()}`.
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleAddKpiCard}
                            >
                                <Plus className="w-3.5 h-3.5 mr-1" /> Add KPI Card
                            </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {(homeSchema.kpiCards ?? []).map((card, idx) => (
                                <div
                                    key={card.id || idx}
                                    className="rounded-xl border border-border bg-card p-4 space-y-3"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <Input
                                            value={card.label}
                                            onChange={e =>
                                                handleUpdateKpiCard(idx, { label: e.target.value })
                                            }
                                            placeholder="KPI Title"
                                            className="h-8 font-medium text-sm"
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleRemoveKpiCard(idx)}
                                            className="text-muted-foreground hover:text-destructive"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                                                Aggregation
                                            </label>
                                            <select
                                                value={card.aggregate}
                                                onChange={e =>
                                                    handleUpdateKpiCard(idx, {
                                                        aggregate: e.target
                                                            .value as RollupAggregateFunction,
                                                    })
                                                }
                                                className="h-8 w-full rounded border border-border bg-card px-2 text-xs text-foreground"
                                            >
                                                <option value="COUNT">COUNT (Records)</option>
                                                <option value="SUM">SUM</option>
                                                <option value="AVG">AVERAGE</option>
                                                <option value="MIN">MIN</option>
                                                <option value="MAX">MAX</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                                                Numeric Field (for SUM/AVG)
                                            </label>
                                            <select
                                                value={card.fieldApiName || ''}
                                                disabled={card.aggregate === 'COUNT'}
                                                onChange={e =>
                                                    handleUpdateKpiCard(idx, {
                                                        fieldApiName: e.target.value || undefined,
                                                    })
                                                }
                                                className="h-8 w-full rounded border border-border bg-card px-2 text-xs text-foreground disabled:opacity-50"
                                            >
                                                <option value="">Select field…</option>
                                                {numericFields.map(nf => (
                                                    <option key={nf.apiName} value={nf.apiName}>
                                                        {nf.label} ({nf.dataType})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                                                Optional Filter Field
                                            </label>
                                            <select
                                                value={card.filterField || ''}
                                                onChange={e =>
                                                    handleUpdateKpiCard(idx, {
                                                        filterField: e.target.value || undefined,
                                                    })
                                                }
                                                className="h-8 w-full rounded border border-border bg-card px-2 text-xs text-foreground"
                                            >
                                                <option value="">All Records</option>
                                                {selectableFields.map(sf => (
                                                    <option key={sf.apiName} value={sf.apiName}>
                                                        {sf.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                                                Equals Value
                                            </label>
                                            <Input
                                                value={card.filterValue || ''}
                                                disabled={!card.filterField}
                                                onChange={e =>
                                                    handleUpdateKpiCard(idx, {
                                                        filterValue: e.target.value,
                                                    })
                                                }
                                                placeholder="e.g. ACTIVE"
                                                className="h-8 text-xs"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
