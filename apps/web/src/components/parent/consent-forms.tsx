'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { respondToConsentForm, type ChildConsentForm } from '@/app/(parent)/actions';

/**
 * Consent forms for ONE child. The student id is passed down from the server
 * page, which already resolved it against this guardian's own children, and it
 * is checked again inside the action before anything is written.
 */
export function ConsentForms({
    forms,
    studentId,
    studentName,
}: {
    forms: ChildConsentForm[];
    studentId: string;
    studentName: string;
}) {
    const [pending, startTransition] = useTransition();
    const [busyFormId, setBusyFormId] = useState<string | null>(null);
    const [openNoteFor, setOpenNoteFor] = useState<string | null>(null);
    const [note, setNote] = useState('');

    const open = forms.filter((f) => f.isActive);
    const closed = forms.filter((f) => !f.isActive);
    const awaiting = open.filter((f) => !f.response);

    function submit(formId: string, response: 'ACCEPTED' | 'DECLINED') {
        setBusyFormId(formId);
        const notes = openNoteFor === formId ? note : undefined;

        startTransition(async () => {
            const result = await respondToConsentForm({ formId, studentId, response, notes });
            setBusyFormId(null);
            if (result.success) {
                setOpenNoteFor(null);
                setNote('');
                toast.success(
                    response === 'ACCEPTED'
                        ? `Consent recorded for ${studentName}.`
                        : `Declined on behalf of ${studentName}.`,
                );
            } else {
                toast.error(result.error ?? 'Could not record your response.');
            }
        });
    }

    if (forms.length === 0) {
        return (
            <div className="rounded-xl border border-dashed bg-white p-12 text-center text-slate-500">
                <p className="font-medium text-slate-600">No consent forms</p>
                <p className="mt-1 text-sm">The school has not published any forms for parents yet.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <section>
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-slate-900">Open forms</h2>
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                        {awaiting.length} awaiting your answer
                    </span>
                </div>

                {open.length === 0 ? (
                    <div className="rounded-lg border border-dashed bg-white p-8 text-center text-slate-500">
                        No forms are open at the moment.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {open.map((form) => {
                            const busy = pending && busyFormId === form.id;
                            const noteOpen = openNoteFor === form.id;

                            return (
                                <div
                                    key={form.id}
                                    data-testid="consent-form-card"
                                    className={`rounded-xl border bg-white p-5 shadow-sm ${
                                        form.response ? 'border-slate-200' : 'border-amber-200'
                                    }`}
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <div className="mb-1 flex flex-wrap items-center gap-2">
                                                <h3 className="font-semibold text-slate-900">{form.title}</h3>
                                                <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-600">
                                                    {form.formType}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-500">
                                                For {studentName}
                                                {form.dueDate ? ` · due ${form.dueDate}` : ' · no deadline'}
                                            </p>
                                        </div>
                                        {form.response && (
                                            <span
                                                className={`rounded px-2 py-1 text-xs font-bold ${
                                                    form.response === 'ACCEPTED'
                                                        ? 'bg-emerald-100 text-emerald-700'
                                                        : 'bg-red-100 text-red-700'
                                                }`}
                                            >
                                                {form.response}
                                            </span>
                                        )}
                                    </div>

                                    {form.description && (
                                        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                                            <p className="whitespace-pre-line text-sm text-slate-600">
                                                {form.description}
                                            </p>
                                        </div>
                                    )}

                                    {form.response && (
                                        <p className="mt-3 text-xs text-slate-500">
                                            Answered {form.respondedAt ? form.respondedAt.slice(0, 10) : ''}
                                            {form.respondentName ? ` by ${form.respondentName}` : ''}
                                            {form.notes ? ` — “${form.notes}”` : ''}
                                        </p>
                                    )}

                                    {noteOpen && (
                                        <textarea
                                            value={note}
                                            onChange={(e) => setNote(e.target.value)}
                                            maxLength={2000}
                                            rows={3}
                                            placeholder="Optional note for the school"
                                            className="mt-4 w-full rounded-lg border border-slate-200 p-3 text-sm focus:border-slate-400 focus:outline-none"
                                        />
                                    )}

                                    <div className="mt-4 flex flex-wrap items-center gap-2">
                                        <Button
                                            size="sm"
                                            disabled={busy}
                                            onClick={() => submit(form.id, 'ACCEPTED')}
                                            className="bg-emerald-600 text-white hover:bg-emerald-700"
                                        >
                                            {busy ? 'Saving…' : form.response === 'ACCEPTED' ? 'Keep accepted' : 'Accept'}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={busy}
                                            onClick={() => submit(form.id, 'DECLINED')}
                                            className="border-red-200 text-red-700 hover:bg-red-50"
                                        >
                                            {busy ? 'Saving…' : form.response === 'DECLINED' ? 'Keep declined' : 'Decline'}
                                        </Button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setOpenNoteFor(noteOpen ? null : form.id);
                                                setNote('');
                                            }}
                                            className="text-xs font-medium text-slate-500 hover:text-slate-800"
                                        >
                                            {noteOpen ? 'Remove note' : 'Add a note'}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            <section>
                <h2 className="mb-3 text-lg font-semibold text-slate-900">Closed forms</h2>
                {closed.length === 0 ? (
                    <p className="text-sm text-slate-500">No closed forms.</p>
                ) : (
                    <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
                        <table className="w-full text-left text-sm">
                            <thead className="border-b border-slate-200 bg-slate-50/50 text-xs font-semibold uppercase text-slate-500">
                                <tr>
                                    <th className="px-6 py-3">Form</th>
                                    <th className="px-6 py-3">Answered</th>
                                    <th className="px-6 py-3">By</th>
                                    <th className="px-6 py-3 text-center">Response</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {closed.map((form) => (
                                    <tr key={form.id}>
                                        <td className="px-6 py-4 font-medium text-slate-900">{form.title}</td>
                                        <td className="px-6 py-4 text-slate-500">
                                            {form.respondedAt ? form.respondedAt.slice(0, 10) : 'No response'}
                                        </td>
                                        <td className="px-6 py-4 text-slate-500">{form.respondentName ?? '—'}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span
                                                className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                                                    form.response === 'ACCEPTED'
                                                        ? 'bg-emerald-100 text-emerald-700'
                                                        : form.response === 'DECLINED'
                                                          ? 'bg-red-100 text-red-700'
                                                          : 'bg-slate-100 text-slate-500'
                                                }`}
                                            >
                                                {form.response ?? 'NOT ANSWERED'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}
