'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
    logHealthIncident,
    type ImmunizationDueRow,
    type MedicalAlertRow,
    type StudentOption,
} from './actions';

type Incident = {
    id: string;
    studentName: string | null;
    type: string;
    description: string;
    actionTaken: string | null;
    incidentDate: string;
    parentNotified: boolean;
};

type HealthStats = {
    studentsWithRecords: number;
    totalIncidents: number;
    todayIncidents: number;
    totalImmunizations: number;
};

/** Mirrors the `health_incident_type` enum in the database. */
const INCIDENT_CATEGORIES = ['INJURY', 'ILLNESS', 'ALLERGY', 'EMERGENCY', 'OTHER'] as const;

const EMPTY_FORM = {
    studentId: '',
    type: 'INJURY' as string,
    incidentDate: '',
    description: '',
    actionTaken: '',
    parentNotified: false,
    followUpRequired: false,
    followUpNotes: '',
};

type FormState = typeof EMPTY_FORM;

function typeColor(t: string): string {
    const m: Record<string, string> = {
        INJURY: 'bg-red-100 text-red-700',
        ILLNESS: 'bg-orange-100 text-orange-700',
        ALLERGY: 'bg-yellow-100 text-yellow-700',
        EMERGENCY: 'bg-red-200 text-red-800',
        OTHER: 'bg-gray-100 text-gray-700',
    };
    return m[t] || 'bg-gray-100 text-gray-700';
}

