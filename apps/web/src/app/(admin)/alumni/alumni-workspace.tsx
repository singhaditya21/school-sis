'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
    addAlumniEvent,
    addAlumniProfile,
    cancelAlumniRegistration,
    registerAlumniForEvent,
    setAlumniEventStatus,
    setAlumniVerified,
    type AlumniEventRow,
    type AlumniProfileRow,
} from './actions';
import { ALUMNI_EVENT_STATUSES, ALUMNI_EVENT_TYPES, EVENT_TYPE_LABELS } from './constants';

interface Props {
    alumni: AlumniProfileRow[];
    events: AlumniEventRow[];
    stats: { label: string; value: number; className: string }[];
}

const inputClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-blue-500 disabled:opacity-50';

const emptyAlumniForm = {
    name: '',
    email: '',
    batch: '',
    phone: '',
    graduationYear: '',
    currentCompany: '',
    designation: '',
    location: '',
    linkedIn: '',
};

const emptyEventForm = {
    title: '',
    date: '',
    type: 'REUNION',
    time: '',
    venue: '',
    maxCapacity: '',
    description: '',
};

const statusBadgeClass: Record<string, string> = {
    UPCOMING: 'bg-blue-100 text-blue-700',
    ONGOING: 'bg-amber-100 text-amber-700',
    COMPLETED: 'bg-gray-100 text-gray-600',
};

