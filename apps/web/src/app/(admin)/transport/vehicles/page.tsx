import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Card, CardContent } from '@/components/ui/card';
import { getSession } from '@/lib/auth/session';
import { hasPermission, UserRole } from '@/lib/rbac/permissions';

import { listVehicles } from '../actions';
import VehiclesManager from './vehicles-manager';

export default async function TransportVehiclesPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const role = session.role as UserRole;
    if (!hasPermission(role, 'transport:read')) redirect('/unauthorized');
    const canWrite = hasPermission(role, 'transport:write');

    const vehicles = await listVehicles();

    const totalSeats = vehicles.reduce((sum, v) => sum + Number(v.capacity || 0), 0);
    const riders = vehicles.reduce((sum, v) => sum + Number(v.assignedStudents || 0), 0);
    const unassigned = vehicles.filter((v) => v.routeCount === 0).length;

    const cards = [
        { label: 'Vehicles', value: String(vehicles.length), className: 'text-blue-600' },
        { label: 'Total Seats', value: String(totalSeats), className: 'text-green-600' },
        { label: 'Riders Today', value: String(riders), className: 'text-purple-600' },
        { label: 'Without a Route', value: String(unassigned), className: 'text-orange-600' },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Fleet</h1>
                    <p className="text-muted-foreground mt-1">Vehicles, drivers and compliance dates</p>
                </div>
                <Link href="/transport" className="px-4 py-2 border border-border rounded-lg hover:bg-muted">
                    ← Back to Transport
                </Link>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {cards.map((card) => (
                    <Card key={card.label}>
                        <CardContent className="pt-4">
                            <div className="text-sm text-muted-foreground">{card.label}</div>
                            <div className={`text-2xl font-bold ${card.className}`}>{card.value}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <VehiclesManager vehicles={vehicles} canWrite={canWrite} />
        </div>
    );
}
