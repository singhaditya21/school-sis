import Link from 'next/link';
import { Bus, ExternalLink, ShieldCheck } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { ParentTopBar } from '@/components/parent/parent-top-bar';
import { VerificationQrSeal } from '@/components/security/verification-qr-seal';
import { Badge } from '@/components/ui/badge';
import { getChildTransport, getMyChildren } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ParentTransportPage({
    searchParams,
}: {
    searchParams: Promise<{ child?: string }>;
}) {
    const { child: requestedChild } = await searchParams;
    const students = await getMyChildren();
    const data = await getChildTransport(requestedChild);

    if (!data) {
        return (
            <div className="mx-auto max-w-4xl space-y-6">
                <ParentTopBar students={students} selectedId={null} />
                <h1 className="text-2xl font-bold">My Transport</h1>
                <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
                    No child is linked to your account yet.
                </div>
            </div>
        );
    }

    const { child, assignments, gatePass } = data;

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            <ParentTopBar students={students} selectedId={child.id} />

            <div>
                <h1 className="text-2xl font-bold text-foreground">Transport &amp; Dismissal Gate Pass</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Assigned bus corridor and verified daily guardian pickup credential for {child.name}
                </p>
            </div>

            {/* Digital Dismissal Gate Pass & Cryptographic QR Seal */}
            <div
                data-testid="digital-gate-pass-card"
                className="rounded-xl border border-brass/40 bg-accent/35 p-6 shadow-sm"
            >
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge
                                variant="outline"
                                className="border-brass/45 bg-card text-primary font-semibold gap-1.5"
                            >
                                <ShieldCheck className="h-3.5 w-3.5 text-brass" />
                                Verified Guardian Dismissal Pass
                            </Badge>
                            <Badge variant="secondary" className="font-mono text-xs">
                                Valid {gatePass.validDate}
                            </Badge>
                        </div>
                        <h2 className="text-lg font-bold text-foreground">
                            {child.name} · {child.gradeName}-{child.sectionName}
                        </h2>
                        <p className="text-sm text-muted-foreground max-w-xl">
                            Present this cryptographic seal or desk code at the campus security gate for verified early pickup or afternoon dismissal.
                        </p>
                        <div className="flex flex-wrap items-center gap-3 pt-1">
                            <div className="rounded-lg border border-brass/35 bg-card px-3 py-1.5">
                                <span className="text-[11px] uppercase tracking-wider text-muted-foreground mr-2">
                                    Desk Code
                                </span>
                                <span
                                    data-testid="parent-gate-pass-code"
                                    className="font-mono text-sm font-bold text-primary"
                                >
                                    {gatePass.deskCode}
                                </span>
                            </div>
                            <Link
                                href={gatePass.verifyPath}
                                data-testid="open-gate-pass-verification"
                                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
                            >
                                Verify Gate Pass
                                <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                        </div>
                    </div>

                    <div className="self-center sm:self-auto shrink-0">
                        <VerificationQrSeal
                            seed={gatePass.token}
                            sizePx={116}
                            label={`Dismissal Gate Pass QR for ${child.name}`}
                        />
                    </div>
                </div>
            </div>

            {assignments.length > 0 ? (
                <div className="space-y-4" data-testid="assigned-routes-list">
                    {assignments.map((route) => (
                        <div
                            key={route.assignmentId}
                            className="rounded-xl border border-border bg-card p-6 shadow-sm"
                            data-testid="route-card"
                        >
                            <div className="mb-4 flex items-center gap-4">
                                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-brass/30 bg-accent text-primary">
                                    <Bus className="h-5 w-5" />
                                </div>
                                <div>
                                    <h2 className="font-semibold text-foreground" data-testid="route-name">
                                        {route.routeName}
                                    </h2>
                                    <p className="text-sm text-muted-foreground" data-testid="vehicle-number">
                                        {route.vehicleNumber}
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div data-testid="stops-count">
                                    <span className="text-muted-foreground">Stops:</span> {route.stopCount}
                                </div>
                                {route.morningDeparture && (
                                    <div data-testid="morning-time">
                                        <span className="text-muted-foreground">Morning:</span> {route.morningDeparture}
                                    </div>
                                )}
                                {route.afternoonDeparture && (
                                    <div data-testid="afternoon-time">
                                        <span className="text-muted-foreground">Afternoon:</span> {route.afternoonDeparture}
                                    </div>
                                )}
                                {route.monthlyFee !== null && (
                                    <div data-testid="monthly-fee">
                                        <span className="text-muted-foreground">Monthly Fee:</span>{' '}
                                        {formatCurrency(route.monthlyFee)}
                                    </div>
                                )}
                            </div>

                            <div className="mt-4 grid gap-4 border-t border-border pt-4 text-sm sm:grid-cols-2">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                        {child.name}&apos;s stop
                                    </p>
                                    {route.stopName ? (
                                        <p className="mt-1 font-medium text-foreground">{route.stopName}</p>
                                    ) : (
                                        <p className="mt-1 text-muted-foreground">Not assigned to a stop yet</p>
                                    )}
                                    {(route.pickupTime || route.dropTime) && (
                                        <p className="mt-1 text-muted-foreground">
                                            {route.pickupTime ? `Pickup ${route.pickupTime}` : ''}
                                            {route.pickupTime && route.dropTime ? ' · ' : ''}
                                            {route.dropTime ? `Drop ${route.dropTime}` : ''}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                        Driver
                                    </p>
                                    {route.driverName ? (
                                        <p className="mt-1 font-medium text-foreground">{route.driverName}</p>
                                    ) : (
                                        <p className="mt-1 text-muted-foreground">Not recorded</p>
                                    )}
                                    {route.driverPhone && (
                                        <a
                                            href={`tel:${route.driverPhone}`}
                                            className="mt-1 inline-block text-primary hover:underline"
                                        >
                                            {route.driverPhone}
                                        </a>
                                    )}
                                </div>
                            </div>

                            {(route.startDate || route.endDate) && (
                                <p className="mt-4 text-xs text-muted-foreground">
                                    {route.startDate ? `From ${route.startDate}` : ''}
                                    {route.startDate && route.endDate ? ' · ' : ''}
                                    {route.endDate ? `until ${route.endDate}` : ''}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div
                    className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground shadow-sm"
                    data-testid="unassigned-placeholder"
                >
                    No transport assigned.
                </div>
            )}
        </div>
    );
}
