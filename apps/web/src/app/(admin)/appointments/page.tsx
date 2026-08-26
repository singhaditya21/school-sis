import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { getSession } from '@/lib/auth/session';
import { hasPermission, UserRole } from '@/lib/rbac/permissions';
import AppointmentsClient from './appointments-client';
import { getAppointmentPeople, listAppointments } from './actions';

export default async function AppointmentsPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const role = session.role as UserRole;
    const canRead = hasPermission(role, 'appointments:read');
    const canWrite = hasPermission(role, 'appointments:write');

    // The appointments permissions are granted to teachers and tenant operators
    // only, so most admin roles land here without read access. Say so plainly
    // rather than letting the query throw a 500.
    if (!canRead) {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold">Appointments</h1>
                    <p className="text-gray-600 mt-1">Manage meetings and appointments</p>
                </div>
                <Card>
                    <CardContent className="py-12 text-center text-gray-600" data-testid="appointments-no-access">
                        <p className="font-medium">Appointments are not available to your role.</p>
                        <p className="text-sm text-gray-500 mt-2">
                            The appointments module is granted to teaching staff and tenant operators.
                            Ask an operator to extend the appointments permission to {role.replace(/_/g, ' ').toLowerCase()} if you need it.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const [appointments, people] = await Promise.all([
        listAppointments(),
        canWrite ? getAppointmentPeople() : Promise.resolve([]),
    ]);

    return <AppointmentsClient appointments={appointments} people={people} canWrite={canWrite} />;
}
