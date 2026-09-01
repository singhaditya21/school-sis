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

import { createStop, deleteStop, moveStop, updateStop } from '../actions';
import type { StopView } from '../transport-constants';

interface StopsManagerProps {
    routeId: string;
    stops: StopView[];
    canWrite: boolean;
}

interface StopFormState {
    name: string;
    address: string;
    pickupTime: string;
    dropTime: string;
    latitude: string;
    longitude: string;
}

const EMPTY_STOP: StopFormState = {
    name: '',
    address: '',
    pickupTime: '',
    dropTime: '',
    latitude: '',
    longitude: '',
};

function toFormState(stop: StopView | null): StopFormState {
    if (!stop) return { ...EMPTY_STOP };
    return {
        name: stop.name ?? '',
        address: stop.address ?? '',
        pickupTime: stop.pickupTime ?? '',
        dropTime: stop.dropTime ?? '',
        latitude: stop.latitude ?? '',
        longitude: stop.longitude ?? '',
    };
}

export default function StopsManager({ routeId, stops, canWrite }: StopsManagerProps) {
    const router = useRouter();
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<StopView | null>(null);
    const [form, setForm] = useState<StopFormState>({ ...EMPTY_STOP });
    const [saving, setSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<StopView | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [movingId, setMovingId] = useState<string | null>(null);

    useEffect(() => {
        if (formOpen) setForm(toFormState(editing));
    }, [formOpen, editing]);

    const set = (key: keyof StopFormState, value: string) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const openCreate = () => {
        setEditing(null);
        setFormOpen(true);
    };

    const openEdit = (stop: StopView) => {
        setEditing(stop);
        setFormOpen(true);
    };

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        try {
            const result = editing ? await updateStop(editing.id, form) : await createStop(routeId, form);
            if (result.success) {
                toast.success(editing ? 'Stop updated.' : 'Stop added.');
                setFormOpen(false);
                router.refresh();
            } else {
                toast.error(result.error || 'Could not save the stop.');
            }
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Could not save the stop.');
        } finally {
            setSaving(false);
        }
    };

    const handleMove = async (stop: StopView, direction: 'up' | 'down') => {
        setMovingId(stop.id);
        try {
            const result = await moveStop(stop.id, direction);
            if (result.success) {
                router.refresh();
            } else {
                toast.error(result.error || 'Could not reorder the stop.');
            }
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Could not reorder the stop.');
        } finally {
            setMovingId(null);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            const result = await deleteStop(deleteTarget.id);
            if (result.success) {
                toast.success('Stop removed.');
                setDeleteTarget(null);
                router.refresh();
            } else {
                toast.error(result.error || 'Could not remove the stop.');
            }
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Could not remove the stop.');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="bg-card rounded-xl shadow-sm border p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg">Stops ({stops.length})</h3>
                {canWrite && (
                    <Button size="sm" onClick={openCreate} data-testid="add-stop-btn">
                        + Add Stop
                    </Button>
                )}
            </div>

            {stops.length === 0 ? (
                <p className="text-muted-foreground italic">No stops configured for this route.</p>
            ) : (
                <div className="space-y-3">
                    {stops.map((stop, index) => (
                        <div
                            key={stop.id}
                            className="flex justify-between items-start border-b pb-3 last:border-0"
                            data-testid="stop-item"
                        >
                            <div className="flex gap-3">
                                <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold flex items-center justify-center shrink-0">
                                    {index + 1}
                                </div>
                                <div>
                                    <p className="font-semibold text-sm">{stop.name}</p>
                                    {stop.address && <p className="text-xs text-muted-foreground">{stop.address}</p>}
                                    <p className="text-xs text-muted-foreground">
                                        Pickup {stop.pickupTime || '—'} · Drop {stop.dropTime || '—'}
                                    </p>
                                    {stop.assignmentCount > 0 && (
                                        <p className="text-xs text-muted-foreground">
                                            {stop.assignmentCount} assignment{stop.assignmentCount === 1 ? '' : 's'}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                                {canWrite ? (
                                    <>
                                        <button
                                            type="button"
                                            className="px-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                                            onClick={() => handleMove(stop, 'up')}
                                            disabled={index === 0 || movingId === stop.id}
                                            aria-label={`Move ${stop.name} earlier`}
                                        >
                                            ↑
                                        </button>
                                        <button
                                            type="button"
                                            className="px-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                                            onClick={() => handleMove(stop, 'down')}
                                            disabled={index === stops.length - 1 || movingId === stop.id}
                                            aria-label={`Move ${stop.name} later`}
                                        >
                                            ↓
                                        </button>
                                        <button
                                            type="button"
                                            className="text-primary hover:underline"
                                            onClick={() => openEdit(stop)}
                                            data-testid="edit-stop-btn"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            className="text-red-600 hover:underline"
                                            onClick={() => setDeleteTarget(stop)}
                                            data-testid="delete-stop-btn"
                                        >
                                            Delete
                                        </button>
                                    </>
                                ) : (
                                    <span className="text-muted-foreground">Order: {stop.displayOrder}</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Dialog open={formOpen} onOpenChange={setFormOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Edit stop' : 'Add stop'}</DialogTitle>
                        <DialogDescription>
                            Times are 24-hour HH:MM. New stops are appended to the end of the run — use the
                            arrows to put them in road order.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSave} className="space-y-4">
                        <div>
                            <Label htmlFor="stop-name">Stop name *</Label>
                            <Input
                                id="stop-name"
                                value={form.name}
                                onChange={(e) => set('name', e.target.value)}
                                data-testid="stop-name-input"
                                required
                            />
                        </div>
                        <div>
                            <Label htmlFor="stop-address">Address</Label>
                            <Textarea
                                id="stop-address"
                                value={form.address}
                                onChange={(e) => set('address', e.target.value)}
                                rows={2}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="stop-pickup">Pickup time</Label>
                                <Input
                                    id="stop-pickup"
                                    placeholder="07:15"
                                    value={form.pickupTime}
                                    onChange={(e) => set('pickupTime', e.target.value)}
                                    data-testid="stop-pickup-input"
                                />
                            </div>
                            <div>
                                <Label htmlFor="stop-drop">Drop time</Label>
                                <Input
                                    id="stop-drop"
                                    placeholder="15:10"
                                    value={form.dropTime}
                                    onChange={(e) => set('dropTime', e.target.value)}
                                    data-testid="stop-drop-input"
                                />
                            </div>
                            <div>
                                <Label htmlFor="stop-lat">Latitude</Label>
                                <Input
                                    id="stop-lat"
                                    value={form.latitude}
                                    onChange={(e) => set('latitude', e.target.value)}
                                    placeholder="28.4595"
                                />
                            </div>
                            <div>
                                <Label htmlFor="stop-lng">Longitude</Label>
                                <Input
                                    id="stop-lng"
                                    value={form.longitude}
                                    onChange={(e) => set('longitude', e.target.value)}
                                    placeholder="77.0266"
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={saving} data-testid="stop-save-btn">
                                {saving ? 'Saving…' : editing ? 'Save changes' : 'Add stop'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Remove this stop?</DialogTitle>
                        <DialogDescription>
                            A stop that any student assignment points at cannot be removed.
                        </DialogDescription>
                    </DialogHeader>
                    <p className="text-sm font-medium">{deleteTarget?.name}</p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                            Cancel
                        </Button>
                        <Button onClick={handleDelete} disabled={deleting} data-testid="delete-stop-confirm">
                            {deleting ? 'Removing…' : 'Remove stop'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
