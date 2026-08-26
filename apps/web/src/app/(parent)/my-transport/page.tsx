import { formatCurrency } from '@/lib/utils';
import { ParentTopBar } from '@/components/parent/parent-top-bar';
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
                <div className="rounded-xl border bg-white p-8 text-center text-gray-500">
                    No child is linked to your account yet.
                </div>
            </div>
        );
    }

    const { child, assignments } = data;

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            <ParentTopBar students={students} selectedId={child.id} />

            <div>
                <h1 className="text-2xl font-bold">My Transport</h1>
                <p className="mt-1 text-sm text-slate-500">Bus route assigned to {child.name}</p>
            </div>

            {assignments.length > 0 ? (
                <div className="space-y-4" data-testid="assigned-routes-list">
                    {assignments.map((route) => (
                        <div
                            key={route.assignmentId}
                            className="rounded-xl border bg-white p-6 shadow-sm"
                            data-testid="route-card"
                        >
                            <div className="mb-4 flex items-center gap-4">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                                    🚌
                                </div>
                                <div>
                                    <h2 className="font-semibold" data-testid="route-name">
                                        {route.routeName}
                                    </h2>
                                    <p className="text-sm text-gray-500" data-testid="vehicle-number">
                                        {route.vehicleNumber}
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div data-testid="stops-count">
                                    <span className="text-gray-500">Stops:</span> {route.stopCount}
                                </div>
                                {route.morningDeparture && (
                                    <div data-testid="morning-time">
                                        <span className="text-gray-500">Morning:</span> {route.morningDeparture}
                                    </div>
                                )}
                                {route.afternoonDeparture && (
                                    <div data-testid="afternoon-time">
                                        <span className="text-gray-500">Afternoon:</span> {route.afternoonDeparture}
                                    </div>
                                )}
                                {route.monthlyFee !== null && (
                                    <div data-testid="monthly-fee">
                                        <span className="text-gray-500">Monthly Fee:</span>{' '}
                                        {formatCurrency(route.monthlyFee)}
                                    </div>
                                )}
                            </div>

                            <div className="mt-4 grid gap-4 border-t pt-4 text-sm sm:grid-cols-2">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                                        {child.name}&apos;s stop
                                    </p>
                                    {route.stopName ? (
                                        <p className="mt-1 font-medium text-slate-800">{route.stopName}</p>
                                    ) : (
                                        <p className="mt-1 text-slate-400">Not assigned to a stop yet</p>
                                    )}
                                    {(route.pickupTime || route.dropTime) && (
                                        <p className="mt-1 text-slate-500">
                                            {route.pickupTime ? `Pickup ${route.pickupTime}` : ''}
                                            {route.pickupTime && route.dropTime ? ' · ' : ''}
                                            {route.dropTime ? `Drop ${route.dropTime}` : ''}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                                        Driver
                                    </p>
                                    {route.driverName ? (
                                        <p className="mt-1 font-medium text-slate-800">{route.driverName}</p>
                                    ) : (
                                        <p className="mt-1 text-slate-400">Not recorded</p>
                                    )}
                                    {route.driverPhone && (
                                        <a
                                            href={`tel:${route.driverPhone}`}
                                            className="mt-1 inline-block text-blue-600 hover:underline"
                                        >
                                            {route.driverPhone}
                                        </a>
                                    )}
                                </div>
                            </div>

                            {(route.startDate || route.endDate) && (
                                <p className="mt-4 text-xs text-slate-400">
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
                    className="rounded-xl border bg-white p-8 text-center text-gray-500 shadow-sm"
                    data-testid="unassigned-placeholder"
                >
                    No transport assigned.
                </div>
            )}
        </div>
    );
}
