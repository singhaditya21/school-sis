import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { getHostels, getHostelStats, getAllocations } from '@/lib/actions/hostel';

export default async function HostelPage() {
    const [hostelList, stats, allocations] = await Promise.all([
        getHostels(),
        getHostelStats(),
        getAllocations({ status: 'ACTIVE' }),
    ]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Hostel Management</h1>
                    <p className="text-gray-600 mt-1">Manage hostels, rooms, and student allocations</p>
                </div>
                <Link href="/hostel/fees" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                    💰 Hostel Fees
                </Link>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Total Hostels</div><div className="text-2xl font-bold text-blue-600">{stats.totalHostels}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Total Beds</div><div className="text-2xl font-bold text-purple-600">{stats.totalBeds}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Occupied</div><div className="text-2xl font-bold text-orange-600">{stats.occupiedBeds}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Available</div><div className="text-2xl font-bold text-green-600">{stats.availableBeds}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Occupancy</div><div className="text-2xl font-bold text-indigo-600">{stats.occupancyRate}%</div></CardContent></Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {hostelList.map(hostel => (
                    <Card key={hostel.id}>
                        <CardContent className="pt-6">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-lg font-bold">{hostel.name}</h3>
                                    <p className="text-sm text-gray-500">{hostel.address}</p>
                                </div>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${hostel.type === 'BOYS' ? 'bg-blue-100 text-blue-700' : hostel.type === 'GIRLS' ? 'bg-pink-100 text-pink-700' : 'bg-gray-100 text-gray-700'}`}>{hostel.type}</span>
                            </div>
                            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                                <div className="bg-gray-50 p-2 rounded"><div className="text-xs text-gray-500">Rooms</div><div className="font-bold">{hostel.totalRooms}</div></div>
                                <div className="bg-gray-50 p-2 rounded"><div className="text-xs text-gray-500">Beds</div><div className="font-bold">{hostel.totalBeds}</div></div>
                                <div className="bg-gray-50 p-2 rounded"><div className="text-xs text-gray-500">Occupied</div><div className="font-bold">{hostel.occupiedBeds}</div></div>
                            </div>
                            <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${hostel.totalBeds > 0 ? (hostel.occupiedBeds / hostel.totalBeds) * 100 : 0}%` }} />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="p-4 border-b"><h3 className="font-bold">Active Allocations</h3></div>
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hostel</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Room</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bed</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {allocations.map(a => (
                                <tr key={a.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium">{a.studentName}</td>
                                    <td className="px-4 py-3">{a.hostelName}</td>
                                    <td className="px-4 py-3">{a.roomNumber}</td>
                                    <td className="px-4 py-3">{a.bedNumber}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{a.allocatedFrom} → {a.allocatedTo}</td>
                                </tr>
                            ))}
                            {allocations.length === 0 && (
                                <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">No active allocations.</td></tr>
                            )}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
}
