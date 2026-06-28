import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getParentRoutes } from '@/lib/actions/transport';
import { requireAuth } from '@/lib/auth/middleware';
import { formatCurrency } from '@/lib/utils';

export default async function ParentTransportPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    try {
        await requireAuth('transport:read:own');
    } catch (e) {
        redirect('/unauthorized');
    }

    const routes = await getParentRoutes();

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">My Transport</h1>

            {routes.length > 0 ? (
                <div className="space-y-4" data-testid="assigned-routes-list">
                    {routes.map(route => (
                        <div key={route.id} className="bg-white rounded-xl shadow-sm border p-6" data-testid="route-card">
                            <div className="flex items-center gap-4 mb-3">
                                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">🚌</div>
                                <div>
                                    <h3 className="font-semibold" data-testid="route-name">{route.name}</h3>
                                    <p className="text-sm text-gray-500" data-testid="vehicle-number">{route.vehicleNumber}</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div data-testid="stops-count"><span className="text-gray-500">Stops:</span> {route.stopCount}</div>
                                {route.morningDepartureTime && <div data-testid="morning-time"><span className="text-gray-500">Morning:</span> {route.morningDepartureTime}</div>}
                                {route.afternoonDepartureTime && <div data-testid="afternoon-time"><span className="text-gray-500">Afternoon:</span> {route.afternoonDepartureTime}</div>}
                                {route.monthlyFee && <div data-testid="monthly-fee"><span className="text-gray-500">Monthly Fee:</span> {formatCurrency(Number(route.monthlyFee))}</div>}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border p-8 text-center text-gray-500" data-testid="unassigned-placeholder">
                    No transport assigned.
                </div>
            )}
        </div>
    );
}
