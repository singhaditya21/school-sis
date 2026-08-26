'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { createPeriod, deletePeriod } from '../_actions/grid';

interface PeriodRow {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    displayOrder: number;
    isBreak: boolean;
    entryCount: number;
}

export default function PeriodManager({ periods }: { periods: PeriodRow[] }) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [pendingDelete, setPendingDelete] = useState<PeriodRow | null>(null);

    const nextOrder = periods.length > 0 ? Math.max(...periods.map((p) => p.displayOrder)) + 1 : 1;
    const [name, setName] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [displayOrder, setDisplayOrder] = useState(String(nextOrder));
    const [isBreak, setIsBreak] = useState(false);

    function handleCreate(event: React.FormEvent) {
        event.preventDefault();
        setError('');
        setMessage('');
        startTransition(async () => {
            const result = await createPeriod({
                name,
                startTime,
                endTime,
                displayOrder: Number(displayOrder),
                isBreak,
            });
            if (!result.success) {
                setError(result.error ?? 'Could not create this period.');
                return;
            }
            setMessage(`Added ${name}.`);
            setName('');
            setStartTime('');
            setEndTime('');
            setDisplayOrder(String(Number(displayOrder) + 1));
            setIsBreak(false);
            router.refresh();
        });
    }

    function handleDelete() {
        if (!pendingDelete) return;
        const target = pendingDelete;
        setError('');
        setMessage('');
        startTransition(async () => {
            const result = await deletePeriod(target.id);
            if (!result.success) {
                setError(result.error ?? 'Could not delete this period.');
                setPendingDelete(null);
                return;
            }
            setMessage(`Deleted ${target.name}.`);
            setPendingDelete(null);
            router.refresh();
        });
    }

    return (
        <div className="space-y-6">
            {error && (
                <div data-testid="period-error" className="p-3 bg-red-50 border border-red-300 text-red-700 rounded-lg text-sm">
                    {error}
                </div>
            )}
            {message && (
                <div data-testid="period-message" className="p-3 bg-green-50 border border-green-300 text-green-800 rounded-lg text-sm">
                    {message}
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Add a period</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                        <div className="md:col-span-2">
                            <Label htmlFor="period-name">Name</Label>
                            <Input
                                id="period-name"
                                data-testid="period-name-input"
                                value={name}
                                maxLength={50}
                                onChange={(event) => setName(event.target.value)}
                                placeholder="Period 1 / Lunch / Assembly"
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label htmlFor="period-start">Start</Label>
                            <Input
                                id="period-start"
                                data-testid="period-start-input"
                                type="time"
                                value={startTime}
                                onChange={(event) => setStartTime(event.target.value)}
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label htmlFor="period-end">End</Label>
                            <Input
                                id="period-end"
                                data-testid="period-end-input"
                                type="time"
                                value={endTime}
                                onChange={(event) => setEndTime(event.target.value)}
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label htmlFor="period-order">Order</Label>
                            <Input
                                id="period-order"
                                data-testid="period-order-input"
                                type="number"
                                min={1}
                                max={30}
                                value={displayOrder}
                                onChange={(event) => setDisplayOrder(event.target.value)}
                                className="mt-1"
                            />
                        </div>
                        <div className="md:col-span-4 flex items-center gap-2">
                            <input
                                id="period-break"
                                data-testid="period-break-checkbox"
                                type="checkbox"
                                checked={isBreak}
                                onChange={(event) => setIsBreak(event.target.checked)}
                            />
                            <Label htmlFor="period-break" className="cursor-pointer">
                                This is a break (lunch, assembly) — no subjects can be scheduled in it
                            </Label>
                        </div>
                        <div>
                            <Button type="submit" data-testid="period-submit-btn" disabled={isPending}>
                                {isPending ? 'Saving…' : 'Add period'}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Daily schedule ({periods.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {periods.length === 0 ? (
                        <p data-testid="periods-empty" className="text-gray-500 text-center py-8">
                            No periods yet. Add the first one above — the weekly grid has no rows until then.
                        </p>
                    ) : (
                        <Table data-testid="periods-table">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Order</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Time</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Scheduled entries</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {periods.map((period) => (
                                    <TableRow key={period.id} data-testid={`period-row-${period.displayOrder}`}>
                                        <TableCell>{period.displayOrder}</TableCell>
                                        <TableCell className="font-medium">{period.name}</TableCell>
                                        <TableCell>{period.startTime} – {period.endTime}</TableCell>
                                        <TableCell>{period.isBreak ? 'Break' : 'Teaching'}</TableCell>
                                        <TableCell>{period.entryCount}</TableCell>
                                        <TableCell>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                data-testid={`period-delete-${period.displayOrder}`}
                                                onClick={() => { setError(''); setPendingDelete(period); }}
                                            >
                                                Delete
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Dialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete period</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2 text-sm">
                        <p>
                            Delete <strong>{pendingDelete?.name}</strong> from the daily schedule? This cannot be undone.
                        </p>
                        {pendingDelete && pendingDelete.entryCount > 0 && (
                            <p className="text-amber-700">
                                {pendingDelete.entryCount} timetable {pendingDelete.entryCount === 1 ? 'entry uses' : 'entries use'} this period and must be cleared from the grid first.
                            </p>
                        )}
                        <div className="flex justify-end gap-3">
                            <Button type="button" variant="outline" onClick={() => setPendingDelete(null)}>Cancel</Button>
                            <Button
                                type="button"
                                variant="destructive"
                                data-testid="period-delete-confirm"
                                disabled={isPending}
                                onClick={handleDelete}
                            >
                                {isPending ? 'Deleting…' : 'Delete'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
