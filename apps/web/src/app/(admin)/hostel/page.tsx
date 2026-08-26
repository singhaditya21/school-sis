import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getAllocations, getMessMenu, vacateStudent } from '@/lib/actions/hostel';
import { getSession } from '@/lib/auth/session';
import { hasPermission, isStaff, UserRole } from '@/lib/rbac/permissions';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import AllocationForm from './allocation-form';
import { getAllocatableStudents, getHostelDirectory, getRoomOptions } from './actions';

type MessMenuRow = {
    id: string;
    day: string;
    breakfast: string | null;
    lunch: string | null;
    snacks: string | null;
    dinner: string | null;
};

const HOSTEL_TYPE_STYLES: Record<string, string> = {
    BOYS: 'bg-blue-100 text-blue-700',
    GIRLS: 'bg-pink-100 text-pink-700',
    CO_ED: 'bg-gray-100 text-gray-700',
};

export default async function HostelPage() {
    const session = await getSession();
    if (!session.isLoggedIn) {
        redirect('/login');
    }
    if (!isStaff(session.role as UserRole)) {
        redirect('/unauthorized');
    }

    const canWrite = hasPermission(session.role as UserRole, 'hostel:write');

    const [hostelList, allocations, rooms, students] = await Promise.all([
        getHostelDirectory(),
        getAllocations({ status: 'ACTIVE' }),
        canWrite ? getRoomOptions() : Promise.resolve([]),
        canWrite ? getAllocatableStudents() : Promise.resolve([]),
    ]);

    const hostelMenus = await Promise.all(
        hostelList.map(async (h) => ({ hostelId: h.id, menu: (await getMessMenu(h.id)) as MessMenuRow[] })),
    );

    const totalBeds = hostelList.reduce((sum, h) => sum + h.totalBeds, 0);
    const occupiedBeds = hostelList.reduce((sum, h) => sum + h.occupiedBeds, 0);
    const stats = {
        totalHostels: hostelList.length,
        totalBeds,
        occupiedBeds,
        availableBeds: totalBeds - occupiedBeds,
        occupancyRate: totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Hostel Management</h1>
                    <p className="text-gray-600 mt-1">Manage hostels, rooms, and student allocations</p>
                </div>
                <Link href="/hostel/fees" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                    Hostel Fees
                </Link>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Total Hostels</div><div className="text-2xl font-bold text-blue-600" data-testid="kpi-total-hostels">{stats.totalHostels}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Total Beds</div><div className="text-2xl font-bold text-purple-600" data-testid="kpi-total-beds">{stats.totalBeds}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Occupied</div><div className="text-2xl font-bold text-orange-600" data-testid="kpi-occupied-beds">{stats.occupiedBeds}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Available</div><div className="text-2xl font-bold text-green-600" data-testid="kpi-available-beds">{stats.availableBeds}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Occupancy</div><div className="text-2xl font-bold text-indigo-600" data-testid="kpi-occupancy-rate">{stats.occupancyRate}%</div></CardContent></Card>
            </div>

            {hostelList.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center text-gray-500" data-testid="no-hostels">
                        No active hostel is set up for this school yet.
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {hostelList.map((hostel) => {
                        const myMenu = hostelMenus.find((m) => m.hostelId === hostel.id)?.menu ?? [];
                        return (
                            <Card key={hostel.id} data-testid={`hostel-card-${hostel.id}`}>
                                <CardContent className="pt-6">
                                    <div className="flex justify-between items-start gap-3">
                                        <div>
                                            <h3 className="text-lg font-bold">{hostel.name}</h3>
                                            {hostel.address && <p className="text-sm text-gray-500">{hostel.address}</p>}
                                            <p className="text-xs text-gray-500 mt-1">
                                                Warden: {hostel.wardenName ?? 'not assigned'}
                                                {hostel.phone ? ` · ${hostel.phone}` : ''}
                                            </p>
                                        </div>
                                        <Badge
                                            variant="outline"
                                            className={`border-transparent ${HOSTEL_TYPE_STYLES[hostel.type] ?? 'bg-gray-100 text-gray-700'}`}
                                            data-testid={`hostel-type-${hostel.id}`}
                                        >
                                            {hostel.type.replace('_', '-')}
                                        </Badge>
                                    </div>
                                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                                        <div className="bg-gray-50 p-2 rounded"><div className="text-xs text-gray-500">Rooms</div><div className="font-bold">{hostel.totalRooms}</div></div>
                                        <div className="bg-gray-50 p-2 rounded"><div className="text-xs text-gray-500">Beds</div><div className="font-bold">{hostel.totalBeds}</div></div>
                                        <div className="bg-gray-50 p-2 rounded"><div className="text-xs text-gray-500">Occupied</div><div className="font-bold">{hostel.occupiedBeds}</div></div>
                                    </div>
                                    <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-blue-500 rounded-full"
                                            style={{ width: `${hostel.totalBeds > 0 ? Math.min(100, (hostel.occupiedBeds / hostel.totalBeds) * 100) : 0}%` }}
                                        />
                                    </div>

                                    <div className="mt-6 border-t pt-4">
                                        <h4 className="font-semibold text-sm mb-2 text-gray-700">Weekly Mess Menu</h4>
                                        {myMenu.length === 0 ? (
                                            <p className="text-xs text-gray-500 italic">No mess menu scheduled.</p>
                                        ) : (
                                            <div className="space-y-2" data-testid="mess-menu-list">
                                                {myMenu.map((item) => (
                                                    <div
                                                        key={item.id}
                                                        className="text-xs flex justify-between border-b pb-1 border-gray-100 last:border-0"
                                                        data-testid={`mess-menu-day-${item.day.toLowerCase()}`}
                                                    >
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
            )}

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
                                {canWrite && <TableHead className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actions</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {allocations.map((a) => (
                                <TableRow key={a.id}>
                                    <TableCell className="px-4 py-3 font-medium">{a.studentName}</TableCell>
                                    <TableCell className="px-4 py-3">{a.hostelName}</TableCell>
                                    <TableCell className="px-4 py-3">{a.roomNumber}</TableCell>
                                    <TableCell className="px-4 py-3">{a.bedNumber}</TableCell>
                                    <TableCell className="px-4 py-3 text-sm text-gray-500">{a.allocatedFrom} → {a.allocatedTo}</TableCell>
                                    {canWrite && (
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
                                    )}
                                </TableRow>
                            ))}
                            {allocations.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={canWrite ? 6 : 5} className="px-4 py-12 text-center text-gray-400">No active allocations.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {canWrite && <AllocationForm hostels={hostelList} rooms={rooms} students={students} />}
        </div>
    );
}
