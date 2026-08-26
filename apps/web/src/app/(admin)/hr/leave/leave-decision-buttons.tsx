'use client';

import { useState, useTransition } from 'react';
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
} from '@/components/ui/dialog';
import { approveLeave, rejectLeave } from '@/lib/actions/hr';

interface LeaveDecisionButtonsProps {
    leaveId: string;
    staffName: string;
}

export default function LeaveDecisionButtons({ leaveId, staffName }: LeaveDecisionButtonsProps) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [rejectOpen, setRejectOpen] = useState(false);
    const [reason, setReason] = useState('');
    const [rejecting, setRejecting] = useState(false);
    const [rejectError, setRejectError] = useState<string | null>(null);

    function handleApprove() {
        startTransition(async () => {
            try {
                const result = await approveLeave(leaveId);
                if (!result.success) {
                    toast.error(result.error ?? 'Could not approve the request.');
                    return;
                }
                toast.success(`Leave approved for ${staffName}`);
                router.refresh();
            } catch {
                toast.error('Something went wrong. Please try again.');
            }
        });
    }

    async function handleReject(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const trimmed = reason.trim();
        if (!trimmed) {
            setRejectError('Please give a reason so the staff member knows why.');
            return;
        }

        setRejecting(true);
        setRejectError(null);
        try {
            const result = await rejectLeave(leaveId, trimmed);
            if (!result.success) {
                setRejectError(result.error ?? 'Could not reject the request.');
                return;
            }
            setRejectOpen(false);
            setReason('');
            toast.success(`Leave rejected for ${staffName}`);
            router.refresh();
        } catch {
            setRejectError('Something went wrong. Please try again.');
        } finally {
            setRejecting(false);
        }
    }

    return (
        <>
            <div className="flex justify-end gap-2">
                <Button size="sm" onClick={handleApprove} disabled={pending || rejecting}>
                    {pending ? 'Approving…' : 'Approve'}
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setRejectError(null); setRejectOpen(true); }}
                    disabled={pending || rejecting}
                >
                    Reject
                </Button>
            </div>

            <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Reject leave request</DialogTitle>
                        <DialogDescription>
                            The reason is stored on the request and shown to {staffName}.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleReject} className="space-y-4">
                        {rejectError && (
                            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
                                {rejectError}
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <Label htmlFor={`reject-reason-${leaveId}`}>Reason *</Label>
                            <Textarea
                                id={`reject-reason-${leaveId}`}
                                value={reason}
                                onChange={e => setReason(e.target.value)}
                                rows={3}
                                placeholder="e.g. Exam week — please reapply for a later date."
                            />
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setRejectOpen(false)}
                                disabled={rejecting}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" variant="destructive" disabled={rejecting}>
                                {rejecting ? 'Rejecting…' : 'Reject request'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
