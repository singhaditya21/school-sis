import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getRoutes } from '@/lib/actions/transport';

export default async function ParentTransportPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const routes = await getRoutes();

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">My Transport</h1>

            {routes.length > 0 ? (
                <div className="space-y-4">
                    {routes.map(route => (
                        <div key={route.id} className="bg-white rounded-xl shadow-sm border p-6">
                            <div className="flex items-center gap-4 mb-3">
                                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">🚌</div>
                                <div>
                                    <h3 className="font-semibold">{route.name}</h3>
                                    <p className="text-sm text-gray-500">{route.vehicleNumber}</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div><span className="text-gray-500">Stops:</span> {route.stopCount}</div>
                                {route.morningDepartureTime && <div><span className="text-gray-500">Morning:</span> {route.morningDepartureTime}</div>}
                                {route.afternoonDepartureTime && <div><span className="text-gray-500">Afternoon:</span> {route.afternoonDepartureTime}</div>}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border p-8 text-center text-gray-500">
                    No transport assigned.
                </div>
            )}
        </div>
    );
}
