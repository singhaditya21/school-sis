'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { endAssignment, removeAssignment } from '../actions';
import type { RouteAssignmentView } from '../transport-constants';

interface AssignmentsTableProps {
    assignments: RouteAssignmentView[];
    canWrite: boolean;
}

function today(): string {
    return new Date().toISOString().split('T')[0];
}

export default function AssignmentsTable({ assignments, canWrite }: AssignmentsTableProps) {
    const router = useRouter();
    const [endTarget, setEndTarget] = useState<RouteAssignmentView | null>(null);
    const [endDate, setEndDate] = useState(today());
    const [removeTarget, setRemoveTarget] = useState<RouteAssignmentView | null>(null);
    const [busy, setBusy] = useState(false);

    const active = assignments.filter((a) => a.isActive).length;

    const openEnd = (assignment: RouteAssignmentView) => {
        setEndDate(today());
        setEndTarget(assignment);
    };

    const confirmEnd = async () => {
        if (!endTarget) return;
        setBusy(true);
        try {
            const result = await endAssignment(endTarget.id, endDate);
            if (result.success) {
                toast.success('Assignment closed.');
                setEndTarget(null);
                router.refresh();
            } else {
                toast.error(result.error || 'Could not close the assignment.');
            }
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Could not close the assignment.');
        } finally {
            setBusy(false);
        }
    };

    const confirmRemove = async () => {
        if (!removeTarget) return;
        setBusy(true);
        try {
            const result = await removeAssignment(removeTarget.id);
            if (result.success) {
                toast.success('Assignment deleted.');
                setRemoveTarget(null);
                router.refresh();
            } else {
                toast.error(result.error || 'Could not delete the assignment.');
            }
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Could not delete the assignment.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="bg-card rounded-xl shadow-sm border p-6">
            <h3 className="font-bold text-lg mb-4">
                Assigned Students ({assignments.length})
                {assignments.length > 0 && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">{active} riding today</span>
                )}
            </h3>
            {assignments.length === 0 ? (
                <p className="text-muted-foreground italic" data-testid="no-students-placeholder">
                    No students assigned to this route yet.
                </p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-muted">
                            <tr>
                                <th className="px-6 py-3 text-left font-medium text-muted-foreground uppercase tracking-wider">Student Name</th>
                                <th className="px-6 py-3 text-left font-medium text-muted-foreground uppercase tracking-wider">Student ID</th>
                                <th className="px-6 py-3 text-left font-medium text-muted-foreground uppercase tracking-wider">Stop Name</th>
                                <th className="px-6 py-3 text-left font-medium text-muted-foreground uppercase tracking-wider">Period</th>
                                <th className="px-6 py-3 text-left font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                                {canWrite && (
                                    <th className="px-6 py-3 text-right font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="bg-card divide-y divide-gray-200">
                            {assignments.map((row) => (
                                <tr key={row.id} data-testid="assigned-student-row" className={row.isActive ? '' : 'opacity-60'}>
                                    <td className="px-6 py-4 whitespace-nowrap font-medium text-foreground">
                                        {row.studentName}
                                        <div className="text-xs text-muted-foreground font-normal">
                                            {row.admissionNumber}
                                            {row.className ? ` · ${row.className}` : ''}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-muted-foreground font-mono text-xs">{row.studentId}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">{row.stopName}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-muted-foreground text-xs">
                                        {row.startDate} → {row.endDate || 'open'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <Badge className={row.isActive ? 'bg-green-100 text-green-700' : 'bg-muted text-foreground'}>
                                            {row.isActive ? 'Active' : 'Ended'}
                                        </Badge>
                                    </td>
                                    {canWrite && (
                                        <td className="px-6 py-4 whitespace-nowrap text-right">
                                            {row.isActive && (
                                                <button
                                                    type="button"
                                                    className="text-primary hover:underline mr-3"
                                                    onClick={() => openEnd(row)}
                                                    data-testid="end-assignment-btn"
                                                >
                                                    End
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                className="text-red-600 hover:underline"
                                                onClick={() => setRemoveTarget(row)}
                                                data-testid="remove-assignment-btn"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <Dialog open={endTarget !== null} onOpenChange={(open) => !open && setEndTarget(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>End this assignment</DialogTitle>
                        <DialogDescription>
                            The row is kept so the transport fee already raised for this student stays
                            explainable — it just stops counting from the end date.
                        </DialogDescription>
                    </DialogHeader>
                    <p className="text-sm font-medium">{endTarget?.studentName}</p>
                    <div>
                        <Label htmlFor="assignment-end-date">End date</Label>
                        <Input
                            id="assignment-end-date"
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            data-testid="end-assignment-date"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEndTarget(null)} disabled={busy}>
                            Cancel
                        </Button>
                        <Button onClick={confirmEnd} disabled={busy} data-testid="end-assignment-confirm">
                            {busy ? 'Saving…' : 'End assignment'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete this assignment?</DialogTitle>
                        <DialogDescription>
                            This erases the record entirely. Use it to undo a mistake — for a student who has
                            stopped using the bus, end the assignment instead so the fee history stays intact.
                        </DialogDescription>
                    </DialogHeader>
                    <p className="text-sm font-medium">{removeTarget?.studentName}</p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRemoveTarget(null)} disabled={busy}>
                            Cancel
                        </Button>
                        <Button onClick={confirmRemove} disabled={busy} data-testid="remove-assignment-confirm">
                            {busy ? 'Deleting…' : 'Delete'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