export default function AlumniWorkspace({ alumni, events, stats }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [tab, setTab] = useState<'directory' | 'events'>('directory');

    const [search, setSearch] = useState('');
    const [batch, setBatch] = useState('');
    const [verifiedFilter, setVerifiedFilter] = useState<'all' | 'verified' | 'pending'>('all');

    const [alumniForm, setAlumniForm] = useState(emptyAlumniForm);
    const [showAlumniDialog, setShowAlumniDialog] = useState(false);
    const [eventForm, setEventForm] = useState(emptyEventForm);
    const [showEventDialog, setShowEventDialog] = useState(false);
    const [registerFor, setRegisterFor] = useState<AlumniEventRow | null>(null);
    const [registerAlumniId, setRegisterAlumniId] = useState('');

    const batches = useMemo(
        () => [...new Set(alumni.map((a) => a.batch))].sort().reverse(),
        [alumni],
    );

    const filteredAlumni = useMemo(() => {
        const q = search.trim().toLowerCase();
        return alumni.filter((a) => {
            if (batch && a.batch !== batch) return false;
            if (verifiedFilter === 'verified' && !a.isVerified) return false;
            if (verifiedFilter === 'pending' && a.isVerified) return false;
            if (!q) return true;
            return [a.name, a.email, a.currentCompany, a.designation, a.location]
                .filter((v): v is string => Boolean(v))
                .some((v) => v.toLowerCase().includes(q));
        });
    }, [alumni, batch, search, verifiedFilter]);

    function handleAddAlumni() {
        startTransition(async () => {
            const result = await addAlumniProfile(alumniForm);
            if (result.success) {
                toast.success('Alumni record added.');
                setAlumniForm(emptyAlumniForm);
                setShowAlumniDialog(false);
                router.refresh();
            } else {
                toast.error(result.error || 'Could not add the alumni record.');
            }
        });
    }

    function handleVerify(alumnus: AlumniProfileRow) {
        startTransition(async () => {
            const result = await setAlumniVerified(alumnus.id, !alumnus.isVerified);
            if (result.success) {
                toast.success(alumnus.isVerified ? 'Verification removed.' : 'Alumnus verified.');
                router.refresh();
            } else {
                toast.error(result.error || 'Could not update the record.');
            }
        });
    }

    function handleAddEvent() {
        startTransition(async () => {
            const result = await addAlumniEvent(eventForm);
            if (result.success) {
                toast.success('Event created.');
                setEventForm(emptyEventForm);
                setShowEventDialog(false);
                router.refresh();
            } else {
                toast.error(result.error || 'Could not create the event.');
            }
        });
    }

    function handleEventStatus(eventId: string, status: string) {
        startTransition(async () => {
            const result = await setAlumniEventStatus(eventId, status);
            if (result.success) {
                toast.success('Event status updated.');
                router.refresh();
            } else {
                toast.error(result.error || 'Could not update the event.');
            }
        });
    }

    function handleRegister() {
        if (!registerFor || !registerAlumniId) return;
        startTransition(async () => {
            const result = await registerAlumniForEvent(registerFor.id, registerAlumniId);
            if (result.success) {
                toast.success('Registration added.');
                setRegisterAlumniId('');
                setRegisterFor(null);
                router.refresh();
            } else {
                toast.error(result.error || 'Could not register that alumnus.');
            }
        });
    }

    function handleCancelRegistration(eventId: string, alumniId: string) {
        startTransition(async () => {
            const result = await cancelAlumniRegistration(eventId, alumniId);
            if (result.success) {
                toast.success('Registration cancelled.');
                router.refresh();
            } else {
                toast.error(result.error || 'Could not cancel that registration.');
            }
        });
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold">Alumni Network</h1>
                    <p className="text-gray-600 mt-1">Alumni register, events and event registrations</p>
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => setShowAlumniDialog(true)}
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                    >
                        + Add alumnus
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowEventDialog(true)}
                        className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                        + New event
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                {stats.map((s) => (
                    <Card key={s.label}>
                        <CardContent className="pt-4">
                            <div className="text-sm text-gray-500">{s.label}</div>
                            <div className={`text-2xl font-bold ${s.className}`}>{s.value}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="flex gap-2 border-b">
                {(['directory', 'events'] as const).map((t) => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => setTab(t)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                            tab === t
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        {t === 'directory' ? `Directory (${alumni.length})` : `Events (${events.length})`}
                    </button>
                ))}
            </div>

            {tab === 'directory' ? (
                <Card>
                    <CardHeader className="gap-3">
                        <CardTitle>Alumni Register</CardTitle>
                        <div className="flex flex-wrap gap-3">
                            <input
                                type="search"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search name, email, employer…"
                                className={`${inputClass} sm:w-72`}
                            />
                            <select
                                value={batch}
                                onChange={(e) => setBatch(e.target.value)}
                                className={`${inputClass} sm:w-40`}
                                aria-label="Filter by batch"
                            >
                                <option value="">All batches</option>
                                {batches.map((b) => (
                                    <option key={b} value={b}>
                                        {b}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={verifiedFilter}
                                onChange={(e) =>
                                    setVerifiedFilter(e.target.value as 'all' | 'verified' | 'pending')
                                }
                                className={`${inputClass} sm:w-44`}
                                aria-label="Filter by verification"
                            >
                                <option value="all">All records</option>
                                <option value="verified">Verified only</option>
                                <option value="pending">Awaiting verification</option>
                            </select>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-y">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Verified</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {filteredAlumni.map((a) => (
                                        <tr key={a.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3">
                                                <div className="font-medium">{a.name}</div>
                                                <div className="text-xs text-gray-500">{a.email}</div>
                                                {a.linkedIn && (
                                                    <a
                                                        href={a.linkedIn}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs text-blue-600 hover:underline"
                                                    >
                                                        LinkedIn
                                                    </a>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 font-semibold">
                                                {a.batch}
                                                {a.graduationYear && (
                                                    <div className="text-xs font-normal text-gray-500">
                                                        Class of {a.graduationYear}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div>{a.currentCompany || '—'}</div>
                                                {a.designation && (
                                                    <div className="text-xs text-gray-500">{a.designation}</div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-sm">{a.location || '—'}</td>
                                            <td className="px-4 py-3 text-center">
                                                {a.isVerified ? (
                                                    <Badge className="bg-emerald-100 text-emerald-700">Verified</Badge>
                                                ) : (
                                                    <Badge variant="outline">Pending</Badge>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <button
                                                    type="button"
                                                    onClick={() => handleVerify(a)}
                                                    disabled={isPending}
                                                    className="px-3 py-1 text-xs border border-blue-200 text-blue-600 rounded hover:bg-blue-50 disabled:opacity-50"
                                                >
                                                    {a.isVerified ? 'Unverify' : 'Verify'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredAlumni.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                                                {alumni.length === 0
                                                    ? 'No alumni on the register yet.'
                                                    : 'No alumni match these filters.'}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {events.length === 0 && (
                        <Card>
                            <CardContent className="py-12 text-center text-gray-400">
                                No alumni events have been created yet.
                            </CardContent>
                        </Card>
                    )}
                    {events.map((event) => {
                        const full =
                            event.maxCapacity !== null && event.registeredCount >= event.maxCapacity;
                        return (
                            <Card key={event.id}>
                                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <CardTitle className="flex items-center gap-2">
                                            {event.title}
                                            <Badge variant="outline">
                                                {EVENT_TYPE_LABELS[event.type] || event.type}
                                            </Badge>
                                            <Badge className={statusBadgeClass[event.status] || 'bg-gray-100 text-gray-600'}>
                                                {event.status}
                                            </Badge>
                                        </CardTitle>
                                        <p className="text-sm text-gray-500 mt-1">
                                            {new Date(`${event.date}T00:00:00`).toLocaleDateString('en-IN', {
                                                day: 'numeric',
                                                month: 'short',
                                                year: 'numeric',
                                            })}
                                            {event.time ? ` • ${event.time}` : ''}
                                            {event.venue ? ` • ${event.venue}` : ''}
                                            {event.organizerName ? ` • Organiser ${event.organizerName}` : ''}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <select
                                            value={event.status}
                                            disabled={isPending}
                                            onChange={(e) => handleEventStatus(event.id, e.target.value)}
                                            className={`${inputClass} w-40`}
                                            aria-label={`Status for ${event.title}`}
                                        >
                                            {ALUMNI_EVENT_STATUSES.map((s) => (
                                                <option key={s} value={s}>
                                                    {s}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setRegisterFor(event);
                                                setRegisterAlumniId('');
                                            }}
                                            disabled={isPending || alumni.length === 0}
                                            className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                        >
                                            Register alumnus
                                        </button>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {event.description && (
                                        <p className="text-sm text-gray-600">{event.description}</p>
                                    )}
                                    <p className="text-sm">
                                        <span className="font-semibold">{event.registeredCount}</span>
                                        {event.maxCapacity !== null
                                            ? ` of ${event.maxCapacity} places taken`
                                            : ' registered (no capacity limit set)'}
                                        {full && <span className="text-amber-600 ml-2">Full</span>}
                                    </p>
                                    {event.registrants.length > 0 && (
                                        <ul className="flex flex-wrap gap-2">
                                            {event.registrants.map((r) => (
                                                <li
                                                    key={r.alumniId}
                                                    className="flex items-center gap-2 text-xs bg-gray-100 rounded-full pl-3 pr-1 py-1"
                                                >
                                                    <span>
                                                        {r.name} <span className="text-gray-500">({r.batch})</span>
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCancelRegistration(event.id, r.alumniId)}
                                                        disabled={isPending}
                                                        aria-label={`Cancel registration for ${r.name}`}
                                                        className="w-5 h-5 rounded-full text-gray-500 hover:bg-gray-200 disabled:opacity-50"
                                                    >
                                                        ×
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Add alumnus */}
            <Dialog open={showAlumniDialog} onOpenChange={setShowAlumniDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add an alumnus</DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="col-span-2">
                            <Label htmlFor="al-name">Name *</Label>
                            <Input
                                id="al-name"
                                value={alumniForm.name}
                                onChange={(e) => setAlumniForm({ ...alumniForm, name: e.target.value })}
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label htmlFor="al-email">Email *</Label>
                            <Input
                                id="al-email"
                                type="email"
                                value={alumniForm.email}
                                onChange={(e) => setAlumniForm({ ...alumniForm, email: e.target.value })}
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label htmlFor="al-phone">Phone</Label>
                            <Input
                                id="al-phone"
                                value={alumniForm.phone}
                                onChange={(e) => setAlumniForm({ ...alumniForm, phone: e.target.value })}
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label htmlFor="al-batch">Batch *</Label>
                            <Input
                                id="al-batch"
                                placeholder="e.g. 2018"
                                value={alumniForm.batch}
                                onChange={(e) => setAlumniForm({ ...alumniForm, batch: e.target.value })}
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label htmlFor="al-year">Graduation year</Label>
                            <Input
                                id="al-year"
                                inputMode="numeric"
                                placeholder="e.g. 2018"
                                value={alumniForm.graduationYear}
                                onChange={(e) =>
                                    setAlumniForm({ ...alumniForm, graduationYear: e.target.value })
                                }
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label htmlFor="al-company">Current company</Label>
                            <Input
                                id="al-company"
                                value={alumniForm.currentCompany}
                                onChange={(e) =>
                                    setAlumniForm({ ...alumniForm, currentCompany: e.target.value })
                                }
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label htmlFor="al-designation">Designation</Label>
                            <Input
                                id="al-designation"
                                value={alumniForm.designation}
                                onChange={(e) => setAlumniForm({ ...alumniForm, designation: e.target.value })}
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label htmlFor="al-location">Location</Label>
                            <Input
                                id="al-location"
                                value={alumniForm.location}
                                onChange={(e) => setAlumniForm({ ...alumniForm, location: e.target.value })}
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label htmlFor="al-linkedin">LinkedIn URL</Label>
                            <Input
                                id="al-linkedin"
                                value={alumniForm.linkedIn}
                                onChange={(e) => setAlumniForm({ ...alumniForm, linkedIn: e.target.value })}
                                className="mt-1"
                            />
                        </div>
                        <div className="col-span-2 flex justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowAlumniDialog(false)}
                                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleAddAlumni}
                                disabled={isPending}
                                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                            >
                                Add to register
                            </button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* New event */}
            <Dialog open={showEventDialog} onOpenChange={setShowEventDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>New alumni event</DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="col-span-2">
                            <Label htmlFor="ev-title">Title *</Label>
                            <Input
                                id="ev-title"
                                value={eventForm.title}
                                onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label htmlFor="ev-date">Date *</Label>
                            <Input
                                id="ev-date"
                                type="date"
                                value={eventForm.date}
                                onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })}
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label htmlFor="ev-time">Time</Label>
                            <Input
                                id="ev-time"
                                placeholder="e.g. 6:00 PM"
                                value={eventForm.time}
                                onChange={(e) => setEventForm({ ...eventForm, time: e.target.value })}
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label htmlFor="ev-type">Type *</Label>
                            <select
                                id="ev-type"
                                value={eventForm.type}
                                onChange={(e) => setEventForm({ ...eventForm, type: e.target.value })}
                                className={`${inputClass} mt-1`}
                            >
                                {ALUMNI_EVENT_TYPES.map((t) => (
                                    <option key={t.value} value={t.value}>
                                        {t.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <Label htmlFor="ev-capacity">Capacity</Label>
                            <Input
                                id="ev-capacity"
                                inputMode="numeric"
                                value={eventForm.maxCapacity}
                                onChange={(e) => setEventForm({ ...eventForm, maxCapacity: e.target.value })}
                                className="mt-1"
                            />
                        </div>
                        <div className="col-span-2">
                            <Label htmlFor="ev-venue">Venue</Label>
                            <Input
                                id="ev-venue"
                                value={eventForm.venue}
                                onChange={(e) => setEventForm({ ...eventForm, venue: e.target.value })}
                                className="mt-1"
                            />
                        </div>
                        <div className="col-span-2">
                            <Label htmlFor="ev-description">Description</Label>
                            <textarea
                                id="ev-description"
                                rows={3}
                                value={eventForm.description}
                                onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                                className={`${inputClass} mt-1`}
                            />
                        </div>
                        <div className="col-span-2 flex justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowEventDialog(false)}
                                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleAddEvent}
                                disabled={isPending}
                                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                            >
                                Create event
                            </button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Register alumnus for event */}
            <Dialog
                open={registerFor !== null}
                onOpenChange={(open) => {
                    if (!open) setRegisterFor(null);
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Register for {registerFor?.title}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                        <div>
                            <Label htmlFor="reg-alumnus">Alumnus</Label>
                            <select
                                id="reg-alumnus"
                                value={registerAlumniId}
                                onChange={(e) => setRegisterAlumniId(e.target.value)}
                                className={`${inputClass} mt-1`}
                            >
                                <option value="">Select an alumnus</option>
                                {alumni
                                    .filter(
                                        (a) =>
                                            !registerFor?.registrants.some((r) => r.alumniId === a.id),
                                    )
                                    .map((a) => (
                                        <option key={a.id} value={a.id}>
                                            {a.name} — {a.batch}
                                        </option>
                                    ))}
                            </select>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setRegisterFor(null)}
                                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleRegister}
                                disabled={isPending || !registerAlumniId}
                                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                            >
                                Register
                            </button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
