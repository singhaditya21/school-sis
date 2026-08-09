'use client';

import { useMemo, useState, useTransition } from 'react';
import { Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
    createGradingScheme,
    deleteGradingScheme,
    type GradingMutationResult,
    updateGradingScheme,
} from '@/lib/actions/grading';
import {
    gradeForPercentage,
    type GradeThresholdInput,
    type GradingScheme,
    type GradingSchemeType,
} from '@/lib/grading/validation';

interface ThresholdDraft {
    grade: string;
    minPercentage: string;
    maxPercentage: string;
    gradePoint: string;
    remark: string;
}

interface SchemeDraft {
    name: string;
    type: GradingSchemeType;
    description: string;
    isDefault: boolean;
    isActive: boolean;
    thresholds: ThresholdDraft[];
}

type EditorMode = { kind: 'create' } | { kind: 'edit'; scheme: GradingScheme };

const EMPTY_THRESHOLD: ThresholdDraft = {
    grade: 'A',
    minPercentage: '0',
    maxPercentage: '100',
    gradePoint: '4',
    remark: '',
};

function draftFor(mode: EditorMode, firstScheme: boolean): SchemeDraft {
    if (mode.kind === 'create') {
        return {
            name: '',
            type: 'GPA',
            description: '',
            isDefault: firstScheme,
            isActive: true,
            thresholds: [{ ...EMPTY_THRESHOLD }],
        };
    }

    return {
        name: mode.scheme.name,
        type: mode.scheme.type,
        description: mode.scheme.description,
        isDefault: mode.scheme.isDefault,
        isActive: mode.scheme.isActive,
        thresholds: mode.scheme.thresholds.map(threshold => ({
            grade: threshold.grade,
            minPercentage: String(threshold.minPercentage),
            maxPercentage: String(threshold.maxPercentage),
            gradePoint: threshold.gradePoint === null ? '' : String(threshold.gradePoint),
            remark: threshold.remark,
        })),
    };
}

function mutationInput(draft: SchemeDraft): {
    name: string;
    type: GradingSchemeType;
    description: string;
    isDefault: boolean;
    isActive: boolean;
    thresholds: GradeThresholdInput[];
} {
    const percentageValue = (value: string): number => value.trim() === '' ? Number.NaN : Number(value);

    return {
        ...draft,
        thresholds: draft.thresholds.map(threshold => ({
            grade: threshold.grade,
            minPercentage: percentageValue(threshold.minPercentage),
            maxPercentage: percentageValue(threshold.maxPercentage),
            gradePoint: draft.type === 'PERCENTAGE' || threshold.gradePoint.trim() === ''
                ? null
                : Number(threshold.gradePoint),
            remark: threshold.remark,
        })),
    };
}

function typeLabel(type: GradingSchemeType): string {
    switch (type) {
        case 'GPA': return 'Grade Point Average';
        case 'CGPA': return 'Cumulative GPA';
        case 'PERCENTAGE': return 'Percentage Based';
        case 'LETTER': return 'Letter Grades';
    }
}

