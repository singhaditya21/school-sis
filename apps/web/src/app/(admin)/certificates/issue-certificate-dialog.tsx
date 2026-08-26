'use client';

import { useMemo, useState } from 'react';
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
import { issueCertificateAction } from './_lib/actions';
import type { CertificateTemplateItem, StudentOption } from './_lib/actions';
import { certificateTypeLabel } from './_lib/labels';

interface IssueCertificateDialogProps {
    templates: CertificateTemplateItem[];
    students: StudentOption[];
}

function todayIso(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export default function IssueCertificateDialog({ templates, students }: IssueCertificateDialogProps) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [templateId, setTemplateId] = useState('');
    const [studentId, setStudentId] = useState('');
    const [studentQuery, setStudentQuery] = useState('');
    const [issuedDate, setIssuedDate] = useState(todayIso());
    const [remarks, setRemarks] = useState('');

    const activeTemplates = useMemo(() => templates.filter(t => t.isActive), [templates]);

    const matchingStudents = useMemo(() => {
        const q = studentQuery.trim().toLowerCase();
        const pool = q
            ? students.filter(s =>
                  `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
                  s.admissionNumber.toLowerCase().includes(q))
            : students;
        return pool.slice(0, 100);
    }, [students, studentQuery]);

    const selectedStudent = students.find(s => s.id === studentId) ?? null;

    function reset() {
        setTemplateId('');
        setStudentId('');
        setStudentQuery('');
        setIssuedDate(todayIso());
        setRemarks('');
        setError(null);
    }

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!templateId) {
            setError('Pick the certificate template to issue against.');
            return;
        }
        if (!studentId) {
            setError('Pick the student this certificate is for.');
            return;
        }
        if (!issuedDate) {
            setError('An issue date is required.');
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            const result = await issueCertificateAction({
                templateId,
                studentId,
                issuedDate,
                remarks: remarks.trim() || undefined,
            });
            if (!result.success) {
                setError(result.error ?? 'Could not issue the certificate.');
                return;
            }
            reset();
            setOpen(false);
            toast.success(`Certificate ${result.certificateNumber} issued`);
            router.refresh();
        } catch {
            setError('Something went wrong while issuing. Please try again.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={next => { setOpen(next); if (!next) setError(null); }}>
            <DialogTrigger asChild>
                <Button disabled={activeTemplates.length === 0 || students.length === 0}>
                    Issue certificate
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Issue a certificate</DialogTitle>
                    <DialogDescription>
                        The certificate number is allocated automatically. The student&apos;s name,
                        admission number, class and date of birth are recorded as they stand today,
                        so the certificate does not change if the record changes later.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
                            {error}
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="issue-template">Template *</Label>
                        <select
                            id="issue-template"
                            value={templateId}
                            onChange={e => setTemplateId(e.target.value)}
                            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                            <option value="">Select a template…</option>
                            {activeTemplates.map(t => (
                                <option key={t.id} value={t.id}>
                                    {t.name} — {certificateTypeLabel(t.type)}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="issue-student-search">Student *</Label>
                        <Input
                            id="issue-student-search"
                            value={studentQuery}
                            onChange={e => setStudentQuery(e.target.value)}
                            placeholder="Filter by name or admission number…"
                        />
                        <select
                            id="issue-student"
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
                                    {s.status !== 'ACTIVE' ? ` · ${s.status}` : ''}
                                </option>
                            ))}
                        </select>
                        {studentQuery.trim() && matchingStudents.length === 0 && (
                            <p className="text-xs text-gray-500">No student matches that search.</p>
                        )}
                        {selectedStudent && selectedStudent.status !== 'ACTIVE' && (
                            <p className="text-xs text-amber-700">
                                {selectedStudent.firstName} {selectedStudent.lastName} is marked{' '}
                                {selectedStudent.status.toLowerCase()}.
                            </p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="issue-date">Issue date *</Label>
                        <Input
                            id="issue-date"
                            type="date"
                            value={issuedDate}
                            onChange={e => setIssuedDate(e.target.value)}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="issue-remarks">Remarks</Label>
                        <Textarea
                            id="issue-remarks"
                            value={remarks}
                            onChange={e => setRemarks(e.target.value)}
                            rows={2}
                            maxLength={1000}
                            placeholder="Optional — kept on the certificate record."
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={submitting}>
                            {submitting ? 'Issuing…' : 'Issue certificate'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
