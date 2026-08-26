'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

import { createVehicle, deleteVehicle, updateVehicle } from '../actions';
import { VEHICLE_TYPES, type VehicleView } from '../transport-constants';

interface VehiclesManagerProps {
    vehicles: VehicleView[];
    canWrite: boolean;
}

interface VehicleFormState {
    vehicleNumber: string;
    type: string;
    capacity: string;
    driverName: string;
    driverPhone: string;
    driverLicense: string;
    conductorName: string;
    conductorPhone: string;
    insuranceExpiry: string;
    fitnessExpiry: string;
    gpsDeviceId: string;
}

const EMPTY: VehicleFormState = {
    vehicleNumber: '',
    type: 'Bus',
    capacity: '40',
    driverName: '',
    driverPhone: '',
    driverLicense: '',
    conductorName: '',
    conductorPhone: '',
    insuranceExpiry: '',
    fitnessExpiry: '',
    gpsDeviceId: '',
};

function toFormState(vehicle: VehicleView | null): VehicleFormState {
    if (!vehicle) return { ...EMPTY };
    return {
        vehicleNumber: vehicle.vehicleNumber ?? '',
        type: vehicle.type ?? 'Bus',
        capacity: String(vehicle.capacity ?? 40),
        driverName: vehicle.driverName ?? '',
        driverPhone: vehicle.driverPhone ?? '',
        driverLicense: vehicle.driverLicense ?? '',
        conductorName: vehicle.conductorName ?? '',
        conductorPhone: vehicle.conductorPhone ?? '',
        insuranceExpiry: vehicle.insuranceExpiry ?? '',
        fitnessExpiry: vehicle.fitnessExpiry ?? '',
        gpsDeviceId: vehicle.gpsDeviceId ?? '',
    };
}

/** An expiry that has passed, or falls inside the next 30 days, is worth flagging. */
function expiryTone(value: string | null): string {
    if (!value) return 'text-gray-400';
    const soon = new Date();
    soon.setDate(soon.getDate() + 30);
    const asDate = new Date(`${value}T00:00:00`);
    if (Number.isNaN(asDate.getTime())) return 'text-gray-400';
    if (asDate < new Date()) return 'text-red-600 font-semibold';
    if (asDate < soon) return 'text-orange-600 font-semibold';
    return 'text-gray-600';
}

