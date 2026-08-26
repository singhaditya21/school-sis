'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
import { revokeCertificateAction } from './_lib/actions';

interface RevokeCertificateDialogProps {
    certificateId: string;
    certificateNumber: string;
    studentName: string | null;
    /** Rendered as the trigger; defaults to a small destructive button. */
    triggerLabel?: string;
}

export default function RevokeCertificateDialog({
    certificateId,
    certificateNumber,
    studentName,
    triggerLabel = 'Revoke',
}: RevokeCertificateDialogProps) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!reason.trim()) {
            setError('A reason is required — it is kept on the record permanently.');
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            const result = await revokeCertificateAction({ certificateId, reason: reason.trim() });
            if (!result.success) {
                setError(result.error ?? 'Could not revoke this certificate.');
                return;
            }
            setReason('');
            setOpen(false);
            toast.success(`${certificateNumber} revoked`);
            router.refresh();
        } catch {
            setError('Something went wrong while revoking. Please try again.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={next => { setOpen(next); if (!next) setError(null); }}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 hover:text-red-700">
                    {triggerLabel}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Revoke {certificateNumber}</DialogTitle>
                    <DialogDescription>
                        {studentName ? `Issued to ${studentName}. ` : ''}
                        Revocation cannot be undone. The certificate stays on the register, marked
                        revoked, with the reason and timestamp recorded.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
                            {error}
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor={`revoke-reason-${certificateId}`}>Reason *</Label>
                        <Textarea
                            id={`revoke-reason-${certificateId}`}
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            rows={3}
                            maxLength={1000}
                            placeholder="e.g. Issued against the wrong student record."
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                            Cancel
                        </Button>
                        <Button type="submit" variant="destructive" disabled={submitting}>
                            {submitting ? 'Revoking…' : 'Revoke certificate'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
