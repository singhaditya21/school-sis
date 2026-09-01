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
import { cn } from '@/lib/utils';
import {
    checkInVisitor,
    checkInExpectedVisitor,
    checkOutVisitor,
    type ExpectedVisitorRow,
    type GateSuggestions,
    type VisitorRow,
    type VisitorStats,
} from '@/lib/actions/visitor';

/** Mirrors the visit_purpose enum in the database. */
const PURPOSES: { value: string; label: string; icon: string }[] = [
    { value: 'PARENT_VISIT', label: 'Parent', icon: '👨‍👩‍👧' },
    { value: 'MEETING', label: 'Meeting', icon: '🤝' },
    { value: 'DELIVERY', label: 'Delivery', icon: '📦' },
    { value: 'ADMISSION', label: 'Admission', icon: '📝' },
    { value: 'INTERVIEW', label: 'Interview', icon: '💼' },
    { value: 'VENDOR', label: 'Vendor', icon: '🔧' },
    { value: 'OTHER', label: 'Other', icon: '📋' },
];

/** Identity documents accepted at an Indian school gate. */
const ID_PROOFS: string[] = [
    'Aadhaar',
    'Driving Licence',
    'Voter ID',
    'PAN Card',
    'Passport',
    'Employee ID',
    'Other',
];

const PURPOSE_LABELS: Record<string, string> = Object.fromEntries(
    PURPOSES.map((p) => [p.value, `${p.icon} ${p.label}`]),
);

function purposeLabel(value: string): string {
    return PURPOSE_LABELS[value] ?? value.replace(/_/g, ' ');
}

