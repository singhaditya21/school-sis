'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { recordStudentDocumentAction } from './_lib/actions';
import type { DocumentStudentOption } from './_lib/actions';
import { COMMON_DOCUMENT_TYPES } from './_lib/labels';

const OTHER = '__OTHER__';

interface UploadDocumentDialogProps {
    students: DocumentStudentOption[];
    knownTypes: string[];
}

interface UploadResponse {
    error?: string;
    data?: { url?: string };
}

export default function UploadDocumentDialog({ students, knownTypes }: UploadDocumentDialogProps) {
    const router = useRouter();
    const fileRef = useRef<HTMLInputElement>(null);
    const [open, setOpen] = useState(false);
    const [studentId, setStudentId] = useState('');
    const [studentQuery, setStudentQuery] = useState('');
    const [typeChoice, setTypeChoice] = useState<string>(COMMON_DOCUMENT_TYPES[0]);
    const [customType, setCustomType] = useState('');
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const typeOptions = useMemo(() => {
        const set = new Set<string>(COMMON_DOCUMENT_TYPES);
        knownTypes.forEach(t => set.add(t));
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [knownTypes]);

    const matchingStudents = useMemo(() => {
        const q = studentQuery.trim().toLowerCase();
        const pool = q
            ? students.filter(s =>
                  `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
                  s.admissionNumber.toLowerCase().includes(q))
            : students;
        return pool.slice(0, 100);
    }, [students, studentQuery]);

    function reset() {
        setStudentId('');
        setStudentQuery('');
        setTypeChoice(COMMON_DOCUMENT_TYPES[0]);
        setCustomType('');
        setNotes('');
        setError(null);
        if (fileRef.current) fileRef.current.value = '';
    }

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const file = fileRef.current?.files?.[0];
        const documentType = typeChoice === OTHER ? customType.trim() : typeChoice;

        if (!studentId) {
            setError('Pick the student this document belongs to.');
            return;
        }
        if (!documentType) {
            setError('Name the kind of document this is.');
            return;
        }
        if (!file) {
            setError('Choose a file to upload.');
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            const form = new FormData();
            form.append('file', file);
            form.append('folder', 'documents');

            const response = await fetch('/api/upload', { method: 'POST', body: form });
            const payload = (await response.json().catch(() => ({}))) as UploadResponse;

            if (!response.ok || !payload.data?.url) {
                setError(
                    payload.error ??
                        'The file could not be stored. Document storage may not be configured for this school.'
                );
                return;
            }

            const result = await recordStudentDocumentAction({
                studentId,
                documentType,
                fileName: file.name,
                fileUrl: payload.data.url,
                fileSize: file.size,
                mimeType: file.type,
                notes: notes.trim() || undefined,
            });
            if (!result.success) {
                setError(result.error ?? 'The file uploaded, but the record could not be saved.');
                return;
            }

            reset();
            setOpen(false);
            toast.success('Document uploaded');
            router.refresh();
        } catch {
            setError('Something went wrong during the upload. Please try again.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={next => { setOpen(next); if (!next) setError(null); }}>
            <DialogTrigger asChild>
                <Button disabled={students.length === 0}>Upload document</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Upload a student document</DialogTitle>
                    <DialogDescription>
                        PDF, Word, Excel or image files up to 10 MB. The file is stored against this
                        school only, and starts unverified until someone checks it.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
                            {error}
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="doc-student-search">Student *</Label>
                        <Input
                            id="doc-student-search"
                            value={studentQuery}
                            onChange={e => setStudentQuery(e.target.value)}
                            placeholder="Filter by name or admission number…"
                        />
                        <select
                            aria-label="Student"
                            value={studentId}
                            onChange={e => setStudentId(e.target.value)}
                            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                            <option value="">Select a student…</option>
                            {matchingStudents.map(s => (
                                <option key={s.id} value={s.id}>
                                    {s.firstName} {s.lastName} · {s.admissionNumber}
                                    {s.gradeName ? ` · ${s.gradeName}${s.sectionName ? `-${s.sectionName}` : ''}` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="doc-type">Document type *</Label>
                        <select
                            id="doc-type"
                            value={typeChoice}
                            onChange={e => setTypeChoice(e.target.value)}
                            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                            {typeOptions.map(t => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                            <option value={OTHER}>Other…</option>
                        </select>
                        {typeChoice === OTHER && (
                            <Input
                                aria-label="Document type"
                                value={customType}
                                onChange={e => setCustomType(e.target.value)}
                                maxLength={100}
                                placeholder="Name this document type"
                            />
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="doc-file">File *</Label>
                        <Input
                            id="doc-file"
                            type="file"
                            ref={fileRef}
                            accept=".pdf,.doc,.docx,.xls,.xlsx,image/jpeg,image/png,image/webp,image/gif"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="doc-notes">Notes</Label>
                        <Textarea
                            id="doc-notes"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            rows={2}
                            maxLength={2000}
                            placeholder="Optional — e.g. original seen, copy retained."
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={submitting}>
                            {submitting ? 'Uploading…' : 'Upload'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