export default function HealthClient({
    stats,
    incidents,
    students,
    medicalAlerts,
    immunizationsDue,
    canWrite,
}: {
    stats: HealthStats;
    incidents: Incident[];
    students: StudentOption[];
    medicalAlerts: MedicalAlertRow[];
    immunizationsDue: ImmunizationDueRow[];
    canWrite: boolean;
}) {
    const router = useRouter();
    const [view, setView] = useState<'dashboard' | 'log'>('dashboard');
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [isPending, startTransition] = useTransition();

    const set = <K extends keyof FormState>(field: K, value: FormState[K]) =>
        setForm((prev) => ({ ...prev, [field]: value }));

    const selectedStudent = useMemo(
        () => students.find((s) => s.id === form.studentId) ?? null,
        [students, form.studentId],
    );

    const handleSubmit = () => {
        startTransition(async () => {
            const result = await logHealthIncident({
                studentId: form.studentId,
                type: form.type,
                description: form.description,
                actionTaken: form.actionTaken,
                incidentDate: form.incidentDate || undefined,
                parentNotified: form.parentNotified,
                followUpRequired: form.followUpRequired,
                followUpNotes: form.followUpNotes,
            });

            if (!result.success) {
                toast.error(result.error ?? 'Could not save the medical log.');
                return;
            }

            toast.success('Medical incident recorded');
            setForm(EMPTY_FORM);
            setView('dashboard');
            router.refresh();
        });
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">Health &amp; Medical</h1>
                    <p className="text-gray-500 mt-1">Student health records, incident logging, and infirmary management.</p>
                </div>
                {view === 'dashboard' ? (
                    canWrite ? (
                        <Button
                            onClick={() => setView('log')}
                            className="bg-red-600 hover:bg-red-700 text-white shadow-sm transition-all flex items-center gap-2"
                            data-testid="open-incident-form"
                        >
                            <span>+</span> Log New Incident
                        </Button>
                    ) : (
                        <p className="text-sm text-gray-500">Read-only access — incident logging needs the health:write permission.</p>
                    )
                ) : (
                    <Button variant="outline" onClick={() => setView('dashboard')}>Back to Dashboard</Button>
                )}
            </div>

            {view === 'dashboard' ? (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card className="shadow-sm border-blue-100 bg-blue-50/40">
                            <CardContent className="pt-6">
                                <div className="text-sm font-medium text-blue-600 mb-1">Active Medical Files</div>
                                <div className="text-3xl font-bold text-gray-900" data-testid="kpi-medical-files">{stats.studentsWithRecords.toLocaleString()}</div>
                            </CardContent>
                        </Card>
                        <Card className="shadow-sm border-orange-100 bg-orange-50/40">
                            <CardContent className="pt-6">
                                <div className="text-sm font-medium text-orange-600 mb-1">Incidents Recorded</div>
                                <div className="text-3xl font-bold text-gray-900" data-testid="kpi-total-incidents">{stats.totalIncidents.toLocaleString()}</div>
                            </CardContent>
                        </Card>
                        <Card className="shadow-sm border-red-200 bg-red-50/40 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-16 h-16 bg-red-100 rounded-bl-full -mr-8 -mt-8"></div>
                            <CardContent className="pt-6 relative z-10">
                                <div className="text-sm font-semibold text-red-600 mb-1 flex items-center gap-2">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                    </span>
                                    Today&apos;s Incidents
                                </div>
                                <div className="text-3xl font-bold text-red-700" data-testid="kpi-today-incidents">{stats.todayIncidents}</div>
                            </CardContent>
                        </Card>
                        <Card className="shadow-sm border-green-100 bg-green-50/40">
                            <CardContent className="pt-6">
                                <div className="text-sm font-medium text-green-600 mb-1">Immunization Records</div>
                                <div className="text-3xl font-bold text-gray-900" data-testid="kpi-immunizations">{stats.totalImmunizations.toLocaleString()}</div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card className="shadow-sm">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-lg">Standing Medical Alerts</CardTitle>
                                <CardDescription>
                                    Students whose health record lists an allergy, condition or regular medication.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {medicalAlerts.length === 0 ? (
                                    <p className="text-sm text-gray-400 py-6 text-center" data-testid="no-medical-alerts">
                                        No health record on file lists an allergy, condition or medication yet.
                                    </p>
                                ) : (
                                    <ul className="divide-y divide-gray-100" data-testid="medical-alerts-list">
                                        {medicalAlerts.map((row) => (
                                            <li key={row.studentId} className="py-3" data-testid={`medical-alert-${row.studentId}`}>
                                                <div className="flex items-baseline justify-between gap-3">
                                                    <span className="font-semibold text-gray-900">{row.studentName}</span>
                                                    <span className="text-xs text-gray-500">{row.className ?? '—'}</span>
                                                </div>
                                                <div className="mt-1 flex flex-wrap gap-1">
                                                    {row.bloodGroup && (
                                                        <Badge className="bg-slate-100 text-slate-700 border-0">{row.bloodGroup}</Badge>
                                                    )}
                                                    {row.allergies.map((a) => (
                                                        <Badge key={`a-${a}`} className="bg-yellow-100 text-yellow-800 border-0">Allergy: {a}</Badge>
                                                    ))}
                                                    {row.conditions.map((c) => (
                                                        <Badge key={`c-${c}`} className="bg-orange-100 text-orange-800 border-0">{c}</Badge>
                                                    ))}
                                                    {row.medications.map((m) => (
                                                        <Badge key={`m-${m}`} className="bg-blue-100 text-blue-800 border-0">Rx: {m}</Badge>
                                                    ))}
                                                </div>
                                                {(row.emergencyContact || row.emergencyPhone) && (
                                                    <p className="text-xs text-gray-500 mt-1">
                                                        Emergency: {row.emergencyContact ?? '—'} {row.emergencyPhone ? `· ${row.emergencyPhone}` : ''}
                                                    </p>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="shadow-sm">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-lg">Immunisations Due</CardTitle>
                                <CardDescription>Doses overdue or falling due in the next 60 days.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {immunizationsDue.length === 0 ? (
                                    <p className="text-sm text-gray-400 py-6 text-center" data-testid="no-immunizations-due">
                                        No immunisation is recorded as due in this window.
                                    </p>
                                ) : (
                                    <ul className="divide-y divide-gray-100" data-testid="immunizations-due-list">
                                        {immunizationsDue.map((row) => (
                                            <li key={row.id} className="py-3 flex items-center justify-between gap-3">
                                                <div>
                                                    <div className="font-medium text-gray-900">{row.studentName}</div>
                                                    <div className="text-xs text-gray-500">
                                                        {row.vaccineName} · dose {row.doseNumber}
                                                    </div>
                                                </div>
                                                <Badge className={row.overdue ? 'bg-red-100 text-red-700 border-0' : 'bg-amber-100 text-amber-800 border-0'}>
                                                    {row.overdue ? 'Overdue' : 'Due'} {row.nextDueDate}
                                                </Badge>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="shadow-sm overflow-hidden">
                        <div className="p-5 border-b bg-gray-50/50 flex justify-between items-center">
                            <h3 className="font-semibold text-gray-900 text-lg">Recent Medical Incidents</h3>
                            <div className="text-sm text-gray-500 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-red-500 block"></span> Injury
                                <span className="w-2 h-2 rounded-full bg-orange-500 block ml-2"></span> Illness
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-white border-b border-gray-100 text-xs text-gray-500 font-semibold uppercase tracking-wider">
                                    <tr>
                                        <th className="px-5 py-4">Date &amp; Time</th>
                                        <th className="px-5 py-4">Student</th>
                                        <th className="px-5 py-4">Category</th>
                                        <th className="px-5 py-4">Incident Description &amp; Action</th>
                                        <th className="px-5 py-4 text-center">Parent Informed</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {incidents.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-5 py-12 text-center text-gray-400" data-testid="no-incidents">
                                                No incidents recorded yet.
                                            </td>
                                        </tr>
                                    ) : (
                                        incidents.map((inc) => (
                                            <tr key={inc.id} className="hover:bg-gray-50/60 transition-colors" data-testid={`incident-row-${inc.id}`}>
                                                <td className="px-5 py-4 whitespace-nowrap">
                                                    <div className="font-medium text-gray-900">{new Date(inc.incidentDate).toLocaleDateString('en-IN')}</div>
                                                    <div className="text-xs text-gray-500">{new Date(inc.incidentDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                                </td>
                                                <td className="px-5 py-4 font-semibold text-gray-900 whitespace-nowrap">
                                                    {inc.studentName || 'Unknown'}
                                                </td>
                                                <td className="px-5 py-4 whitespace-nowrap">
                                                    <Badge className={`${typeColor(inc.type)} font-bold tracking-tight shadow-none border-0`}>{inc.type}</Badge>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <div className="text-gray-900 font-medium mb-1 line-clamp-1">{inc.description}</div>
                                                    {inc.actionTaken && (
                                                        <div className="text-xs text-gray-600 line-clamp-2">↳ {inc.actionTaken}</div>
                                                    )}
                                                </td>
                                                <td className="px-5 py-4 text-center">
                                                    {inc.parentNotified ? (
                                                        <span className="inline-flex items-center justify-center bg-green-100 text-green-700 w-8 h-8 rounded-full" title="Parent informed">✓</span>
                                                    ) : (
                                                        <span className="inline-flex items-center justify-center bg-gray-100 text-gray-400 w-8 h-8 rounded-full" title="Not recorded as informed">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </>
            ) : (
                <div className="max-w-3xl">
                    <Card className="shadow-lg border-red-100">
                        <CardHeader className="bg-red-50/50 border-b border-red-100 pb-6">
                            <CardTitle className="text-red-900">Log Medical Incident</CardTitle>
                            <CardDescription className="text-red-700/80">Record student injuries, illnesses, or emergencies observed on campus.</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label htmlFor="incident-student" className="font-semibold text-gray-700">Student</Label>
                                        <select
                                            id="incident-student"
                                            value={form.studentId}
                                            onChange={(e) => set('studentId', e.target.value)}
                                            className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
                                            data-testid="incident-student"
                                        >
                                            <option value="">
                                                {students.length === 0 ? 'No active students on the roll' : 'Select a student…'}
                                            </option>
                                            {students.map((s) => (
                                                <option key={s.id} value={s.id}>
                                                    {s.name} — {s.admissionNumber}{s.className ? ` (${s.className})` : ''}
                                                </option>
                                            ))}
                                        </select>
                                        {selectedStudent?.className && (
                                            <p className="text-xs text-gray-500">Class {selectedStudent.className}</p>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="incident-when" className="font-semibold text-gray-700">Incident Date &amp; Time</Label>
                                        <Input
                                            id="incident-when"
                                            type="datetime-local"
                                            value={form.incidentDate}
                                            onChange={(e) => set('incidentDate', e.target.value)}
                                            className="focus:ring-red-500 focus:border-red-500"
                                            data-testid="incident-when"
                                        />
                                        <p className="text-xs text-gray-500">Leave blank to record the incident as happening now.</p>
                                    </div>
                                </div>

                                <div className="space-y-3 pt-2">
                                    <Label className="font-semibold text-gray-700">Incident Category</Label>
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                        {INCIDENT_CATEGORIES.map((cat) => (
                                            <label
                                                key={cat}
                                                className={`border rounded-lg p-3 flex flex-col items-center justify-center cursor-pointer transition-all hover:bg-gray-50 ${form.type === cat ? 'border-red-500 ring-2 ring-red-200 bg-red-50' : 'border-gray-200'}`}
                                            >
                                                <input
                                                    type="radio"
                                                    name="category"
                                                    value={cat}
                                                    className="sr-only"
                                                    checked={form.type === cat}
                                                    onChange={() => set('type', cat)}
                                                    data-testid={`incident-type-${cat}`}
                                                />
                                                <span className={`text-sm font-bold ${form.type === cat ? 'text-red-700' : 'text-gray-600'}`}>{cat}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2 pt-2">
                                    <Label htmlFor="incident-description" className="font-semibold text-gray-700">Detailed Description</Label>
                                    <Textarea
                                        id="incident-description"
                                        value={form.description}
                                        onChange={(e) => set('description', e.target.value)}
                                        placeholder="What happened? Where did it happen? What were the symptoms?"
                                        className="h-24 resize-none focus:ring-red-500 focus:border-red-500"
                                        data-testid="incident-description"
                                    />
                                </div>

                                <div className="space-y-2 pt-2">
                                    <Label htmlFor="incident-action" className="font-semibold text-gray-700">Action Taken (Nurse/Teacher)</Label>
                                    <Textarea
                                        id="incident-action"
                                        value={form.actionTaken}
                                        onChange={(e) => set('actionTaken', e.target.value)}
                                        placeholder="First aid applied, medications given, rest periods, etc."
                                        className="h-24 resize-none focus:ring-red-500 focus:border-red-500"
                                        data-testid="incident-action"
                                    />
                                </div>

                                <div className="bg-orange-50 border border-orange-200 p-4 rounded-lg flex items-start gap-3 mt-6">
                                    <input
                                        type="checkbox"
                                        id="notifyParent"
                                        checked={form.parentNotified}
                                        onChange={(e) => set('parentNotified', e.target.checked)}
                                        className="mt-1 w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                                        data-testid="incident-parent-notified"
                                    />
                                    <label htmlFor="notifyParent" className="text-sm text-orange-900">
                                        <span className="font-bold block">Parents have been informed</span>
                                        Records that the emergency contact was told, and when. This release does not dispatch
                                        an SMS or app alert from here — make the call, then tick the box.
                                    </label>
                                </div>

                                <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg space-y-3">
                                    <div className="flex items-start gap-3">
                                        <input
                                            type="checkbox"
                                            id="followUp"
                                            checked={form.followUpRequired}
                                            onChange={(e) => set('followUpRequired', e.target.checked)}
                                            className="mt-1 w-4 h-4 border-gray-300 rounded"
                                            data-testid="incident-followup-required"
                                        />
                                        <label htmlFor="followUp" className="text-sm text-gray-800">
                                            <span className="font-bold block">Follow-up required</span>
                                            Flag this incident for review by the school nurse.
                                        </label>
                                    </div>
                                    {form.followUpRequired && (
                                        <Textarea
                                            value={form.followUpNotes}
                                            onChange={(e) => set('followUpNotes', e.target.value)}
                                            placeholder="What needs to happen next?"
                                            className="h-20 resize-none"
                                            data-testid="incident-followup-notes"
                                        />
                                    )}
                                </div>

                                <div className="flex justify-end gap-3 pt-6 border-t mt-6">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => { setForm(EMPTY_FORM); setView('dashboard'); }}
                                        disabled={isPending}
                                    >
                                        Cancel Log
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={handleSubmit}
                                        disabled={isPending || !form.studentId || !form.description.trim()}
                                        className="bg-red-600 hover:bg-red-700 text-white transition-colors"
                                        data-testid="incident-submit"
                                    >
                                        {isPending ? 'Saving…' : 'Save Medical Log'}
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
