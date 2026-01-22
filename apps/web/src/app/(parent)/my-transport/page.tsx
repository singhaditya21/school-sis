import { getSession } from '@/lib/auth/session';

interface Route {
    name: string;
    vehicleNumber: string;
    driverName: string;
    driverPhone: string;
    pickupTime: string;
    dropTime: string;
    stops: string[];
}

export default async function MyTransportPage() {
    const session = await getSession();

    // Fetch parent's child's transport info from Java API
    let route: Route | null = null;

    try {
        const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/parent/transport`,
            {
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                    'Content-Type': 'application/json',
                },
                cache: 'no-store',
            }
        );

        if (response.ok) {
            const data = await response.json();
            route = data.data;
        }
    } catch (error) {
        console.error('[MyTransport] API Error:', error);
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">My Transport</h1>
                <p className="text-gray-600 mt-1">View your child&apos;s transport details</p>
            </div>

            {route ? (
                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-3xl">
                            🚌
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">{route.name}</h2>
                            <p className="text-gray-500">{route.vehicleNumber}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-gray-50 p-4 rounded-lg">
                            <p className="text-sm text-gray-500">Driver</p>
                            <p className="font-medium">{route.driverName}</p>
                            <p className="text-sm text-blue-600">{route.driverPhone}</p>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg">
                            <p className="text-sm text-gray-500">Timings</p>
                            <p className="font-medium">Pickup: {route.pickupTime}</p>
                            <p className="font-medium">Drop: {route.dropTime}</p>
                        </div>
                    </div>

                    <div>
                        <h3 className="font-semibold mb-2">Route Stops</h3>
                        <div className="space-y-2">
                            {route.stops?.map((stop, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs">
                                        {i + 1}
                                    </span>
                                    <span>{stop}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border p-8 text-center text-gray-500">
                    No transport route assigned.
                </div>
            )}
        </div>
    );
}
