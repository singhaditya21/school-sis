'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    createConsentForm,
    deleteConsentResponse,
    recordConsentResponse,
    setConsentFormActive,
} from './actions';
import {
    CONSENT_AUDIENCES,
    CONSENT_FORM_TYPES,
    formatDate,
    formatDateTime,
    humanise,
    isOverdue,
    type ConsentForm,
    type ConsentResponseRow,
    type ConsentStats,
    type StudentOption,
} from './types';

type Props = {
    forms: ConsentForm[];
    summary: ConsentStats;
    selectedForm: ConsentForm | null;
    responses: ConsentResponseRow[];
    students: StudentOption[];
    todayIso: string;
};

export default function ConsentClient({
    forms,
    summary,
    selectedForm,
    responses,
    students,
    todayIso,
}: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [showCreate, setShowCreate] = useState(false);

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [formType, setFormType] = useState<string>('FIELD_TRIP');
    const [audience, setAudience] = useState<string>('PARENTS');
    const [dueDate, setDueDate] = useState('');

    const [studentId, setStudentId] = useState('');
    const [respondentName, setRespondentName] = useState('');
    const [replyNotes, setReplyNotes] = useState('');
    const [studentSearch, setStudentSearch] = useState('');
    const [armedForDelete, setArmedForDelete] = useState<string | null>(null);

    const respondedIds = useMemo(
        () => new Set(responses.map((response) => response.studentId)),
        [responses],
    );

    const studentChoices = useMemo(() => {
        const needle = studentSearch.trim().toLowerCase();
        if (!needle) return students;
        return students.filter(
            (student) =>
                student.name.toLowerCase().includes(needle) ||
                student.admissionNumber.toLowerCase().includes(needle),
        );
    }, [students, studentSearch]);

    function submitForm() {
        startTransition(async () => {
            const result = await createConsentForm({
                title,
                description,
                formType,
                audience,
                dueDate: dueDate || undefined,
            });
            if (result.success) {
                toast.success(`"${title.trim()}" created`);
                setShowCreate(false);
                setTitle('');
                setDescription('');
                setDueDate('');
                router.refresh();
            } else {
                toast.error(result.error || 'Could not create the form.');
            }
        });
    }

    function toggleActive(form: ConsentForm) {
        startTransition(async () => {
            const result = await setConsentFormActive(form.id, !form.isActive);
            if (result.success) {
                toast.success(form.isActive ? 'Form closed' : 'Form reopened');
                router.refresh();
            } else {
                toast.error(result.error || 'Could not update the form.');
            }
        });
    }

    function saveReply(response: 'ACCEPTED' | 'DECLINED') {
        if (!selectedForm || !studentId) return;
        startTransition(async () => {
            const result = await recordConsentResponse({
                formId: selectedForm.id,
                studentId,
                response,
                respondentName,
                notes: replyNotes,
            });
            if (result.success) {
                toast.success(
                    response === 'ACCEPTED' ? 'Consent recorded' : 'Refusal recorded',
                );
                setStudentId('');
                setRespondentName('');
                setReplyNotes('');
                router.refresh();
            } else {
                toast.error(result.error || 'Could not record the reply.');
            }
        });
    }

    function removeReply(row: ConsentResponseRow) {
        if (armedForDelete !== row.id) {
            setArmedForDelete(row.id);
            return;
        }
        startTransition(async () => {
            const result = await deleteConsentResponse(row.id);
            if (result.success) {
                toast.success('Reply removed');
                router.refresh();
            } else {
                toast.error(result.error || 'Could not remove the reply.');
            }
            setArmedForDelete(null);
        });
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Tile label="Forms" value={summary.totalForms} hint={`${summary.activeForms} open`} />
                <Tile
                    label="Past due"
                    value={summary.overdueForms}
                    tone={summary.overdueForms > 0 ? 'danger' : 'muted'}
                    hint="Open, due date passed"
                />
                <Tile label="Consent given" value={summary.accepted} tone="good" />
                <Tile
                    label="Consent refused"
                    value={summary.declined}
                    tone={summary.declined > 0 ? 'danger' : 'muted'}
                />
            </div>

            <p className="rounded-lg border border-border bg-muted p-3 text-xs text-muted-foreground">
                Forms record replies received. The schema does not link a form to a class list, so
                there is no &ldquo;awaiting reply&rdquo; count — outstanding parents have to be
                identified from the responses below.
            </p>

            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Consent forms</h2>
                <Button onClick={() => setShowCreate((current) => !current)}>
                    {showCreate ? 'Cancel' : 'New form'}
                </Button>
            </div>

            {showCreate && (
                <Card>
                    <CardContent className="space-y-4 pt-6">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="md:col-span-2">
                                <Label htmlFor="consent-title">Title</Label>
                                <Input
                                    id="consent-title"
                                    value={title}
                                    onChange={(event) => setTitle(event.target.value)}
                                    placeholder="Class 8 heritage walk — Qutub Minar"
                                />
                            </div>
                            <div>
                                <Label htmlFor="consent-type">Type</Label>
                                <select
                                    id="consent-type"
                                    value={formType}
                                    onChange={(event) => setFormType(event.target.value)}
                                    className="mt-1 h-9 w-full rounded-md border border-border px-3 text-sm"
                                >
                                    {CONSENT_FORM_TYPES.map((type) => (
                                        <option key={type} value={type}>
                                            {humanise(type)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <Label htmlFor="consent-audience">Audience</Label>
                                <select
                                    id="consent-audience"
                                    value={audience}
                                    onChange={(event) => setAudience(event.target.value)}
                                    className="mt-1 h-9 w-full rounded-md border border-border px-3 text-sm"
                                >
                                    {CONSENT_AUDIENCES.map((option) => (
                                        <option key={option} value={option}>
                                            {humanise(option)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <Label htmlFor="consent-due">Reply due by (optional)</Label>
                                <Input
                                    id="consent-due"
                                    type="date"
                                    value={dueDate}
                                    onChange={(event) => setDueDate(event.target.value)}
                                />
                            </div>
                            <div className="md:col-span-2">
                                <Label htmlFor="consent-description">
                                    What parents are agreeing to (optional)
                                </Label>
                                <Textarea
                                    id="consent-description"
                                    rows={3}
                                    value={description}
                                    onChange={(event) => setDescription(event.target.value)}
                                />
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Creating a form does not notify parents. This release has no parent-facing
                            consent form; replies are recorded here by office staff from paper slips or
                            phone calls.
                        </p>
                        <Button onClick={submitForm} disabled={pending || !title.trim()}>
                            {pending ? 'Creating…' : 'Create form'}
                        </Button>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="border-b bg-muted">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                                        Form
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                                        Type
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                                        Audience
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                                        Due
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                                        Replies
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-muted-foreground">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {forms.map((form) => (
                                    <tr
                                        key={form.id}
                                        className={`align-top hover:bg-muted ${
                                            selectedForm?.id === form.id ? 'bg-blue-50/60' : ''
                                        }`}
                                    >
                                        <td className="px-4 py-3">
                                            <Link
                                                href={`/consent?formId=${form.id}`}
                                                className="font-medium text-foreground hover:underline"
                                            >
                                                {form.title}
                                            </Link>
                                            {form.description && (
                                                <div className="max-w-md truncate text-xs text-muted-foreground">
                                                    {form.description}
                                                </div>
                                            )}
                                            {!form.isActive && (
                                                <Badge variant="outline" className="mt-1 text-[10px]">
                                                    Closed
                                                </Badge>
                                            )}
                                            {isOverdue(form, todayIso) && (
                                                <Badge className="mt-1 bg-rose-100 text-[10px] text-rose-800">
                                                    Past due
                                                </Badge>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm">{humanise(form.formType)}</td>
                                        <td className="px-4 py-3 text-sm">{humanise(form.audience)}</td>
                                        <td className="whitespace-nowrap px-4 py-3 text-sm">
                                            {formatDate(form.dueDate)}
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            <span className="font-medium">{form.responseCount}</span>{' '}
                                            received
                                            <div className="text-xs text-muted-foreground">
                                                {form.acceptedCount} agreed · {form.declinedCount} refused
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex justify-end gap-2">
                                                <Link
                                                    href={`/consent?formId=${form.id}`}
                                                    className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-muted"
                                                >
                                                    Replies
                                                </Link>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={pending}
                                                    onClick={() => toggleActive(form)}
                                                >
                                                    {form.isActive ? 'Close' : 'Reopen'}
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {forms.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                                            No consent forms yet. Create one to start recording replies.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {selectedForm && (
                <Card>
                    <CardContent className="space-y-6 pt-6">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-semibold">{selectedForm.title}</h2>
                                <p className="text-sm text-muted-foreground">
                                    {humanise(selectedForm.formType)} ·{' '}
                                    {humanise(selectedForm.audience)} · due{' '}
                                    {formatDate(selectedForm.dueDate)}
                                </p>
                            </div>
                            <Link
                                href="/consent"
                                className="text-sm text-primary hover:underline"
                            >
                                Close
                            </Link>
                        </div>

                        <div className="rounded-lg border p-4">
                            <h3 className="font-medium">Record a reply</h3>
                            <p className="mt-1 text-xs text-muted-foreground">
                                For slips returned to the office or consent given over the phone. A
                                second reply for the same student replaces the first.
                            </p>

                            <div className="mt-4 grid gap-4 md:grid-cols-2">
                                <div>
                                    <Label htmlFor="reply-search">Find student</Label>
                                    <Input
                                        id="reply-search"
                                        value={studentSearch}
                                        onChange={(event) => setStudentSearch(event.target.value)}
                                        placeholder="Name or admission number"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="reply-student">Student</Label>
                                    <select
                                        id="reply-student"
                                        value={studentId}
                                        onChange={(event) => setStudentId(event.target.value)}
                                        className="mt-1 h-9 w-full rounded-md border border-border px-3 text-sm"
                                    >
                                        <option value="">Select a student…</option>
                                        {studentChoices.map((student) => (
                                            <option key={student.id} value={student.id}>
                                                {student.name} · {student.className} ·{' '}
                                                {student.admissionNumber}
                                                {respondedIds.has(student.id) ? ' (already replied)' : ''}
                                            </option>
                                        ))}
                                    </select>
                                    {students.length === 0 && (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            No active students on record.
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <Label htmlFor="reply-respondent">Replying parent (optional)</Label>
                                    <Input
                                        id="reply-respondent"
                                        value={respondentName}
                                        onChange={(event) => setRespondentName(event.target.value)}
                                        placeholder="Name on the returned slip"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="reply-notes">Notes (optional)</Label>
                                    <Input
                                        id="reply-notes"
                                        value={replyNotes}
                                        onChange={(event) => setReplyNotes(event.target.value)}
                                        placeholder="Allergy noted, travelling separately, …"
                                    />
                                </div>
                            </div>

                            <div className="mt-4 flex gap-3">
                                <Button
                                    disabled={pending || !studentId || !selectedForm.isActive}
                                    onClick={() => saveReply('ACCEPTED')}
                                >
                                    Record consent
                                </Button>
                                <Button
                                    variant="outline"
                                    className="text-rose-600 hover:bg-rose-50"
                                    disabled={pending || !studentId || !selectedForm.isActive}
                                    onClick={() => saveReply('DECLINED')}
                                >
                                    Record refusal
                                </Button>
                            </div>
                            {!selectedForm.isActive && (
                                <p className="mt-2 text-xs text-amber-700">
                                    This form is closed. Reopen it to record further replies.
                                </p>
                            )}
                        </div>

                        <div className="overflow-x-auto rounded-lg border">
                            <table className="w-full">
                                <thead className="border-b bg-muted">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                                            Student
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                                            Replying parent
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                                            Reply
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                                            Recorded
                                        </th>
                                        <th className="px-4 py-3 text-right text-xs font-medium uppercase text-muted-foreground">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {responses.map((row) => (
                                        <tr key={row.id} className="hover:bg-muted">
                                            <td className="px-4 py-3">
                                                <div className="font-medium">{row.studentName}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    {row.className} · {row.admissionNumber}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-sm">
                                                {row.respondentName || '—'}
                                                {row.notes && (
                                                    <div className="text-xs text-muted-foreground">{row.notes}</div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span
                                                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                                        row.response === 'ACCEPTED'
                                                            ? 'bg-emerald-100 text-emerald-800'
                                                            : 'bg-rose-100 text-rose-800'
                                                    }`}
                                                >
                                                    {row.response === 'ACCEPTED' ? 'Agreed' : 'Refused'}
                                                </span>
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                                                {formatDateTime(row.respondedAt)}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="text-rose-600 hover:bg-rose-50"
                                                    disabled={pending}
                                                    onClick={() => removeReply(row)}
                                                >
                                                    {armedForDelete === row.id ? 'Confirm' : 'Remove'}
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                    {responses.length === 0 && (
                                        <tr>
                                            <td
                                                colSpan={5}
                                                className="px-4 py-10 text-center text-muted-foreground"
                                            >
                                                No replies recorded for this form yet.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function Tile({
    label,
    value,
    hint,
    tone = 'default',
}: {
    label: string;
    value: number;
    hint?: string;
    tone?: 'default' | 'good' | 'danger' | 'muted';
}) {
    const toneClass = {
        default: 'text-foreground',
        good: 'text-emerald-600',
        danger: 'text-rose-600',
        muted: 'text-muted-foreground',
    }[tone];

    return (
        <div className="rounded-lg border bg-card p-4">
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</div>
            {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
    );
}
