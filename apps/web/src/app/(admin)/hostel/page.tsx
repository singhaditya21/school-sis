'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { HostelService, Room, HostelAllocation } from '@/lib/services/hostel/hostel.service';
import Link from 'next/link';

export default function HostelPage() {
    const [activeTab, setActiveTab] = useState<'overview' | 'rooms' | 'allocations' | 'mess'>('overview');
    const [selectedHostel, setSelectedHostel] = useState('');
    const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

    const stats = HostelService.getStats();
    const hostels = HostelService.getHostels();
    const rooms = HostelService.getRooms(selectedHostel || undefined);
    const allocations = HostelService.getAllocations({ hostelId: selectedHostel || undefined });
    const messMenu = HostelService.getMessMenu();

    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const todayMenu = messMenu.find((m) => m.day === today);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Hostel Management</h1>
                    <p className="text-muted-foreground">Manage hostel rooms, allocations, and mess</p>
                </div>
                <div className="flex gap-2">
                    <Link href="/hostel/fees">
                        <Button variant="outline">💰 Hostel Fees</Button>
                    </Link>
                    <Button>+ New Allocation</Button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2">
                <Button variant={activeTab === 'overview' ? 'default' : 'outline'} onClick={() => setActiveTab('overview')}>
                    📊 Overview
                </Button>
                <Button variant={activeTab === 'rooms' ? 'default' : 'outline'} onClick={() => setActiveTab('rooms')}>
                    🚪 Rooms
                </Button>
                <Button variant={activeTab === 'allocations' ? 'default' : 'outline'} onClick={() => setActiveTab('allocations')}>
                    🛏️ Allocations
                </Button>
                <Button variant={activeTab === 'mess' ? 'default' : 'outline'} onClick={() => setActiveTab('mess')}>
                    🍽️ Mess Menu
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-5 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Total Hostels</CardDescription>
                        <CardTitle className="text-3xl">{stats.totalHostels}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Total Beds</CardDescription>
                        <CardTitle className="text-3xl text-blue-600">{stats.totalBeds}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Occupied</CardDescription>
                        <CardTitle className="text-3xl text-orange-600">{stats.occupiedBeds}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Available</CardDescription>
                        <CardTitle className="text-3xl text-green-600">{stats.availableBeds}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Occupancy Rate</CardDescription>
                        <CardTitle className="text-3xl">{stats.occupancyRate}%</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {/* Hostel Filter */}
            {(activeTab === 'rooms' || activeTab === 'allocations') && (
                <Card>
                    <CardContent className="p-4">
                        <div className="flex gap-4 items-center">
                            <span className="font-medium">Select Hostel:</span>
                            <select
                                className="p-2 border rounded-md"
                                value={selectedHostel}
                                onChange={(e) => setSelectedHostel(e.target.value)}
                            >
                                <option value="">All Hostels</option>
                                {hostels.map((h) => (
                                    <option key={h.id} value={h.id}>{h.name}</option>
                                ))}
                            </select>
                        </div>
                    </CardContent>
                </Card>
            )}

            {activeTab === 'overview' && (
                <div className="grid grid-cols-2 gap-4">
                    {hostels.map((hostel) => (
                        <Card key={hostel.id}>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle>{hostel.name}</CardTitle>
                                    <Badge className={hostel.type === 'boys' ? 'bg-blue-100 text-blue-800' : 'bg-pink-100 text-pink-800'}>
                                        {hostel.type}
                                    </Badge>
                                </div>
                                <CardDescription>📍 {hostel.address}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-3 gap-4 text-center">
                                        <div className="p-3 bg-gray-50 rounded-lg">
                                            <p className="text-2xl font-bold">{hostel.totalRooms}</p>
                                            <p className="text-sm text-muted-foreground">Rooms</p>
                                        </div>
                                        <div className="p-3 bg-gray-50 rounded-lg">
                                            <p className="text-2xl font-bold">{hostel.occupiedBeds}/{hostel.totalBeds}</p>
                                            <p className="text-sm text-muted-foreground">Beds</p>
                                        </div>
                                        <div className="p-3 bg-gray-50 rounded-lg">
                                            <p className="text-2xl font-bold">{Math.round((hostel.occupiedBeds / hostel.totalBeds) * 100)}%</p>
                                            <p className="text-sm text-muted-foreground">Occupancy</p>
                                        </div>
                                    </div>
                                    <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-blue-500 rounded-full"
                                            style={{ width: `${(hostel.occupiedBeds / hostel.totalBeds) * 100}%` }}
                                        />
                                    </div>
                                    <p className="text-sm">
                                        <span className="font-medium">Warden:</span> {hostel.warden}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {activeTab === 'rooms' && (
                <Card>
                    <CardHeader>
                        <CardTitle>Room Allocation Grid</CardTitle>
                        <CardDescription>Click on a room to view details</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-6 gap-3">
                            {rooms.map((room) => (
                                <div
                                    key={room.id}
                                    onClick={() => setSelectedRoom(room)}
                                    className={`p-4 border-2 rounded-lg cursor-pointer transition-all hover:shadow-md ${room.status === 'full'
                                            ? 'border-red-300 bg-red-50'
                                            : room.status === 'available'
                                                ? 'border-green-300 bg-green-50'
                                                : 'border-yellow-300 bg-yellow-50'
                                        }`}
                                >
                                    <p className="font-bold text-lg">{room.roomNumber}</p>
                                    <p className="text-sm text-muted-foreground">Floor {room.floor}</p>
                                    <div className="flex gap-1 mt-2">
                                        {Array.from({ length: room.totalBeds }).map((_, i) => (
                                            <div
                                                key={i}
                                                className={`w-4 h-4 rounded ${i < room.occupiedBeds ? 'bg-blue-500' : 'bg-gray-300'}`}
                                            />
                                        ))}
                                    </div>
                                    <Badge className={`mt-2 ${HostelService.getRoomStatusColor(room.status)}`}>
                                        {room.status}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-4 mt-4 text-sm">
                            <span className="flex items-center gap-2"><div className="w-4 h-4 bg-green-200 border border-green-400 rounded" /> Available</span>
                            <span className="flex items-center gap-2"><div className="w-4 h-4 bg-red-200 border border-red-400 rounded" /> Full</span>
                            <span className="flex items-center gap-2"><div className="w-4 h-4 bg-yellow-200 border border-yellow-400 rounded" /> Maintenance</span>
                        </div>
                    </CardContent>
                </Card>
            )}

            {activeTab === 'allocations' && (
                <Card>
                    <CardHeader>
                        <CardTitle>Room Allocations</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <table className="w-full">
                            <thead>
                                <tr className="border-b">
                                    <th className="text-left py-3 px-4">Student</th>
                                    <th className="text-left py-3 px-4">Class</th>
                                    <th className="text-left py-3 px-4">Hostel</th>
                                    <th className="text-left py-3 px-4">Room</th>
                                    <th className="text-left py-3 px-4">Bed</th>
                                    <th className="text-left py-3 px-4">Period</th>
                                    <th className="text-left py-3 px-4">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allocations.map((alloc) => (
                                    <tr key={alloc.id} className="border-b hover:bg-gray-50">
                                        <td className="py-3 px-4">
                                            <p className="font-medium">{alloc.studentName}</p>
                                            <p className="text-sm text-muted-foreground">{alloc.studentId}</p>
                                        </td>
                                        <td className="py-3 px-4">{alloc.class}</td>
                                        <td className="py-3 px-4">{alloc.hostelName}</td>
                                        <td className="py-3 px-4">{alloc.roomNumber}</td>
                                        <td className="py-3 px-4">{alloc.bedNumber}</td>
                                        <td className="py-3 px-4 text-sm">
                                            {alloc.allocatedFrom} to {alloc.allocatedTo}
                                        </td>
                                        <td className="py-3 px-4">
                                            <Badge className="bg-green-100 text-green-800">{alloc.status}</Badge>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>
            )}

            {activeTab === 'mess' && (
                <div className="space-y-4">
                    {todayMenu && (
                        <Card className="border-2 border-blue-500">
                            <CardHeader className="bg-blue-50">
                                <CardTitle className="flex items-center gap-2">
                                    📅 Today's Menu ({today})
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6">
                                <div className="grid grid-cols-4 gap-4">
                                    <div className="p-4 bg-orange-50 rounded-lg">
                                        <p className="font-medium text-orange-800">🌅 Breakfast</p>
                                        <p className="mt-2">{todayMenu.breakfast}</p>
                                    </div>
                                    <div className="p-4 bg-yellow-50 rounded-lg">
                                        <p className="font-medium text-yellow-800">☀️ Lunch</p>
                                        <p className="mt-2">{todayMenu.lunch}</p>
                                    </div>
                                    <div className="p-4 bg-green-50 rounded-lg">
                                        <p className="font-medium text-green-800">🍪 Snacks</p>
                                        <p className="mt-2">{todayMenu.snacks}</p>
                                    </div>
                                    <div className="p-4 bg-purple-50 rounded-lg">
                                        <p className="font-medium text-purple-800">🌙 Dinner</p>
                                        <p className="mt-2">{todayMenu.dinner}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                    <Card>
                        <CardHeader>
                            <CardTitle>Weekly Menu</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left py-3 px-4">Day</th>
                                        <th className="text-left py-3 px-4">Breakfast</th>
                                        <th className="text-left py-3 px-4">Lunch</th>
                                        <th className="text-left py-3 px-4">Snacks</th>
                                        <th className="text-left py-3 px-4">Dinner</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {messMenu.map((menu) => (
                                        <tr key={menu.day} className={`border-b ${menu.day === today ? 'bg-blue-50' : ''}`}>
                                            <td className="py-3 px-4 font-medium">{menu.day}</td>
                                            <td className="py-3 px-4">{menu.breakfast}</td>
                                            <td className="py-3 px-4">{menu.lunch}</td>
                                            <td className="py-3 px-4">{menu.snacks}</td>
                                            <td className="py-3 px-4">{menu.dinner}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Room Details Dialog */}
            {selectedRoom && (
                <Dialog open={!!selectedRoom} onOpenChange={() => setSelectedRoom(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Room {selectedRoom.roomNumber}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-muted-foreground">Floor</p>
                                    <p className="font-medium">{selectedRoom.floor}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Type</p>
                                    <p className="font-medium capitalize">{selectedRoom.type}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Occupancy</p>
                                    <p className="font-medium">{selectedRoom.occupiedBeds}/{selectedRoom.totalBeds} beds</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Status</p>
                                    <Badge className={HostelService.getRoomStatusColor(selectedRoom.status)}>
                                        {selectedRoom.status}
                                    </Badge>
                                </div>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground mb-2">Amenities</p>
                                <div className="flex gap-2">
                                    {selectedRoom.amenities.map((a) => (
                                        <Badge key={a} variant="outline">{a}</Badge>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}
