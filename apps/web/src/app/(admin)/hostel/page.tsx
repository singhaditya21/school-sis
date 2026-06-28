import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { getHostels, getHostelStats, getAllocations, getMessMenu, allocateStudent, vacateStudent } from '@/lib/actions/hostel';
import { Badge } from '@/components/ui/badge';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth/session';
import { isStaff } from '@/lib/rbac/permissions';
import { redirect } from 'next/navigation';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

export default async function HostelPage() {
    const session = await getSession();
    if (!session.isLoggedIn) {
        redirect('/login');
    }
    if (!isStaff(session.role as any)) {
        redirect('/unauthorized');
    }

    const [hostelList, stats, allocations] = await Promise.all([
        getHostels(),
        getHostelStats(),
        getAllocations({ status: 'ACTIVE' }),
    ]);

    const hostelMenus = await Promise.all(
        hostelList.map(async (h) => {
            const menu = await getMessMenu(h.id);
            return { hostelId: h.id, menu };
        })
    );

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
                {hostelList.map(hostel => {
                    const myMenu = hostelMenus.find(m => m.hostelId === hostel.id)?.menu || [];
                    return (
                        <Card key={hostel.id}>
                            <CardContent className="pt-6">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="text-lg font-bold">{hostel.name}</h3>
                                        <p className="text-sm text-gray-500">{hostel.address}</p>
                                    </div>
                                    <Badge variant="outline" className={`border-transparent ${hostel.type === 'BOYS' ? 'bg-blue-100 text-blue-700' : hostel.type === 'GIRLS' ? 'bg-pink-100 text-pink-700' : 'bg-gray-100 text-gray-700'}`}>{hostel.type}</Badge>
                                </div>
                                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                                    <div className="bg-gray-50 p-2 rounded"><div className="text-xs text-gray-500">Rooms</div><div className="font-bold">{hostel.totalRooms}</div></div>
                                    <div className="bg-gray-50 p-2 rounded"><div className="text-xs text-gray-500">Beds</div><div className="font-bold">{hostel.totalBeds}</div></div>
                                    <div className="bg-gray-50 p-2 rounded"><div className="text-xs text-gray-500">Occupied</div><div className="font-bold">{hostel.occupiedBeds}</div></div>
                                </div>
                                <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${hostel.totalBeds > 0 ? (hostel.occupiedBeds / hostel.totalBeds) * 100 : 0}%` }} />
                                </div>

                                {/* Weekly Mess Menu Display */}
                                <div className="mt-6 border-t pt-4">
                                    <h4 className="font-semibold text-sm mb-2 text-gray-700">Weekly Mess Menu</h4>
                                    {myMenu.length === 0 ? (
                                        <p className="text-xs text-gray-500 italic">No mess menu scheduled.</p>
                                    ) : (
                                        <div className="space-y-2" data-testid="mess-menu-list">
                                            {myMenu.map((item: any) => (
                                                <div key={item.id} className="text-xs flex justify-between border-b pb-1 border-gray-100 last:border-0" data-testid={`mess-menu-day-${item.day.toLowerCase()}`}>
                                                    <span className="font-bold text-gray-600">{item.day}:</span>
                                                    <span className="text-gray-500">
                                                        B: {item.breakfast || '-'} | L: {item.lunch || '-'} | S: {item.snacks || '-'} | D: {item.dinner || '-'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="p-4 border-b"><h3 className="font-bold">Active Allocations</h3></div>
                    <Table>
                        <TableHeader className="bg-gray-50">
                            <TableRow>
                                <TableHead className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Student</TableHead>
                                <TableHead className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Hostel</TableHead>
                                <TableHead className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Room</TableHead>
                                <TableHead className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Bed</TableHead>
                                <TableHead className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Period</TableHead>
                                <TableHead className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {allocations.map(a => (
                                <TableRow key={a.id}>
                                    <TableCell className="px-4 py-3 font-medium">{a.studentName}</TableCell>
                                    <TableCell className="px-4 py-3">{a.hostelName}</TableCell>
                                    <TableCell className="px-4 py-3">{a.roomNumber}</TableCell>
                                    <TableCell className="px-4 py-3">{a.bedNumber}</TableCell>
                                    <TableCell className="px-4 py-3 text-sm text-gray-500">{a.allocatedFrom} → {a.allocatedTo}</TableCell>
                                    <TableCell className="px-4 py-3">
                                        <form action={async () => {
                                            'use server';
                                            await vacateStudent(a.id);
                                            revalidatePath('/hostel');
                                        }}>
                                            <button type="submit" className="text-red-600 hover:text-red-900 text-sm font-semibold" data-testid={`vacate-btn-${a.id}`}>
                                                Vacate
                                            </button>
                                        </form>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {allocations.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="px-4 py-12 text-center text-gray-400">No active allocations.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-6">
                    <h3 className="font-bold text-lg mb-4">Allocate Student</h3>
                    <form action={async (formData: FormData) => {
                        'use server';
                        const studentId = formData.get('studentId') as string;
                        const hostelId = formData.get('hostelId') as string;
                        const roomId = formData.get('roomId') as string;
                        const bedNumber = formData.get('bedNumber') as string;
                        const allocatedFrom = formData.get('allocatedFrom') as string;
                        const allocatedTo = formData.get('allocatedTo') as string;
                        
                        await allocateStudent({
                            studentId,
                            hostelId,
                            roomId,
                            bedNumber,
                            allocatedFrom,
                            allocatedTo
                        });
                        
                        revalidatePath('/hostel');
                    }} className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">Student ID</label>
                                <input type="text" name="studentId" placeholder="Student UUID" className="w-full p-2 border rounded text-sm" required data-testid="alloc-student-id" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">Hostel ID</label>
                                <input type="text" name="hostelId" placeholder="Hostel UUID" className="w-full p-2 border rounded text-sm" required data-testid="alloc-hostel-id" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">Room ID</label>
                                <input type="text" name="roomId" placeholder="Room UUID" className="w-full p-2 border rounded text-sm" required data-testid="alloc-room-id" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">Bed No.</label>
                                <input type="text" name="bedNumber" placeholder="e.g. A" className="w-full p-2 border rounded text-sm" required data-testid="alloc-bed-number" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">From Date</label>
                                <input type="date" name="allocatedFrom" className="w-full p-2 border rounded text-sm" required data-testid="alloc-from" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">To Date</label>
                                <input type="date" name="allocatedTo" className="w-full p-2 border rounded text-sm" required data-testid="alloc-to" />
                            </div>
                        </div>
                        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-semibold" data-testid="allocate-submit-btn">
                            Allocate Bed
                        </button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