function duration(minutes: number): string {
    const safe = Math.max(0, Math.round(minutes ?? 0));
    if (safe < 60) return `${safe} min`;
    const hours = Math.floor(safe / 60);
    const rest = safe % 60;
    return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

const EMPTY_FORM = {
    name: '',
    phone: '',
    purpose: '',
    hostName: '',
    hostDepartment: '',
    idProof: '',
    idNumber: '',
    company: '',
    vehicleNumber: '',
    purposeDetails: '',
};

type FormState = typeof EMPTY_FORM;

export default function VisitorsClient({
    stats,
    register,
    expected,
    suggestions,
}: {
    stats: VisitorStats;
    register: VisitorRow[];
    expected: ExpectedVisitorRow[];
    suggestions: GateSuggestions;
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [showExtras, setShowExtras] = useState(false);
    const [search, setSearch] = useState('');
    const [busyId, setBusyId] = useState<string | null>(null);

    const set = (field: keyof FormState, value: string) =>
        setForm((prev) => ({ ...prev, [field]: value }));

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return register;
        return register.filter((v) =>
            [v.name, v.phone, v.visitorPass ?? '', v.hostName, v.company ?? '']
                .join(' ')
                .toLowerCase()
                .includes(q),
        );
    }, [register, search]);

    const handleCheckIn = () => {
        startTransition(async () => {
            const result = await checkInVisitor({
                name: form.name,
                phone: form.phone,
                purpose: form.purpose,
                purposeDetails: form.purposeDetails,
                hostName: form.hostName,
                hostDepartment: form.hostDepartment,
                idProof: form.idProof,
                idNumber: form.idNumber,
                company: form.company,
                vehicleNumber: form.vehicleNumber,
            });

            if (!result.success) {
                toast.error(result.error ?? 'Could not check the visitor in.');
                return;
            }

            toast.success(`${result.visitorName} checked in`, {
                description: result.visitorPass ? `Gate pass ${result.visitorPass}` : undefined,
            });
            setForm(EMPTY_FORM);
            setShowExtras(false);
            router.refresh();
        });
    };

    const handleCheckOut = (visitor: VisitorRow) => {
        setBusyId(visitor.id);
        startTransition(async () => {
            const result = await checkOutVisitor(visitor.id);
            setBusyId(null);

            if (!result.success) {
                toast.error(result.error ?? 'Could not check the visitor out.');
                router.refresh();
                return;
            }

            toast.success(`${result.visitorName} checked out`, {
                description: `On campus for ${duration(result.minutesInside ?? 0)}`,
            });
            router.refresh();
        });
    };

    const handleArrival = (visitor: ExpectedVisitorRow) => {
        setBusyId(visitor.id);
        startTransition(async () => {
            const result = await checkInExpectedVisitor(visitor.id);
            setBusyId(null);

            if (!result.success) {
                toast.error(result.error ?? 'Could not check the visitor in.');
                router.refresh();
                return;
            }

            toast.success(`${result.visitorName} checked in`, {
                description: result.visitorPass ? `Gate pass ${result.visitorPass}` : undefined,
            });
            router.refresh();
        });
    };

    return (
        <div className="space-y-6 pb-16">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Gate Desk</h1>
                <p className="text-muted-foreground mt-1">
                    Check visitors in, issue gate passes, and check them out.
                </p>
            </div>

            {/* ── Live counts ─────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatTile label="On Campus Now" value={stats.currentlyIn} tone="green" pulse />
                <StatTile label="Checked In Today" value={stats.todayTotal} tone="blue" />
                <StatTile label="Checked Out Today" value={stats.checkedOutToday} tone="slate" />
                <StatTile label="Awaiting Arrival" value={stats.expected} tone="indigo" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">
                {/* ── Check-in form ───────────────────────── */}
                <Card className="xl:col-span-2 xl:sticky xl:top-4 border-2 border-green-200 shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-2xl">New Visitor</CardTitle>
                        <CardDescription>Fill this in at the gate, then hand over the pass.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="visitor-name" className="text-base font-semibold">
                                Visitor name
                            </Label>
                            <Input
                                id="visitor-name"
                                value={form.name}
                                onChange={(e) => set('name', e.target.value)}
                                placeholder="Full name"
                                autoComplete="off"
                                className="h-14 text-lg"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="visitor-phone" className="text-base font-semibold">
                                Phone number
                            </Label>
                            <Input
                                id="visitor-phone"
                                type="tel"
                                inputMode="tel"
                                value={form.phone}
                                onChange={(e) => set('phone', e.target.value)}
                                placeholder="10-digit mobile"
                                autoComplete="off"
                                className="h-14 text-lg tracking-wide"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-base font-semibold">Purpose of visit</Label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-2 gap-2">
                                {PURPOSES.map((p) => (
                                    <button
                                        key={p.value}
                                        type="button"
                                        onClick={() => set('purpose', p.value)}
                                        aria-pressed={form.purpose === p.value}
                                        className={cn(
                                            'h-16 rounded-lg border-2 text-base font-semibold transition-colors flex flex-col items-center justify-center gap-0.5',
                                            form.purpose === p.value
                                                ? 'border-green-600 bg-green-50 text-green-800'
                                                : 'border-border bg-white text-foreground hover:border-border hover:bg-muted',
                                        )}
                                    >
                                        <span className="text-xl leading-none">{p.icon}</span>
                                        <span>{p.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="visitor-host" className="text-base font-semibold">
                                Here to meet
                            </Label>
                            <Input
                                id="visitor-host"
                                list="gate-host-options"
                                value={form.hostName}
                                onChange={(e) => set('hostName', e.target.value)}
                                placeholder="Staff member's name"
                                autoComplete="off"
                                className="h-14 text-lg"
                            />
                            <datalist id="gate-host-options">
                                {suggestions.hosts.map((h) => (
                                    <option key={h} value={h} />
                                ))}
                            </datalist>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="visitor-dept" className="text-base font-semibold">
                                Department / office
                            </Label>
                            <Input
                                id="visitor-dept"
                                list="gate-dept-options"
                                value={form.hostDepartment}
                                onChange={(e) => set('hostDepartment', e.target.value)}
                                placeholder="e.g. Principal's Office"
                                autoComplete="off"
                                className="h-14 text-lg"
                            />
                            <datalist id="gate-dept-options">
                                {suggestions.departments.map((d) => (
                                    <option key={d} value={d} />
                                ))}
                            </datalist>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-base font-semibold">ID shown at gate</Label>
                            <div className="flex flex-wrap gap-2">
                                {ID_PROOFS.map((proof) => (
                                    <button
                                        key={proof}
                                        type="button"
                                        onClick={() => set('idProof', proof)}
                                        aria-pressed={form.idProof === proof}
                                        className={cn(
                                            'h-12 px-4 rounded-lg border-2 text-sm font-semibold transition-colors',
                                            form.idProof === proof
                                                ? 'border-green-600 bg-green-50 text-green-800'
                                                : 'border-border bg-white text-foreground hover:border-border hover:bg-muted',
                                        )}
                                    >
                                        {proof}
                                    </button>
                                ))}
                            </div>
                            <Input
                                id="visitor-id-number"
                                value={form.idNumber}
                                onChange={(e) => set('idNumber', e.target.value)}
                                placeholder="ID number"
                                autoComplete="off"
                                aria-label="ID number"
                                className="h-14 text-lg mt-2"
                            />
                        </div>

                        <button
                            type="button"
                            onClick={() => setShowExtras((v) => !v)}
                            className="text-sm font-semibold text-blue-700 hover:underline"
                        >
                            {showExtras ? '− Hide extra details' : '+ Company, vehicle or a note'}
                        </button>

                        {showExtras && (
                            <div className="space-y-4 rounded-lg bg-muted p-4">
                                <div className="space-y-2">
                                    <Label htmlFor="visitor-company">Company</Label>
                                    <Input
                                        id="visitor-company"
                                        value={form.company}
                                        onChange={(e) => set('company', e.target.value)}
                                        placeholder="Organisation name"
                                        className="h-12"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="visitor-vehicle">Vehicle number</Label>
                                    <Input
                                        id="visitor-vehicle"
                                        value={form.vehicleNumber}
                                        onChange={(e) => set('vehicleNumber', e.target.value.toUpperCase())}
                                        placeholder="e.g. MH12AB1234"
                                        className="h-12 uppercase tracking-wide"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="visitor-note">Note</Label>
                                    <Textarea
                                        id="visitor-note"
                                        value={form.purposeDetails}
                                        onChange={(e) => set('purposeDetails', e.target.value)}
                                        placeholder="Anything the office should know"
                                        rows={2}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="flex gap-3 pt-1">
                            <Button
                                type="button"
                                onClick={handleCheckIn}
                                disabled={isPending}
                                className="h-16 flex-1 text-lg font-bold bg-green-600 hover:bg-green-700 text-white"
                            >
                                {isPending ? 'Saving…' : 'Check In Visitor'}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    setForm(EMPTY_FORM);
                                    setShowExtras(false);
                                }}
                                disabled={isPending}
                                className="h-16 px-6 text-base"
                            >
                                Clear
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* ── Register ────────────────────────────── */}
                <div className="xl:col-span-3 space-y-6">
                    {expected.length > 0 && (
                        <Card className="border-2 border-indigo-200">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-xl">Awaiting Arrival</CardTitle>
                                <CardDescription>
                                    Pre-approved visitors — tap Arrived to issue a gate pass.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {expected.map((v) => (
                                    <div
                                        key={v.id}
                                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-indigo-50/50 p-4"
                                    >
                                        <div className="min-w-0">
                                            <div className="text-lg font-semibold text-foreground">{v.name}</div>
                                            <div className="text-sm text-muted-foreground">
                                                {v.phone} · {purposeLabel(v.purpose)} · {v.hostName} ({v.hostDepartment})
                                            </div>
                                            {v.preApprovedLabel && (
                                                <div className="text-xs text-muted-foreground mt-0.5">
                                                    Approved {v.preApprovedLabel}
                                                </div>
                                            )}
                                        </div>
                                        <Button
                                            type="button"
                                            onClick={() => handleArrival(v)}
                                            disabled={isPending && busyId === v.id}
                                            className="h-12 px-6 text-base font-semibold bg-indigo-600 hover:bg-indigo-700 text-white"
                                        >
                                            {isPending && busyId === v.id ? 'Saving…' : 'Arrived'}
                                        </Button>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}

                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex flex-wrap items-end justify-between gap-3">
                                <div>
                                    <CardTitle className="text-xl">Today&apos;s Register</CardTitle>
                                    <CardDescription>
                                        {register.length === 0
                                            ? 'Nobody has come through the gate yet.'
                                            : `${register.length} ${register.length === 1 ? 'entry' : 'entries'}, most recent first.`}
                                    </CardDescription>
                                </div>
                                <Input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search name, phone or pass"
                                    aria-label="Search today's register"
                                    className="h-12 w-full sm:w-72 text-base"
                                />
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {filtered.map((v) => {
                                const inside = v.status === 'CHECKED_IN';
                                return (
                                    <div
                                        key={v.id}
                                        className={cn(
                                            'flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4',
                                            inside ? 'border-green-200 bg-green-50/60' : 'bg-white',
                                        )}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-lg font-semibold text-foreground">{v.name}</span>
                                                <span className="font-mono text-sm text-muted-foreground">
                                                    {v.visitorPass ?? 'no pass'}
                                                </span>
                                                {v.carriedOver && (
                                                    <Badge className="bg-amber-100 text-amber-800 border-transparent hover:bg-amber-100">
                                                        Since {v.checkInDayLabel}
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="text-sm text-muted-foreground mt-0.5">
                                                {v.phone}
                                                {v.company ? ` · ${v.company}` : ''} · {purposeLabel(v.purpose)}
                                            </div>
                                            <div className="text-sm text-muted-foreground">
                                                Meeting <span className="font-medium">{v.hostName}</span> ·{' '}
                                                {v.hostDepartment}
                                                {v.vehicleNumber ? ` · ${v.vehicleNumber}` : ''}
                                            </div>
                                            <div className="text-sm text-muted-foreground mt-0.5">
                                                In {v.checkInLabel}
                                                {inside
                                                    ? ` · on campus ${duration(v.minutesInside)}`
                                                    : ` · out ${v.checkOutLabel ?? '—'} · stayed ${duration(v.minutesInside)}`}
                                            </div>
                                        </div>

                                        {inside ? (
                                            <Button
                                                type="button"
                                                onClick={() => handleCheckOut(v)}
                                                disabled={isPending && busyId === v.id}
                                                className="h-14 px-7 text-base font-bold bg-gray-900 hover:bg-gray-800 text-white"
                                            >
                                                {isPending && busyId === v.id ? 'Saving…' : 'Check Out'}
                                            </Button>
                                        ) : (
                                            <Badge variant="secondary" className="h-8 px-3 text-sm">
                                                Checked out
                                            </Badge>
                                        )}
                                    </div>
                                );
                            })}

                            {filtered.length === 0 && (
                                <div className="py-14 text-center text-muted-foreground">
                                    {register.length === 0
                                        ? 'No visitors yet today. Check the first one in on the left.'
                                        : `No entry matches “${search.trim()}”.`}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function StatTile({
    label,
    value,
    tone,
    pulse = false,
}: {
    label: string;
    value: number;
    tone: 'green' | 'blue' | 'slate' | 'indigo';
    pulse?: boolean;
}) {
    const tones: Record<string, string> = {
        green: 'border-green-200 bg-green-50/60 text-green-700',
        blue: 'border-blue-100 bg-blue-50/50 text-blue-700',
        slate: 'border-border bg-muted/60 text-muted-foreground',
        indigo: 'border-indigo-100 bg-indigo-50/50 text-indigo-700',
    };

    return (
        <Card className={cn('shadow-sm', tones[tone])}>
            <CardContent className="pt-6">
                <div className="text-sm font-semibold mb-1 flex items-center gap-2">
                    {pulse && value > 0 && (
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                        </span>
                    )}
                    {label}
                </div>
                <div className="text-4xl font-bold text-foreground">{value}</div>
            </CardContent>
        </Card>
    );
}
