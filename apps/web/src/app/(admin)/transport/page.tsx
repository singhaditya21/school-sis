import { getSession } from '@/lib/auth/session';
import Link from 'next/link';

interface Route {
    id: string;
    name: string;
    description?: string;
    vehicleNumber?: string;
    driverName?: string;
    studentCount: number;
    active: boolean;
}

// Mock transport routes
const mockRoutes: Route[] = [
    { id: '1', name: 'Route 1 - Sector 42-50', description: 'Greenwood Colony to school', vehicleNumber: 'DL-01-AB-1234', driverName: 'Raju Kumar', studentCount: 45, active: true },
    { id: '2', name: 'Route 2 - Sector 51-60', description: 'New Town to school', vehicleNumber: 'DL-01-CD-5678', driverName: 'Suresh Yadav', studentCount: 52, active: true },
    { id: '3', name: 'Route 3 - DLF Phase 1-2', description: 'DLF City to school', vehicleNumber: 'DL-01-EF-9012', driverName: 'Mahesh Singh', studentCount: 38, active: true },
    { id: '4', name: 'Route 4 - South City', description: 'South City Mall area', vehicleNumber: 'DL-01-GH-3456', driverName: 'Prakash Sharma', studentCount: 48, active: true },
    { id: '5', name: 'Route 5 - Sushant Lok', description: 'Sushant Lok Phase 1-3', vehicleNumber: 'DL-01-IJ-7890', driverName: 'Vikas Verma', studentCount: 42, active: true },
    { id: '6', name: 'Route 6 - Golf Course Road', description: 'Golf Course Extension', vehicleNumber: 'DL-01-KL-1122', driverName: 'Ramesh Gupta', studentCount: 35, active: true },
    { id: '7', name: 'Route 7 - Old Gurgaon', description: 'Civil Lines and Sadar Bazaar', vehicleNumber: 'DL-01-MN-3344', driverName: 'Anil Kumar', studentCount: 55, active: true },
    { id: '8', name: 'Route 8 - Palam Vihar', description: 'Palam Vihar to school', vehicleNumber: 'DL-01-OP-5566', driverName: 'Dinesh Pal', studentCount: 40, active: false },
];

export default async function TransportPage() {
    const session = await getSession();

    // Fetch routes from Java API
    let routes: Route[] = [];
    let useMockData = false;

    try {
        const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/transport/routes`,
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
            routes = data.data?.content || data.content || [];
            if (routes.length === 0) useMockData = true;
        } else {
            useMockData = true;
        }
    } catch (error) {
        console.error('[Transport] API Error, using mock data:', error);
        useMockData = true;
    }

    // Use mock data as fallback
    if (useMockData) {
        routes = mockRoutes;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Transport</h1>
                    <p className="text-gray-600 mt-1">Manage bus routes and transport</p>
                </div>
                <Link
                    href="/transport/new"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
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
                                    <p className="text-sm text-gray-500">{route.vehicleNumber || 'No vehicle assigned'}</p>
                                </div>
                            </div>
                            <div className="space-y-2 text-sm">
                                <p><span className="text-gray-500">Driver:</span> {route.driverName || 'Not assigned'}</p>
                                <p><span className="text-gray-500">Students:</span> {route.studentCount}</p>
                            </div>
                            <div className="mt-4 pt-4 border-t flex justify-between items-center">
                                <span className={`px-2 py-1 rounded text-xs ${route.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                    {route.active ? 'Active' : 'Inactive'}
                                </span>
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
