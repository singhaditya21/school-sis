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
import { applyLeave } from '@/lib/actions/hr';
import type { StaffListItem } from '@/lib/actions/hr';
import { LEAVE_TYPE_OPTIONS, inclusiveDays, leaveTypeLabel } from '../labels';

interface RecordLeaveDialogProps {
    staff: StaffListItem[];
}

export default function RecordLeaveDialog({ staff }: RecordLeaveDialogProps) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [staffId, setStaffId] = useState('');
    const [leaveType, setLeaveType] = useState<string>('CL');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [totalDays, setTotalDays] = useState('');
    const [reason, setReason] = useState('');

    const suggestedDays = useMemo(() => inclusiveDays(fromDate, toDate), [fromDate, toDate]);
    const effectiveDays = totalDays !== '' ? Number(totalDays) : suggestedDays;

    function reset() {
        setStaffId('');
        setLeaveType('CL');
        setFromDate('');
        setToDate('');
        setTotalDays('');
        setReason('');
        setError(null);
    }

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!staffId) {
            setError('Pick the staff member this leave is for.');
            return;
        }
        if (!fromDate || !toDate) {
            setError('Both the start and end date are required.');
            return;
        }
        if (toDate < fromDate) {
            setError('The end date cannot be before the start date.');
            return;
        }
        if (!Number.isFinite(effectiveDays) || effectiveDays <= 0) {
            setError('Total days must be greater than zero.');
            return;
        }
        if (!reason.trim()) {
            setError('A reason is required.');
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            const result = await applyLeave({
                staffId,
                leaveType,
                fromDate,
                toDate,
                totalDays: effectiveDays,
                reason: reason.trim(),
            });
            if (!result.success) {
                setError(result.error ?? 'Could not record the leave request.');
                return;
            }
            reset();
            setOpen(false);
            toast.success('Leave request recorded');
            router.refresh();
        } catch {
            setError('Something went wrong while saving. Please try again.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={next => { setOpen(next); if (!next) setError(null); }}
        >
            <DialogTrigger asChild>
                <Button disabled={staff.length === 0}>Record leave request</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Record leave request</DialogTitle>
                    <DialogDescription>
                        Logs a request on a staff member&apos;s behalf. It starts as pending and still
                        needs an approval decision below.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
                            {error}
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="leave-staff">Staff member *</Label>
                        <select
                            id="leave-staff"
                            value={staffId}
                            onChange={e => setStaffId(e.target.value)}
                            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                            <option value="">Select a staff member…</option>
                            {staff.map(s => (
                                <option key={s.id} value={s.id}>
                                    {s.firstName} {s.lastName} ({s.employeeId})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="leave-type">Leave type *</Label>
                        <select
                            id="leave-type"
                            value={leaveType}
                            onChange={e => setLeaveType(e.target.value)}
                            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                            {LEAVE_TYPE_OPTIONS.map(t => (
                                <option key={t} value={t}>{leaveTypeLabel(t)}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="leave-from">From *</Label>
                            <Input
                                id="leave-from"
                                type="date"
                                value={fromDate}
                                onChange={e => setFromDate(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="leave-to">To *</Label>
                            <Input
                                id="leave-to"
                                type="date"
                                value={toDate}
                                onChange={e => setToDate(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="leave-days">Total days *</Label>
                            <Input
                                id="leave-days"
                                type="number"
                                min="0.5"
                                step="0.5"
                                max="999"
                                value={totalDays}
                                placeholder={suggestedDays > 0 ? String(suggestedDays) : ''}
                                onChange={e => setTotalDays(e.target.value)}
                            />
                        </div>
                    </div>
                    {suggestedDays > 0 && totalDays === '' && (
                        <p className="text-xs text-gray-500">
                            Defaults to {suggestedDays} calendar {suggestedDays === 1 ? 'day' : 'days'};
                            override for half days or to exclude holidays.
                        </p>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="leave-reason">Reason *</Label>
                        <Textarea
                            id="leave-reason"
                            rows={3}
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder="e.g. Medical appointment"
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={submitting}>
                            {submitting ? 'Saving…' : 'Record request'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