export default function VehiclesManager({ vehicles, canWrite }: VehiclesManagerProps) {
    const router = useRouter();
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<VehicleView | null>(null);
    const [form, setForm] = useState<VehicleFormState>({ ...EMPTY });
    const [busy, setBusy] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<VehicleView | null>(null);

    useEffect(() => {
        if (formOpen) setForm(toFormState(editing));
    }, [formOpen, editing]);

    const set = (key: keyof VehicleFormState, value: string) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const openCreate = () => {
        setEditing(null);
        setFormOpen(true);
    };

    const openEdit = (vehicle: VehicleView) => {
        setEditing(vehicle);
        setFormOpen(true);
    };

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        try {
            const result = editing ? await updateVehicle(editing.id, form) : await createVehicle(form);
            if (result.success) {
                toast.success(editing ? 'Vehicle updated.' : 'Vehicle added.');
                setFormOpen(false);
                router.refresh();
            } else {
                toast.error(result.error || 'Could not save the vehicle.');
            }
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Could not save the vehicle.');
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setBusy(true);
        try {
            const result = await deleteVehicle(deleteTarget.id);
            if (result.success) {
                toast.success('Vehicle removed.');
                setDeleteTarget(null);
                router.refresh();
            } else {
                toast.error(result.error || 'Could not remove the vehicle.');
            }
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Could not remove the vehicle.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            {canWrite && (
                <div className="flex justify-end">
                    <Button onClick={openCreate} data-testid="add-vehicle-btn">
                        + Add Vehicle
                    </Button>
                </div>
            )}

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-gray-50">
                            <TableRow>
                                <TableHead className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Vehicle</TableHead>
                                <TableHead className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Driver</TableHead>
                                <TableHead className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Conductor</TableHead>
                                <TableHead className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Seats</TableHead>
                                <TableHead className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Routes</TableHead>
                                <TableHead className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Compliance</TableHead>
                                {canWrite && (
                                    <TableHead className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</TableHead>
                                )}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {vehicles.map((vehicle) => (
                                <TableRow key={vehicle.id} data-testid="vehicle-row">
                                    <TableCell className="px-4 py-3">
                                        <div className="font-medium">{vehicle.vehicleNumber}</div>
                                        <div className="text-xs text-gray-500">{vehicle.type}</div>
                                        {vehicle.gpsDeviceId && (
                                            <div className="text-xs text-gray-400">GPS {vehicle.gpsDeviceId}</div>
                                        )}
                                    </TableCell>
                                    <TableCell className="px-4 py-3 text-sm">
                                        {vehicle.driverName}
                                        <div className="text-xs text-gray-500">{vehicle.driverPhone}</div>
                                        {vehicle.driverLicense && (
                                            <div className="text-xs text-gray-400">Licence {vehicle.driverLicense}</div>
                                        )}
                                    </TableCell>
                                    <TableCell className="px-4 py-3 text-sm">
                                        {vehicle.conductorName || '—'}
                                        {vehicle.conductorPhone && (
                                            <div className="text-xs text-gray-500">{vehicle.conductorPhone}</div>
                                        )}
                                    </TableCell>
                                    <TableCell className="px-4 py-3 text-center">
                                        <span
                                            className={`font-semibold ${
                                                vehicle.assignedStudents > vehicle.capacity ? 'text-red-600' : 'text-gray-900'
                                            }`}
                                        >
                                            {vehicle.assignedStudents}/{vehicle.capacity}
                                        </span>
                                    </TableCell>
                                    <TableCell className="px-4 py-3 text-center">
                                        <Badge variant="outline" className="border-transparent bg-blue-100 text-blue-700">
                                            {vehicle.routeCount}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="px-4 py-3 text-xs">
                                        <div className={expiryTone(vehicle.insuranceExpiry)}>
                                            Insurance: {vehicle.insuranceExpiry || 'not recorded'}
                                        </div>
                                        <div className={expiryTone(vehicle.fitnessExpiry)}>
                                            Fitness: {vehicle.fitnessExpiry || 'not recorded'}
                                        </div>
                                    </TableCell>
                                    {canWrite && (
                                        <TableCell className="px-4 py-3 text-right whitespace-nowrap">
                                            <button
                                                type="button"
                                                className="text-blue-600 hover:underline text-sm mr-3"
                                                onClick={() => openEdit(vehicle)}
                                                data-testid="edit-vehicle-btn"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                type="button"
                                                className="text-red-600 hover:underline text-sm"
                                                onClick={() => setDeleteTarget(vehicle)}
                                                data-testid="delete-vehicle-btn"
                                            >
                                                Delete
                                            </button>
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))}
                            {vehicles.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={canWrite ? 7 : 6} className="px-4 py-12 text-center text-gray-400">
                                        No vehicles recorded yet.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={formOpen} onOpenChange={setFormOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Edit vehicle' : 'Add vehicle'}</DialogTitle>
                        <DialogDescription>
                            Expiry dates are YYYY-MM-DD and are shown on this list so an out-of-date fitness
                            certificate is visible before the bus leaves.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSave} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="vehicle-number">Vehicle number *</Label>
                                <Input
                                    id="vehicle-number"
                                    value={form.vehicleNumber}
                                    onChange={(e) => set('vehicleNumber', e.target.value)}
                                    placeholder="e.g. HR26-DK-1234"
                                    data-testid="vehicle-number-field"
                                    required
                                />
                            </div>
                            <div>
                                <Label htmlFor="vehicle-type">Type</Label>
                                <select
                                    id="vehicle-type"
                                    value={form.type}
                                    onChange={(e) => set('type', e.target.value)}
                                    className="w-full h-10 px-3 border rounded-md text-sm bg-white"
                                >
                                    {VEHICLE_TYPES.map((t) => (
                                        <option key={t} value={t}>
                                            {t}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <Label htmlFor="vehicle-capacity">Capacity *</Label>
                                <Input
                                    id="vehicle-capacity"
                                    type="number"
                                    min={1}
                                    value={form.capacity}
                                    onChange={(e) => set('capacity', e.target.value)}
                                    data-testid="vehicle-capacity-field"
                                    required
                                />
                            </div>
                            <div>
                                <Label htmlFor="vehicle-gps">GPS device id</Label>
                                <Input
                                    id="vehicle-gps"
                                    value={form.gpsDeviceId}
                                    onChange={(e) => set('gpsDeviceId', e.target.value)}
                                />
                            </div>
                            <div>
                                <Label htmlFor="vehicle-driver">Driver name *</Label>
                                <Input
                                    id="vehicle-driver"
                                    value={form.driverName}
                                    onChange={(e) => set('driverName', e.target.value)}
                                    data-testid="vehicle-driver-field"
                                    required
                                />
                            </div>
                            <div>
                                <Label htmlFor="vehicle-driver-phone">Driver phone *</Label>
                                <Input
                                    id="vehicle-driver-phone"
                                    value={form.driverPhone}
                                    onChange={(e) => set('driverPhone', e.target.value)}
                                    placeholder="+91 9876543210"
                                    data-testid="vehicle-driver-phone-field"
                                    required
                                />
                            </div>
                            <div>
                                <Label htmlFor="vehicle-licence">Driver licence</Label>
                                <Input
                                    id="vehicle-licence"
                                    value={form.driverLicense}
                                    onChange={(e) => set('driverLicense', e.target.value)}
                                />
                            </div>
                            <div>
                                <Label htmlFor="vehicle-conductor">Conductor name</Label>
                                <Input
                                    id="vehicle-conductor"
                                    value={form.conductorName}
                                    onChange={(e) => set('conductorName', e.target.value)}
                                />
                            </div>
                            <div>
                                <Label htmlFor="vehicle-conductor-phone">Conductor phone</Label>
                                <Input
                                    id="vehicle-conductor-phone"
                                    value={form.conductorPhone}
                                    onChange={(e) => set('conductorPhone', e.target.value)}
                                />
                            </div>
                            <div>
                                <Label htmlFor="vehicle-insurance">Insurance expiry</Label>
                                <Input
                                    id="vehicle-insurance"
                                    type="date"
                                    value={form.insuranceExpiry}
                                    onChange={(e) => set('insuranceExpiry', e.target.value)}
                                />
                            </div>
                            <div>
                                <Label htmlFor="vehicle-fitness">Fitness expiry</Label>
                                <Input
                                    id="vehicle-fitness"
                                    type="date"
                                    value={form.fitnessExpiry}
                                    onChange={(e) => set('fitnessExpiry', e.target.value)}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={busy}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={busy} data-testid="vehicle-save-btn">
                                {busy ? 'Saving…' : editing ? 'Save changes' : 'Add vehicle'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Remove this vehicle?</DialogTitle>
                        <DialogDescription>
                            A vehicle that still serves a route cannot be removed — move those routes to
                            another vehicle first.
                        </DialogDescription>
                    </DialogHeader>
                    <p className="text-sm font-medium">{deleteTarget?.vehicleNumber}</p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={busy}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleDelete}
                            disabled={busy || (deleteTarget?.routeCount ?? 0) > 0}
                            data-testid="delete-vehicle-confirm"
                        >
                            {busy ? 'Removing…' : 'Remove vehicle'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
