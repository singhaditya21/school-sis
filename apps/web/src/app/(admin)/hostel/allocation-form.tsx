'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import {
    allocateBed,
    type HostelDirectoryRow,
    type HostelStudentOption,
    type RoomOption,
} from './actions';

const EMPTY = {
    studentId: '',
    hostelId: '',
    roomId: '',
    bedNumber: '',
    allocatedFrom: '',
    allocatedTo: '',
};

type FormState = typeof EMPTY;

const FIELD_CLASS =
    'w-full p-2 border rounded text-sm bg-card disabled:bg-muted disabled:text-muted-foreground';

export default function AllocationForm({
    hostels,
    rooms,
    students,
}: {
    hostels: HostelDirectoryRow[];
    rooms: RoomOption[];
    students: HostelStudentOption[];
}) {
    const router = useRouter();
    const [form, setForm] = useState<FormState>(EMPTY);
    const [isPending, startTransition] = useTransition();

    const set = (field: keyof FormState, value: string) =>
        setForm((prev) => {
            const next = { ...prev, [field]: value };
            // Changing hostel invalidates the room and bed choice below it.
            if (field === 'hostelId') {
                next.roomId = '';
                next.bedNumber = '';
            }
            if (field === 'roomId') {
                next.bedNumber = '';
            }
            return next;
        });

    const roomsForHostel = useMemo(
        () => rooms.filter((r) => r.hostelId === form.hostelId),
        [rooms, form.hostelId],
    );

    const selectedRoom = useMemo(
        () => rooms.find((r) => r.id === form.roomId) ?? null,
        [rooms, form.roomId],
    );

    const canSubmit =
        Boolean(form.studentId && form.hostelId && form.roomId && form.bedNumber.trim() && form.allocatedFrom && form.allocatedTo) &&
        !isPending;

    const handleSubmit = () => {
        startTransition(async () => {
            const result = await allocateBed({ ...form, bedNumber: form.bedNumber.trim() });
            if (!result.success) {
                toast.error(result.error ?? 'Allocation failed.');
                return;
            }
            toast.success('Bed allocated');
            setForm(EMPTY);
            router.refresh();
        });
    };

    if (hostels.length === 0) {
        return (
            <Card>
                <CardContent className="p-6">
                    <h3 className="font-bold text-lg mb-2">Allocate Student</h3>
                    <p className="text-sm text-muted-foreground" data-testid="allocate-no-hostels">
                        No active hostel is set up for this school yet, so there is nothing to allocate against.
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardContent className="p-6">
                <h3 className="font-bold text-lg mb-1">Allocate Student</h3>
                <p className="text-xs text-muted-foreground mb-4">
                    Allocating a bed also raises a hostel fee record for the student at this release&apos;s
                    fixed rate of ₹15,000 — it is not yet driven by a fee plan.
                </p>
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        <div>
                            <label htmlFor="alloc-student" className="block text-xs font-semibold text-muted-foreground mb-1">Student</label>
                            <select
                                id="alloc-student"
                                value={form.studentId}
                                onChange={(e) => set('studentId', e.target.value)}
                                className={FIELD_CLASS}
                                data-testid="alloc-student-id"
                            >
                                <option value="">
                                    {students.length === 0 ? 'Every active student is already allocated' : 'Select student…'}
                                </option>
                                {students.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.name} — {s.admissionNumber}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="alloc-hostel" className="block text-xs font-semibold text-muted-foreground mb-1">Hostel</label>
                            <select
                                id="alloc-hostel"
                                value={form.hostelId}
                                onChange={(e) => set('hostelId', e.target.value)}
                                className={FIELD_CLASS}
                                data-testid="alloc-hostel-id"
                            >
                                <option value="">Select hostel…</option>
                                {hostels.map((h) => (
                                    <option key={h.id} value={h.id}>{h.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="alloc-room" className="block text-xs font-semibold text-muted-foreground mb-1">Room</label>
                            <select
                                id="alloc-room"
                                value={form.roomId}
                                onChange={(e) => set('roomId', e.target.value)}
                                className={FIELD_CLASS}
                                disabled={!form.hostelId}
                                data-testid="alloc-room-id"
                            >
                                <option value="">
                                    {!form.hostelId
                                        ? 'Pick a hostel first'
                                        : roomsForHostel.length === 0
                                            ? 'No rooms recorded'
                                            : 'Select room…'}
                                </option>
                                {roomsForHostel.map((r) => (
                                    <option
                                        key={r.id}
                                        value={r.id}
                                        disabled={r.status === 'MAINTENANCE' || r.occupiedBeds >= r.totalBeds}
                                    >
                                        {r.roomNumber} · floor {r.floor} · {r.occupiedBeds}/{r.totalBeds}
                                        {r.status === 'MAINTENANCE' ? ' · maintenance' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="alloc-bed" className="block text-xs font-semibold text-muted-foreground mb-1">Bed No.</label>
                            <input
                                id="alloc-bed"
                                type="text"
                                maxLength={10}
                                value={form.bedNumber}
                                onChange={(e) => set('bedNumber', e.target.value)}
                                placeholder="e.g. A"
                                className={FIELD_CLASS}
                                disabled={!form.roomId}
                                data-testid="alloc-bed-number"
                            />
                            {selectedRoom && selectedRoom.takenBedNumbers.length > 0 && (
                                <p className="text-[11px] text-muted-foreground mt-1">
                                    Taken: {selectedRoom.takenBedNumbers.join(', ')}
                                </p>
                            )}
                        </div>
                        <div>
                            <label htmlFor="alloc-from" className="block text-xs font-semibold text-muted-foreground mb-1">From Date</label>
                            <input
                                id="alloc-from"
                                type="date"
                                value={form.allocatedFrom}
                                onChange={(e) => set('allocatedFrom', e.target.value)}
                                className={FIELD_CLASS}
                                data-testid="alloc-from"
                            />
                        </div>
                        <div>
                            <label htmlFor="alloc-to" className="block text-xs font-semibold text-muted-foreground mb-1">To Date</label>
                            <input
                                id="alloc-to"
                                type="date"
                                value={form.allocatedTo}
                                onChange={(e) => set('allocatedTo', e.target.value)}
                                className={FIELD_CLASS}
                                data-testid="alloc-to"
                            />
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                        data-testid="allocate-submit-btn"
                    >
                        {isPending ? 'Allocating…' : 'Allocate Bed'}
                    </button>
                </div>
            </CardContent>
        </Card>
    );
}