export default function GradingSettingsClient({ initialSchemes }: { initialSchemes: GradingScheme[] }) {
    const [schemes, setSchemes] = useState(initialSchemes);
    const [selectedId, setSelectedId] = useState<string | null>(initialSchemes[0]?.id || null);
    const [editorMode, setEditorMode] = useState<EditorMode | null>(null);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [isPending, startTransition] = useTransition();
    const [testPercentage, setTestPercentage] = useState('');
    const [testAttempted, setTestAttempted] = useState(false);

    const selectedScheme = schemes.find(scheme => scheme.id === selectedId) || null;
    const testedThreshold = useMemo(() => {
        if (!selectedScheme || !testAttempted) return null;
        return gradeForPercentage(selectedScheme.thresholds, Number(testPercentage));
    }, [selectedScheme, testAttempted, testPercentage]);

    function applyResult(result: GradingMutationResult, successMessage: string): boolean {
        if ('error' in result) {
            setFeedback({ type: 'error', message: result.error });
            return false;
        }

        setSchemes(result.schemes);
        setSelectedId(result.selectedId);
        setFeedback({ type: 'success', message: successMessage });
        return true;
    }

    function submitDraft(draft: SchemeDraft): void {
        if (!editorMode) return;
        setFeedback(null);
        startTransition(async () => {
            const input = mutationInput(draft);
            const result = editorMode.kind === 'create'
                ? await createGradingScheme(input)
                : await updateGradingScheme({
                    ...input,
                    id: editorMode.scheme.id,
                    updatedAt: editorMode.scheme.updatedAt,
                });
            if (applyResult(result, editorMode.kind === 'create' ? 'Grading scheme created.' : 'Grading scheme updated.')) {
                setEditorMode(null);
            }
        });
    }

    function removeSelected(): void {
        if (!selectedScheme) return;
        if (!window.confirm(`Delete "${selectedScheme.name}"? This permanently removes its thresholds.`)) return;

        setFeedback(null);
        startTransition(async () => {
            const result = await deleteGradingScheme({
                id: selectedScheme.id,
                updatedAt: selectedScheme.updatedAt,
            });
            applyResult(result, 'Grading scheme deleted.');
        });
    }

    function selectScheme(id: string): void {
        setSelectedId(id);
        setTestPercentage('');
        setTestAttempted(false);
    }

    return (
        <div className="container mx-auto space-y-6 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Grading Settings</h1>
                    <p className="text-muted-foreground">Configure persisted grading schemes for exams and report cards.</p>
                </div>
                <Dialog open={editorMode?.kind === 'create'} onOpenChange={open => setEditorMode(open ? { kind: 'create' } : null)}>
                    <DialogTrigger asChild>
                        <Button disabled={isPending}>
                            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                            Add Scheme
                        </Button>
                    </DialogTrigger>
                    {editorMode?.kind === 'create' && (
                        <SchemeEditor
                            key="create"
                            mode={editorMode}
                            firstScheme={schemes.length === 0}
                            isPending={isPending}
                            errorMessage={feedback?.type === 'error' ? feedback.message : null}
                            onCancel={() => setEditorMode(null)}
                            onSubmit={submitDraft}
                        />
                    )}
                </Dialog>
            </div>

            {feedback && (
                <div
                    role={feedback.type === 'error' ? 'alert' : 'status'}
                    className={`rounded-lg border px-4 py-3 text-sm ${feedback.type === 'error'
                        ? 'border-destructive/30 bg-destructive/10 text-destructive'
                        : 'border-success/30 bg-success-muted text-success'
                    }`}
                >
                    {feedback.message}
                </div>
            )}

            <div className="grid gap-6 md:grid-cols-3">
                <Card className="md:col-span-1">
                    <CardHeader>
                        <CardTitle className="text-lg">Grading Schemes</CardTitle>
                        <CardDescription>{schemes.length} persisted {schemes.length === 1 ? 'scheme' : 'schemes'}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {schemes.length === 0 ? (
                            <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                                No grading schemes have been configured.
                            </div>
                        ) : schemes.map(scheme => (
                            <Button
                                type="button"
                                variant="ghost"
                                key={scheme.id}
                                aria-pressed={selectedScheme?.id === scheme.id}
                                onClick={() => selectScheme(scheme.id)}
                                className={`h-auto w-full justify-start whitespace-normal rounded-lg border p-3 text-left transition-colors ${selectedScheme?.id === scheme.id
                                    ? 'border-primary bg-primary/10'
                                    : 'border-border hover:bg-accent'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-medium">{scheme.name}</span>
                                    {scheme.isDefault && <Star className="h-4 w-4 fill-warning text-warning" aria-label="Default scheme" />}
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <Badge variant="outline" className="text-xs">{scheme.type}</Badge>
                                    <Badge variant={scheme.isActive ? 'default' : 'secondary'} className="text-xs">
                                        {scheme.isActive ? 'Active' : 'Inactive'}
                                    </Badge>
                                </div>
                            </Button>
                        ))}
                    </CardContent>
                </Card>

                <Card className="md:col-span-2">
                    <CardHeader>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <CardTitle>{selectedScheme?.name || 'Select a Scheme'}</CardTitle>
                                <CardDescription>
                                    {selectedScheme
                                        ? selectedScheme.description || `${typeLabel(selectedScheme.type)} scheme`
                                        : 'Choose a persisted grading scheme from the list.'}
                                </CardDescription>
                            </div>
                            {selectedScheme && (
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" disabled={isPending} onClick={() => setEditorMode({ kind: 'edit', scheme: selectedScheme })}>
                                        <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                                        Edit
                                    </Button>
                                    <Button variant="destructive" size="sm" disabled={isPending} onClick={removeSelected}>
                                        <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                                        Delete
                                    </Button>
                                </div>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent>
                        {selectedScheme ? (
                            <Tabs defaultValue="thresholds">
                                <TabsList>
                                    <TabsTrigger value="thresholds">Grade Thresholds</TabsTrigger>
                                    <TabsTrigger value="test">Test Calculator</TabsTrigger>
                                </TabsList>
                                <TabsContent value="thresholds" className="mt-4">
                                    <p className="mb-3 text-xs text-muted-foreground">
                                        Ranges use a lower-inclusive, upper-exclusive boundary; the range ending at 100 includes 100.
                                    </p>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Grade</TableHead>
                                                <TableHead>Range</TableHead>
                                                {selectedScheme.type !== 'PERCENTAGE' && <TableHead>Grade Point</TableHead>}
                                                <TableHead>Remark</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {selectedScheme.thresholds.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={selectedScheme.type === 'PERCENTAGE' ? 3 : 4} className="py-8 text-center text-muted-foreground">
                                                        No thresholds are stored for this scheme.
                                                    </TableCell>
                                                </TableRow>
                                            ) : selectedScheme.thresholds.map(threshold => (
                                                <TableRow key={threshold.id}>
                                                    <TableCell><Badge variant="outline">{threshold.grade}</Badge></TableCell>
                                                    <TableCell>{threshold.minPercentage}% – {threshold.maxPercentage}%</TableCell>
                                                    {selectedScheme.type !== 'PERCENTAGE' && (
                                                        <TableCell>{threshold.gradePoint === null ? 'Not provided' : threshold.gradePoint.toFixed(2)}</TableCell>
                                                    )}
                                                    <TableCell className="text-muted-foreground">{threshold.remark || 'Not provided'}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TabsContent>
                                <TabsContent value="test" className="mt-4">
                                    <div className="max-w-md space-y-4">
                                        <div>
                                            <Label htmlFor="test-percentage">Percentage</Label>
                                            <div className="mt-1 flex gap-2">
                                                <Input
                                                    id="test-percentage"
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    step="0.01"
                                                    value={testPercentage}
                                                    onChange={event => {
                                                        setTestPercentage(event.target.value);
                                                        setTestAttempted(false);
                                                    }}
                                                    placeholder="e.g. 75"
                                                />
                                                <Button type="button" onClick={() => setTestAttempted(true)}>Calculate</Button>
                                            </div>
                                        </div>
                                        {testAttempted && (testedThreshold ? (
                                            <Card className="border-success/30 bg-success-muted">
                                                <CardContent className="flex gap-6 pt-4">
                                                    <div>
                                                        <div className="text-3xl font-bold text-success">{testedThreshold.grade}</div>
                                                        <div className="text-sm text-success">Grade</div>
                                                    </div>
                                                    {testedThreshold.gradePoint !== null && (
                                                        <div className="border-l border-success/30 pl-6">
                                                            <div className="text-3xl font-bold text-success">{testedThreshold.gradePoint.toFixed(2)}</div>
                                                            <div className="text-sm text-success">Grade Point</div>
                                                        </div>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        ) : (
                                            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                                                Enter a percentage from 0 through 100 covered by this scheme.
                                            </div>
                                        ))}
                                    </div>
                                </TabsContent>
                            </Tabs>
                        ) : (
                            <div className="py-10 text-center text-muted-foreground">
                                {schemes.length === 0 ? 'Create a grading scheme to begin.' : 'Select a grading scheme to view its details.'}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Dialog open={editorMode?.kind === 'edit'} onOpenChange={open => {
                if (!open) setEditorMode(null);
            }}>
                {editorMode?.kind === 'edit' && (
                    <SchemeEditor
                        key={`${editorMode.scheme.id}:${editorMode.scheme.updatedAt}`}
                        mode={editorMode}
                        firstScheme={false}
                        isPending={isPending}
                        errorMessage={feedback?.type === 'error' ? feedback.message : null}
                        onCancel={() => setEditorMode(null)}
                        onSubmit={submitDraft}
                    />
                )}
            </Dialog>
        </div>
    );
}

function SchemeEditor({
    mode,
    firstScheme,
    isPending,
    errorMessage,
    onCancel,
    onSubmit,
}: {
    mode: EditorMode;
    firstScheme: boolean;
    isPending: boolean;
    errorMessage: string | null;
    onCancel: () => void;
    onSubmit: (draft: SchemeDraft) => void;
}) {
    const [draft, setDraft] = useState(() => draftFor(mode, firstScheme));
    const editingDefault = mode.kind === 'edit' && mode.scheme.isDefault;

    function updateThreshold(index: number, field: keyof ThresholdDraft, value: string): void {
        setDraft(current => ({
            ...current,
            thresholds: current.thresholds.map((threshold, thresholdIndex) => (
                thresholdIndex === index ? { ...threshold, [field]: value } : threshold
            )),
        }));
    }

    return (
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
            <DialogHeader>
                <DialogTitle>{mode.kind === 'create' ? 'Create Grading Scheme' : 'Edit Grading Scheme'}</DialogTitle>
                <DialogDescription>
                    Thresholds must cover 0–100 continuously. Changes are validated and audited when saved.
                </DialogDescription>
            </DialogHeader>

            {errorMessage && (
                <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {errorMessage}
                </div>
            )}

            <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="scheme-name">Scheme Name</Label>
                        <Input
                            id="scheme-name"
                            value={draft.name}
                            maxLength={255}
                            onChange={event => setDraft(current => ({ ...current, name: event.target.value }))}
                            placeholder="e.g. 2026 Academic Scale"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Type</Label>
                        <Select value={draft.type} onValueChange={(type: GradingSchemeType) => setDraft(current => ({ ...current, type }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="GPA">GPA (Grade Points)</SelectItem>
                                <SelectItem value="CGPA">CGPA (Cumulative)</SelectItem>
                                <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                                <SelectItem value="LETTER">Letter Grades</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="scheme-description">Description</Label>
                    <Textarea
                        id="scheme-description"
                        value={draft.description}
                        maxLength={1000}
                        onChange={event => setDraft(current => ({ ...current, description: event.target.value }))}
                        placeholder="How and where this scale should be used"
                    />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                        <Checkbox
                            checked={draft.isDefault}
                            disabled={firstScheme || editingDefault}
                            onCheckedChange={checked => setDraft(current => ({
                                ...current,
                                isDefault: Boolean(checked),
                                isActive: checked ? true : current.isActive,
                            }))}
                        />
                        <span>
                            <span className="block font-medium">Default scheme</span>
                            <span className="text-muted-foreground">
                                {editingDefault ? 'Choose another scheme as default before unsetting this one.' : 'Replaces the current default when saved.'}
                            </span>
                        </span>
                    </label>
                    <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                        <Checkbox
                            checked={draft.isActive}
                            disabled={draft.isDefault}
                            onCheckedChange={checked => setDraft(current => ({ ...current, isActive: Boolean(checked) }))}
                        />
                        <span>
                            <span className="block font-medium">Active</span>
                            <span className="text-muted-foreground">Inactive schemes remain available for historical records.</span>
                        </span>
                    </label>
                </div>

                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <Label>Grade Thresholds</Label>
                            <p className="text-xs text-muted-foreground">The upper boundary belongs to the next range, except 100.</p>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setDraft(current => ({
                                ...current,
                                thresholds: [...current.thresholds, { ...EMPTY_THRESHOLD, grade: '' }],
                            }))}
                        >
                            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                            Add Range
                        </Button>
                    </div>

                    <div className="space-y-3">
                        {draft.thresholds.map((threshold, index) => (
                            <div key={index} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-12">
                                <div className="space-y-1 sm:col-span-2">
                                    <Label htmlFor={`grade-${index}`}>Grade</Label>
                                    <Input id={`grade-${index}`} value={threshold.grade} onChange={event => updateThreshold(index, 'grade', event.target.value)} />
                                </div>
                                <div className="space-y-1 sm:col-span-2">
                                    <Label htmlFor={`minimum-${index}`}>Min %</Label>
                                    <Input id={`minimum-${index}`} type="number" min="0" max="100" step="0.01" value={threshold.minPercentage} onChange={event => updateThreshold(index, 'minPercentage', event.target.value)} />
                                </div>
                                <div className="space-y-1 sm:col-span-2">
                                    <Label htmlFor={`maximum-${index}`}>Max %</Label>
                                    <Input id={`maximum-${index}`} type="number" min="0" max="100" step="0.01" value={threshold.maxPercentage} onChange={event => updateThreshold(index, 'maxPercentage', event.target.value)} />
                                </div>
                                <div className="space-y-1 sm:col-span-2">
                                    <Label htmlFor={`point-${index}`}>Grade Point</Label>
                                    <Input id={`point-${index}`} type="number" min="0" max="100" step="0.01" value={threshold.gradePoint} disabled={draft.type === 'PERCENTAGE'} onChange={event => updateThreshold(index, 'gradePoint', event.target.value)} />
                                </div>
                                <div className="space-y-1 sm:col-span-3">
                                    <Label htmlFor={`remark-${index}`}>Remark</Label>
                                    <Input id={`remark-${index}`} value={threshold.remark} maxLength={255} onChange={event => updateThreshold(index, 'remark', event.target.value)} />
                                </div>
                                <div className="flex items-end sm:col-span-1">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        aria-label={`Remove grade ${threshold.grade || index + 1}`}
                                        disabled={draft.thresholds.length === 1}
                                        onClick={() => setDraft(current => ({
                                            ...current,
                                            thresholds: current.thresholds.filter((_, thresholdIndex) => thresholdIndex !== index),
                                        }))}
                                    >
                                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <DialogFooter>
                <Button type="button" variant="outline" disabled={isPending} onClick={onCancel}>Cancel</Button>
                <Button type="button" disabled={isPending} onClick={() => onSubmit(draft)}>
                    {isPending ? 'Saving…' : mode.kind === 'create' ? 'Create Scheme' : 'Save Changes'}
                </Button>
            </DialogFooter>
        </DialogContent>
    );
}
