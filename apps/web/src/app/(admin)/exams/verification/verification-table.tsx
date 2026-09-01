'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { discardResults, lockResults } from '../_actions/verification';
import type { PendingResultRow } from '../_actions/verification';

interface Props {
    rows: PendingResultRow[];
    truncated: boolean;
}

export function VerificationTable({ rows, truncated }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [confirmDiscard, setConfirmDiscard] = useState(false);

    const toggle = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const allSelected = rows.length > 0 && selected.size === rows.length;

    const handleVerify = () => {
        const ids = Array.from(selected);
        startTransition(async () => {
            const result = await lockResults(ids);
            if (!result.success) {
                toast.error(result.error || 'Failed to verify results');
                return;
            }
            toast.success(`${result.affected} result(s) verified and locked`);
            setSelected(new Set());
            router.refresh();
        });
    };

    const handleDiscard = () => {
        const ids = Array.from(selected);
        startTransition(async () => {
            const result = await discardResults(ids);
            setConfirmDiscard(false);
            if (!result.success) {
                toast.error(result.error || 'Failed to send results back');
                return;
            }
            toast.success(`${result.affected} result(s) deleted — they must be re-entered`);
            setSelected(new Set());
            router.refresh();
        });
    };

    if (rows.length === 0) {
        return (
            <div className="bg-card rounded-xl shadow-sm border p-8 text-center">
                <p className="font-medium text-foreground">Nothing awaiting verification</p>
                <p className="text-sm text-muted-foreground mt-1">
                    Every saved result for this selection has already been verified and locked.
                </p>
            </div>
        );
    }

    return (
        <div className="bg-card rounded-xl shadow-sm border">
            <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="font-semibold text-foreground">Awaiting verification</h2>
                    <p className="text-sm text-muted-foreground">
                        {rows.length} result(s) shown{truncated && ' (first 200)'} ·{' '}
                        {selected.size} selected
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={handleVerify} disabled={selected.size === 0 || isPending}>
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Verify &amp; lock
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={() => setConfirmDiscard(true)}
                        disabled={selected.size === 0 || isPending}
                    >
                        <Undo2 className="h-4 w-4 mr-2" />
                        Send back
                    </Button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-12">
                                <input
                                    type="checkbox"
                                    aria-label="Select all"
                                    checked={allSelected}
                                    onChange={(e) =>
                                        setSelected(
                                            e.target.checked
                                                ? new Set(rows.map((r) => r.resultId))
                                                : new Set(),
                                        )
                                    }
                                />
                            </TableHead>
                            <TableHead>Student</TableHead>
                            <TableHead>Class</TableHead>
                            <TableHead>Exam</TableHead>
                            <TableHead>Subject</TableHead>
                            <TableHead>Marks</TableHead>
                            <TableHead>Grade</TableHead>
                            <TableHead>Entered by</TableHead>
                            <TableHead>Entered</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((row) => (
                            <TableRow key={row.resultId}>
                                <TableCell>
                                    <input
                                        type="checkbox"
                                        aria-label={`Select ${row.studentName} ${row.subjectName}`}
                                        checked={selected.has(row.resultId)}
                                        onChange={() => toggle(row.resultId)}
                                    />
                                </TableCell>
                                <TableCell>
                                    <p className="font-medium">{row.studentName}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {row.admissionNumber}
                                    </p>
                                </TableCell>
                                <TableCell>{row.className}</TableCell>
                                <TableCell>{row.examName}</TableCell>
                                <TableCell>{row.subjectName}</TableCell>
                                <TableCell>
                                    {row.isAbsent ? (
                                        <Badge variant="outline" className="bg-red-50 text-red-700">
                                            Absent
                                        </Badge>
                                    ) : (
                                        <span
                                            className={
                                                (row.marksObtained ?? 0) < row.passingMarks
                                                    ? 'font-semibold text-red-600'
                                                    : 'font-semibold'
                                            }
                                        >
                                            {row.marksObtained ?? '—'}
                                            <span className="text-muted-foreground font-normal">
                                                /{row.maxMarks}
                                            </span>
                                        </span>
                                    )}
                                </TableCell>
                                <TableCell>{row.grade ?? '—'}</TableCell>
                                <TableCell>{row.enteredBy ?? '—'}</TableCell>
                                <TableCell>{row.enteredAt ?? '—'}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Send {selected.size} result(s) back?</DialogTitle>
                        <DialogDescription>
                            This schema has no rejection ledger: sending a result back deletes the
                            saved mark so it has to be entered again. This cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmDiscard(false)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleDiscard} disabled={isPending}>
                            Delete marks
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
