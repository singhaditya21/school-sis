'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

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
import { Textarea } from '@/components/ui/textarea';

import { deleteRoute, updateRoute } from '../actions';

interface RouteEditorProps {
    routeId: string;
    initial: {
        name: string;
        description: string;
        vehicleId: string;
        morningDepartureTime: string;
        afternoonDepartureTime: string;
        monthlyFee: string;
    };
    vehicles: { id: string; vehicleNumber: string; driverName: string }[];
    assignmentCount: number;
}

export default function RouteEditor({ routeId, initial, vehicles, assignmentCount }: RouteEditorProps) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [form, setForm] = useState(initial);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (open) setForm(initial);
    }, [open, initial]);

    const set = (key: keyof typeof initial, value: string) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        try {
            const result = await updateRoute(routeId, form);
            if (result.success) {
                toast.success('Route updated.');
                setOpen(false);
                router.refresh();
            } else {
                toast.error(result.error || 'Could not update the route.');
            }
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Could not update the route.');
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async () => {
        setBusy(true);
        try {
            const result = await deleteRoute(routeId);
            if (result.success) {
                toast.success('Route deleted.');
                router.push('/transport');
                router.refresh();
            } else {
                toast.error(result.error || 'Could not delete the route.');
                setBusy(false);
            }
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Could not delete the route.');
            setBusy(false);
        }
    };

    return (
        <>
            <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-testid="edit-route-btn">
                    Edit route
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600"
                    onClick={() => setConfirmDelete(true)}
                    data-testid="delete-route-btn"
                >
                    Delete
                </Button>
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit route</DialogTitle>
                        <DialogDescription>
                            Departure times are 24-hour HH:MM. The monthly fee is in rupees and is what gets
                            invoiced when a student is assigned.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSave} className="space-y-4">
                        <div>
                            <Label htmlFor="route-name">Route name *</Label>
                            <Input
                                id="route-name"
                                value={form.name}
                                onChange={(e) => set('name', e.target.value)}
                                data-testid="edit-route-name-input"
                                required
                            />
                        </div>
                        <div>
                            <Label htmlFor="route-vehicle">Vehicle *</Label>
                            <select
                                id="route-vehicle"
                                value={form.vehicleId}
                                onChange={(e) => set('vehicleId', e.target.value)}
                                className="w-full p-2 border rounded text-sm bg-white"
                                data-testid="edit-route-vehicle-select"
                            >
                                {vehicles.map((v) => (
                                    <option key={v.id} value={v.id}>
                                        {v.vehicleNumber} — {v.driverName}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="route-morning">Morning departure</Label>
                                <Input
                                    id="route-morning"
                                    placeholder="07:00"
                                    value={form.morningDepartureTime}
                                    onChange={(e) => set('morningDepartureTime', e.target.value)}
                                />
                            </div>
                            <div>
                                <Label htmlFor="route-afternoon">Afternoon departure</Label>
                                <Input
                                    id="route-afternoon"
                                    placeholder="15:00"
                                    value={form.afternoonDepartureTime}
                                    onChange={(e) => set('afternoonDepartureTime', e.target.value)}
                                />
                            </div>
                        </div>
                        <div>
                            <Label htmlFor="route-fee">Monthly fee (₹)</Label>
                            <Input
                                id="route-fee"
                                value={form.monthlyFee}
                                onChange={(e) => set('monthlyFee', e.target.value)}
                                placeholder="e.g. 1500"
                            />
                        </div>
                        <div>
                            <Label htmlFor="route-description">Description</Label>
                            <Textarea
                                id="route-description"
                                value={form.description}
                                onChange={(e) => set('description', e.target.value)}
                                rows={2}
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={busy} data-testid="edit-route-save-btn">
                                {busy ? 'Saving…' : 'Save changes'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete this route?</DialogTitle>
                        <DialogDescription>
                            {assignmentCount > 0
                                ? `${assignmentCount} student assignment${assignmentCount === 1 ? '' : 's'} still reference this route — remove them before deleting.`
                                : 'The route and its stops are removed permanently.'}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={busy}>
                            Cancel
                        </Button>
                        <Button onClick={handleDelete} disabled={busy || assignmentCount > 0} data-testid="delete-route-confirm">
                            {busy ? 'Deleting…' : 'Delete route'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
