'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    createAppointment,
    setAppointmentStatus,
    type AppointmentPerson,
    type AppointmentRow,
} from './actions';

const STATUS_STYLES: Record<string, string> = {
    scheduled: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
};

const FIELD = 'w-full p-2 border rounded text-sm bg-white';
const LABEL = 'block text-xs font-semibold text-gray-500 mb-1';

const EMPTY = {
    title: '',
    description: '',
    date: '',
    time: '',
    duration: '30',
    withUserId: '',
    type: '',
};

export default function AppointmentsClient({
    appointments,
    people,
    canWrite,
}: {
    appointments: AppointmentRow[];
    people: AppointmentPerson[];
    canWrite: boolean;
}) {
    const router = useRouter();
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(EMPTY);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const set = (field: keyof typeof EMPTY, value: string) =>
        setForm((prev) => ({ ...prev, [field]: value }));

    const handleCreate = () => {
        startTransition(async () => {
            const result = await createAppointment({
                title: form.title,
                description: form.description,
                date: form.date,
                time: form.time,
                duration: Number(form.duration),
                withUserId: form.withUserId || undefined,
                type: form.type,
            });
            if (!result.success) {
                toast.error(result.error ?? 'Could not book that appointment.');
                return;
            }
            toast.success('Appointment booked');
            setForm(EMPTY);
            setShowForm(false);
            router.refresh();
        });
    };

    const handleStatus = (appointment: AppointmentRow, status: string) => {
        setBusyId(appointment.id);
        startTransition(async () => {
            const result = await setAppointmentStatus(appointment.id, status);
            setBusyId(null);
            if (!result.success) {
                toast.error(result.error ?? 'Could not update that appointment.');
                return;
            }
            toast.success(`Marked ${status}`);
            router.refresh();
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold">Appointments</h1>
                    <p className="text-gray-600 mt-1">Manage meetings and appointments</p>
                </div>
                {canWrite && (
                    <Button
                        onClick={() => setShowForm((v) => !v)}
                        className="bg-blue-600 hover:bg-blue-700"
                        data-testid="toggle-appointment-form"
                    >
                        {showForm ? 'Close' : '+ New Appointment'}
                    </Button>
                )}
            </div>

            {canWrite && showForm && (
                <Card>
                    <CardHeader className="pb-3"><CardTitle className="text-lg">Book an appointment</CardTitle></CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="md:col-span-2">
                                    <label htmlFor="appt-title" className={LABEL}>Title</label>
                                    <input id="appt-title" className={FIELD} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Fee review with Mrs Rao" data-testid="appt-title" />
                                </div>
                                <div>
                                    <label htmlFor="appt-with" className={LABEL}>With</label>
                                    <select id="appt-with" className={FIELD} value={form.withUserId} onChange={(e) => set('withUserId', e.target.value)} data-testid="appt-with">
                                        <option value="">Not assigned</option>
                                        {people.map((p) => (
                                            <option key={p.id} value={p.id}>{p.name} — {p.role.replace(/_/g, ' ')}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="appt-date" className={LABEL}>Date</label>
                                    <input id="appt-date" type="date" className={FIELD} value={form.date} onChange={(e) => set('date', e.target.value)} data-testid="appt-date" />
                                </div>
                                <div>
                                    <label htmlFor="appt-time" className={LABEL}>Start time</label>
                                    <input id="appt-time" type="time" className={FIELD} value={form.time} onChange={(e) => set('time', e.target.value)} data-testid="appt-time" />
                                </div>
                                <div>
                                    <label htmlFor="appt-duration" className={LABEL}>Duration (minutes)</label>
                                    <input id="appt-duration" type="number" min="5" max="480" step="5" className={FIELD} value={form.duration} onChange={(e) => set('duration', e.target.value)} data-testid="appt-duration" />
                                </div>
                                <div>
                                    <label htmlFor="appt-type" className={LABEL}>Type (optional)</label>
                                    <input id="appt-type" className={FIELD} maxLength={50} value={form.type} onChange={(e) => set('type', e.target.value)} placeholder="e.g. parent meeting" data-testid="appt-type" />
                                </div>
                                <div className="md:col-span-2">
                                    <label htmlFor="appt-description" className={LABEL}>Notes (optional)</label>
                                    <input id="appt-description" className={FIELD} value={form.description} onChange={(e) => set('description', e.target.value)} data-testid="appt-description" />
                                </div>
                            </div>
                            <Button
                                onClick={handleCreate}
                                disabled={isPending || !form.title.trim() || !form.date || !form.time}
                                data-testid="appt-submit"
                            >
                                {isPending ? 'Booking…' : 'Book Appointment'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {appointments.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center text-gray-500" data-testid="no-appointments">
                        No appointments scheduled.
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {appointments.map((appt) => (
                        <Card key={appt.id} data-testid={`appointment-${appt.id}`}>
                            <CardHeader>
                                <CardTitle className="flex items-center justify-between gap-3 text-lg">
                                    <span>{appt.title}</span>
                                    <Badge className={STATUS_STYLES[appt.status] ?? 'bg-gray-100 text-gray-800'} data-testid={`appointment-status-${appt.id}`}>
                                        {appt.status}
                                    </Badge>
                                </CardTitle>
                                <p className="text-sm text-gray-500">
                                    {appt.date} at {appt.time} • {appt.duration} min
                                    {appt.type ? ` • ${appt.type}` : ''}
                                </p>
                            </CardHeader>
                            <CardContent>
                                {appt.description && <p className="text-gray-700 mb-2">{appt.description}</p>}
                                <p className="text-sm text-gray-500">
                                    With: <strong>{appt.with ?? 'Not assigned'}</strong>
                                </p>
                                {canWrite && appt.status === 'scheduled' && (
                                    <div className="flex gap-2 mt-4">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleStatus(appt, 'completed')}
                                            disabled={isPending && busyId === appt.id}
                                            data-testid={`appointment-complete-${appt.id}`}
                                        >
                                            Mark completed
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleStatus(appt, 'cancelled')}
                                            disabled={isPending && busyId === appt.id}
                                            data-testid={`appointment-cancel-${appt.id}`}
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
