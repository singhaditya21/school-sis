import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getRoutes } from '@/lib/actions/transport';
import { formatCurrency } from '@/lib/utils';

export default async function TransportPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const routes = await getRoutes();

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Transport</h1>
                    <p className="text-gray-600 mt-1">{routes.length} routes configured</p>
                </div>
                <Link href="/transport/new" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    + Add Route
                </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {routes.length === 0 ? (
                    <div className="col-span-full bg-white rounded-xl shadow-sm border p-8 text-center">
                        <div className="text-4xl mb-3">🚌</div>
                        <p className="text-gray-500">No routes configured yet.</p>
                    </div>
                ) : (
                    routes.map((route) => (
                        <div key={route.id} className="bg-white rounded-xl shadow-sm border p-6">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                                    🚌
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900">{route.name}</h3>
                                    <p className="text-sm text-gray-500">{route.vehicleNumber}</p>
                                </div>
                            </div>
                            <div className="space-y-2 text-sm">
                                <p><span className="text-gray-500">Stops:</span> {route.stopCount}</p>
                                <p><span className="text-gray-500">Students:</span> {route.studentCount}</p>
                                {route.morningDepartureTime && (
                                    <p><span className="text-gray-500">Morning:</span> {route.morningDepartureTime}</p>
                                )}
                                {route.monthlyFee && (
                                    <p><span className="text-gray-500">Monthly Fee:</span> {formatCurrency(Number(route.monthlyFee))}</p>
                                )}
                            </div>
                            <div className="mt-4 pt-4 border-t flex justify-end">
                                <Link href={`/transport/${route.id}`} className="text-blue-600 hover:underline text-sm">
                                    View Details →
                                </Link>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
