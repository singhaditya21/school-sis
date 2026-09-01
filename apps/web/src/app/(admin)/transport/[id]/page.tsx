import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getSession } from '@/lib/auth/session';
import { hasPermission, UserRole } from '@/lib/rbac/permissions';
import { formatCurrency } from '@/lib/utils';

import {
    getRouteOverview,
    listAssignableStudents,
    listRouteAssignments,
    listStops,
    listVehicles,
} from '../actions';
import AssignStudentForm from './assign-student-form';
import AssignmentsTable from './assignments-table';
import RouteEditor from './route-editor';
import StopsManager from './stops-manager';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RouteDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const role = session.role as UserRole;
    if (!hasPermission(role, 'transport:read')) redirect('/unauthorized');
    const canWrite = hasPermission(role, 'transport:write');

    const { id } = await params;

    // Validate UUID format before querying to avoid PG errors
    if (!UUID_RE.test(id)) {
        redirect('/transport');
    }

    const route = await getRouteOverview(id);
    if (!route) {
        redirect('/transport');
    }

    const [stops, assignments, students, vehicles] = await Promise.all([
        listStops(id),
        listRouteAssignments(id),
        canWrite ? listAssignableStudents() : Promise.resolve([]),
        canWrite ? listVehicles() : Promise.resolve([]),
    ]);

    const seatsLeft = route.capacity - route.activeAssignmentCount;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/transport" className="text-primary hover:underline">
                    ← Back to Transport
                </Link>
                <Link href="/transport/vehicles" className="text-primary hover:underline">
                    Vehicles →
                </Link>
            </div>

            <div className="bg-card rounded-xl shadow-sm border p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center text-2xl">
                            🚌
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-foreground" data-testid="route-name-title">
                                {route.name}
                            </h1>
                            <p className="text-muted-foreground" data-testid="route-vehicle">
                                Vehicle: {route.vehicleNumber}
                            </p>
                            <p className="text-sm text-muted-foreground">
                                {route.vehicleType} · Driver {route.driverName} ({route.driverPhone})
                            </p>
                            {route.description && (
                                <p className="text-sm text-muted-foreground mt-1">{route.description}</p>
                            )}
                        </div>
                    </div>
                    {canWrite && (
                        <RouteEditor
                            routeId={route.id}
                            assignmentCount={route.assignmentCount}
                            vehicles={vehicles.map((v) => ({
                                id: v.id,
                                vehicleNumber: v.vehicleNumber,
                                driverName: v.driverName,
                            }))}
                            initial={{
                                name: route.name,
                                description: route.description ?? '',
                                vehicleId: route.vehicleId,
                                morningDepartureTime: route.morningDepartureTime ?? '',
                                afternoonDepartureTime: route.afternoonDepartureTime ?? '',
                                monthlyFee: route.monthlyFee ?? '',
                            }}
                        />
                    )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm pt-4 border-t">
                    <div>
                        <span className="text-muted-foreground block">Morning Departure</span>
                        <span className="font-semibold">{route.morningDepartureTime || '—'}</span>
                    </div>
                    <div>
                        <span className="text-muted-foreground block">Afternoon Departure</span>
                        <span className="font-semibold">{route.afternoonDepartureTime || '—'}</span>
                    </div>
                    <div>
                        <span className="text-muted-foreground block">Monthly Fee</span>
                        <span className="font-semibold">
                            {route.monthlyFee ? formatCurrency(Number(route.monthlyFee)) : 'N/A'}
                        </span>
                    </div>
                    <div>
                        <span className="text-muted-foreground block">Total Stops</span>
                        <span className="font-semibold">{route.stopCount}</span>
                    </div>
                    <div>
                        <span className="text-muted-foreground block">Seats Left</span>
                        <span className={`font-semibold ${seatsLeft <= 0 ? 'text-red-600' : ''}`}>
                            {seatsLeft} of {route.capacity}
                        </span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <StopsManager routeId={id} stops={stops} canWrite={canWrite} />

                <div className="bg-card rounded-xl shadow-sm border p-6">
                    <h3 className="font-bold text-lg mb-4">Assign Student</h3>
                    <AssignStudentForm
                        routeId={id}
                        stops={stops.map((s) => ({ id: s.id, name: s.name }))}
                        students={students}
                        canWrite={canWrite}
                    />
                </div>
            </div>

            <AssignmentsTable assignments={assignments} canWrite={canWrite} />
        </div>
    );
}
