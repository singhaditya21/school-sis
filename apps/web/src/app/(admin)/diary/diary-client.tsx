'use client';

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { createDiaryEntry, deleteDiaryEntry, updateDiaryEntry } from './actions';
import { DIARY_TYPES, type DiaryEntryRow, type DiaryOptions } from './types';

interface Props {
    entries: DiaryEntryRow[];
    options: DiaryOptions;
    filters: { gradeId: string; type: string; date: string };
    today: string;
}

const TYPE_STYLES: Record<string, string> = {
    HOMEWORK: 'bg-blue-100 text-blue-700 hover:bg-blue-100',
    ANNOUNCEMENT: 'bg-purple-100 text-purple-700 hover:bg-purple-100',
    REMINDER: 'bg-amber-100 text-amber-700 hover:bg-amber-100',
    NOTE: 'bg-muted text-foreground hover:bg-muted',
};

function formatDate(value: string | null): string {
    if (!value) return '—';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function audienceLabel(entry: DiaryEntryRow): string {
    if (!entry.gradeName) return 'Whole school';
    return entry.sectionName ? `${entry.gradeName} · ${entry.sectionName}` : entry.gradeName;
}

export default function DiaryClient({ entries, options, filters, today }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [composeOpen, setComposeOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formGradeId, setFormGradeId] = useState('');
    const [editing, setEditing] = useState<DiaryEntryRow | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const applyFilter = useCallback(
        (key: 'gradeId' | 'type' | 'date', value: string) => {
            const merged = { ...filters, [key]: value };
            const next = new URLSearchParams();
            if (merged.gradeId) next.set('gradeId', merged.gradeId);
            if (merged.type) next.set('type', merged.type);
            if (merged.date) next.set('date', merged.date);
            const qs = next.toString();
            startTransition(() => router.push(qs ? `/diary?${qs}` : '/diary'));
        },
        [filters, router]
    );

    async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setSaving(true);
        try {
            const result = await createDiaryEntry({
                title: String(form.get('title') ?? ''),
                content: String(form.get('content') ?? ''),
                date: String(form.get('date') ?? ''),
                type: String(form.get('type') ?? '') || undefined,
                gradeId: String(form.get('gradeId') ?? '') || undefined,
                sectionId: String(form.get('sectionId') ?? '') || undefined,
                subjectId: String(form.get('subjectId') ?? '') || undefined,
                teacherId: String(form.get('teacherId') ?? '') || undefined,
            });
            if (!result.success) {
                toast.error(result.error ?? 'Could not save the entry.');
                return;
            }
            toast.success('Diary entry posted.');
            setComposeOpen(false);
            setFormGradeId('');
            router.refresh();
        } catch {
            toast.error('Could not save the entry.');
        } finally {
            setSaving(false);
        }
    }

    async function handleUpdate(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!editing) return;
        const form = new FormData(event.currentTarget);
        setSaving(true);
        try {
            const result = await updateDiaryEntry({
                entryId: editing.id,
                title: String(form.get('title') ?? ''),
                content: String(form.get('content') ?? ''),
                date: String(form.get('date') ?? ''),
                type: String(form.get('type') ?? '') || undefined,
            });
            if (!result.success) {
                toast.error(result.error ?? 'Could not update the entry.');
                return;
            }
            toast.success('Entry updated.');
            setEditing(null);
            router.refresh();
        } catch {
            toast.error('Could not update the entry.');
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(entry: DiaryEntryRow) {
        setBusyId(entry.id);
        try {
            const result = await deleteDiaryEntry(entry.id);
            if (!result.success) {
                toast.error(result.error ?? 'Could not delete the entry.');
                return;
            }
            toast.success('Entry deleted.');
            router.refresh();
        } catch {
            toast.error('Could not delete the entry.');
        } finally {
            setBusyId(null);
        }
    }

    const sectionsForForm = options.grades.find((g) => g.gradeId === formGradeId)?.sections ?? [];

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">School diary</h1>
                    <p className="text-muted-foreground mt-1">Daily notes, homework reminders and class announcements.</p>
                </div>
                <Button onClick={() => setComposeOpen(true)} className="bg-primary hover:bg-primary/90">
                    New entry
                </Button>
            </div>

            <Card>
                <CardContent className="pt-4 flex flex-col md:flex-row md:items-end gap-3">
                    <div className="space-y-1">
                        <Label htmlFor="filter-grade" className="text-xs text-muted-foreground">Class</Label>
                        <select
                            id="filter-grade"
                            className="h-10 w-full md:w-48 px-3 bg-card border border-border rounded-md text-sm"
                            value={filters.gradeId}
                            onChange={(e) => applyFilter('gradeId', e.target.value)}
                        >
                            <option value="">All classes</option>
                            {options.grades.map((g) => (
                                <option key={g.gradeId} value={g.gradeId}>{g.gradeName}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="filter-type" className="text-xs text-muted-foreground">Type</Label>
                        <select
                            id="filter-type"
                            className="h-10 w-full md:w-40 px-3 bg-card border border-border rounded-md text-sm"
                            value={filters.type}
                            onChange={(e) => applyFilter('type', e.target.value)}
                        >
                            <option value="">All types</option>
                            {DIARY_TYPES.map((t) => (
                                <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="filter-date" className="text-xs text-muted-foreground">Date</Label>
                        <Input
                            id="filter-date"
                            type="date"
                            className="md:w-44"
                            value={filters.date}
                            onChange={(e) => applyFilter('date', e.target.value)}
                        />
                    </div>
                    {(filters.gradeId || filters.type || filters.date) && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="md:ml-auto"
                            onClick={() => startTransition(() => router.push('/diary'))}
                        >
                            Clear filters
                        </Button>
                    )}
                </CardContent>
            </Card>

            {isPending && <p className="text-xs text-muted-foreground">Updating…</p>}

            {entries.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                        <p className="font-medium">No diary entries</p>
                        <p className="text-sm mt-1">
                            {filters.gradeId || filters.type || filters.date
                                ? 'Nothing matches these filters yet.'
                                : 'Post the first entry to start the class diary.'}
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {entries.map((entry) => (
                        <Card key={entry.id}>
                            <CardHeader className="pb-3">
                                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-lg">
                                    <span>{entry.title}</span>
                                    <span className="flex flex-wrap gap-2">
                                        <Badge variant="outline">{audienceLabel(entry)}</Badge>
                                        {entry.subjectName && <Badge variant="outline">{entry.subjectName}</Badge>}
                                        {entry.type && (
                                            <Badge variant="secondary" className={TYPE_STYLES[entry.type] ?? TYPE_STYLES.NOTE}>
                                                {entry.type.charAt(0) + entry.type.slice(1).toLowerCase()}
                                            </Badge>
                                        )}
                                    </span>
                                </CardTitle>
                                <p className="text-sm text-muted-foreground">
                                    {formatDate(entry.date)}
                                    {entry.teacherName ? ` · ${entry.teacherName}` : ''}
                                </p>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <p className="text-foreground whitespace-pre-wrap">{entry.content}</p>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setEditing(entry)}>
                                        Edit
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                        disabled={busyId === entry.id}
                                        onClick={() => handleDelete(entry)}
                                    >
                                        Delete
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>New diary entry</DialogTitle>
                        <DialogDescription>
                            Leave the class blank to post a note for the whole school.
                        </DialogDescription>
                    </DialogHeader>
                    <form className="space-y-4" onSubmit={handleCreate}>
                        <div className="space-y-2">
                            <Label htmlFor="title">Title</Label>
                            <Input id="title" name="title" required maxLength={255} placeholder="Maths homework — page 42" />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="date">Date</Label>
                                <Input id="date" name="date" type="date" required defaultValue={today} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="type">Type</Label>
                                <select id="type" name="type" className="w-full h-10 px-3 bg-card border border-border rounded-md text-sm" defaultValue="HOMEWORK">
                                    {DIARY_TYPES.map((t) => (
                                        <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="gradeId">Class</Label>
                                <select
                                    id="gradeId"
                                    name="gradeId"
                                    value={formGradeId}
                                    onChange={(e) => setFormGradeId(e.target.value)}
                                    className="w-full h-10 px-3 bg-card border border-border rounded-md text-sm"
                                >
                                    <option value="">Whole school</option>
                                    {options.grades.map((g) => (
                                        <option key={g.gradeId} value={g.gradeId}>{g.gradeName}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="sectionId">Section</Label>
                                <select
                                    id="sectionId"
                                    name="sectionId"
                                    disabled={!formGradeId}
                                    className="w-full h-10 px-3 bg-card border border-border rounded-md text-sm disabled:bg-muted"
                                >
                                    <option value="">All sections</option>
                                    {sectionsForForm.map((s) => (
                                        <option key={s.sectionId} value={s.sectionId}>{s.sectionName}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="subjectId">Subject</Label>
                                <select id="subjectId" name="subjectId" className="w-full h-10 px-3 bg-card border border-border rounded-md text-sm">
                                    <option value="">No subject</option>
                                    {options.subjects.map((s) => (
                                        <option key={s.subjectId} value={s.subjectId}>{s.subjectName}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {options.teachers.length > 0 && (
                            <div className="space-y-2">
                                <Label htmlFor="teacherId">Posted by</Label>
                                <select id="teacherId" name="teacherId" className="w-full h-10 px-3 bg-card border border-border rounded-md text-sm">
                                    <option value="">Me</option>
                                    {options.teachers.map((t) => (
                                        <option key={t.teacherId} value={t.teacherId}>{t.teacherName}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="content">Entry</Label>
                            <Textarea id="content" name="content" required className="h-32 resize-none" placeholder="What families need to know." />
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setComposeOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90">
                                {saving ? 'Posting…' : 'Post entry'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Edit entry</DialogTitle>
                        <DialogDescription>
                            Class, section, subject and author stay as first posted.
                        </DialogDescription>
                    </DialogHeader>
                    {editing && (
                        <form className="space-y-4" onSubmit={handleUpdate}>
                            <div className="space-y-2">
                                <Label htmlFor="edit-title">Title</Label>
                                <Input id="edit-title" name="title" required maxLength={255} defaultValue={editing.title} />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="edit-date">Date</Label>
                                    <Input id="edit-date" name="date" type="date" required defaultValue={editing.date} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="edit-type">Type</Label>
                                    <select
                                        id="edit-type"
                                        name="type"
                                        defaultValue={editing.type ?? ''}
                                        className="w-full h-10 px-3 bg-card border border-border rounded-md text-sm"
                                    >
                                        <option value="">No type</option>
                                        {DIARY_TYPES.map((t) => (
                                            <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-content">Entry</Label>
                                <Textarea id="edit-content" name="content" required className="h-32 resize-none" defaultValue={editing.content} />
                            </div>
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                                <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
                            </DialogFooter>
                        </form>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
