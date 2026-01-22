'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlumniService, Alumni, AlumniEvent } from '@/lib/services/alumni/alumni.service';

export default function AlumniPage() {
    const [activeTab, setActiveTab] = useState<'directory' | 'events'>('directory');
    const [batchFilter, setBatchFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedAlumni, setSelectedAlumni] = useState<Alumni | null>(null);
    const [selectedEvent, setSelectedEvent] = useState<AlumniEvent | null>(null);

    const stats = AlumniService.getStats();
    const eventStats = AlumniService.getEventStats();
    const batches = AlumniService.getBatches();
    const alumni = searchQuery
        ? AlumniService.searchAlumni(searchQuery)
        : AlumniService.getAlumni({ batch: batchFilter || undefined });
    const events = AlumniService.getEvents();

    const getEventTypeColor = (type: string) => {
        const colors: Record<string, string> = {
            reunion: 'bg-purple-100 text-purple-800',
            networking: 'bg-blue-100 text-blue-800',
            career_talk: 'bg-green-100 text-green-800',
            workshop: 'bg-orange-100 text-orange-800',
            fundraiser: 'bg-pink-100 text-pink-800',
        };
        return colors[type] || 'bg-gray-100 text-gray-800';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Alumni Management</h1>
                    <p className="text-muted-foreground">Connect with our alumni network</p>
                </div>
                <Button>+ Add Alumni</Button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2">
                <Button
                    variant={activeTab === 'directory' ? 'default' : 'outline'}
                    onClick={() => setActiveTab('directory')}
                >
                    👥 Alumni Directory
                </Button>
                <Button
                    variant={activeTab === 'events' ? 'default' : 'outline'}
                    onClick={() => setActiveTab('events')}
                >
                    📅 Events
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-5 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Total Alumni</CardDescription>
                        <CardTitle className="text-3xl">{stats.total}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Verified</CardDescription>
                        <CardTitle className="text-3xl text-green-600">{stats.verified}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Pending</CardDescription>
                        <CardTitle className="text-3xl text-yellow-600">{stats.pending}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Batches</CardDescription>
                        <CardTitle className="text-3xl text-blue-600">{stats.batches}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Upcoming Events</CardDescription>
                        <CardTitle className="text-3xl text-purple-600">{eventStats.upcoming}</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {activeTab === 'directory' && (
                <>
                    {/* Filters */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Search & Filter</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex gap-4">
                                <Input
                                    placeholder="Search by name, company, or designation..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-80"
                                />
                                <select
                                    className="p-2 border rounded-md"
                                    value={batchFilter}
                                    onChange={(e) => setBatchFilter(e.target.value)}
                                >
                                    <option value="">All Batches</option>
                                    {batches.map((b) => (
                                        <option key={b} value={b}>Batch {b}</option>
                                    ))}
                                </select>
                                <Button variant="outline" onClick={() => { setSearchQuery(''); setBatchFilter(''); }}>
                                    Clear
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Alumni Grid */}
                    <div className="grid grid-cols-3 gap-4">
                        {alumni.map((alum) => (
                            <Card key={alum.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedAlumni(alum)}>
                                <CardContent className="p-6">
                                    <div className="flex items-start gap-4">
                                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xl font-bold">
                                            {alum.name.split(' ').map((n) => n[0]).join('')}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-semibold">{alum.name}</h3>
                                                {alum.isVerified && <Badge className="bg-green-100 text-green-800">✓</Badge>}
                                            </div>
                                            <p className="text-sm text-muted-foreground">Batch {alum.batch}</p>
                                            {alum.currentCompany && (
                                                <p className="text-sm mt-1">
                                                    {alum.designation} at <span className="font-medium">{alum.currentCompany}</span>
                                                </p>
                                            )}
                                            {alum.location && (
                                                <p className="text-xs text-muted-foreground mt-1">📍 {alum.location}</p>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </>
            )}

            {activeTab === 'events' && (
                <div className="grid gap-4">
                    {events.map((event) => (
                        <Card key={event.id} className="hover:shadow-md transition-shadow">
                            <CardContent className="p-6">
                                <div className="flex items-start justify-between">
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-3">
                                            <h3 className="text-xl font-semibold">{event.title}</h3>
                                            <Badge className={getEventTypeColor(event.type)}>
                                                {event.type.replace('_', ' ')}
                                            </Badge>
                                            <Badge className={event.status === 'upcoming' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}>
                                                {event.status}
                                            </Badge>
                                        </div>
                                        <p className="text-muted-foreground">{event.description}</p>
                                        <div className="flex gap-4 text-sm text-muted-foreground">
                                            <span>📅 {event.date}</span>
                                            <span>⏰ {event.time}</span>
                                            <span>📍 {event.venue}</span>
                                            <span>👥 {event.registrations}/{event.maxCapacity} registered</span>
                                        </div>
                                        <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-blue-500 rounded-full"
                                                style={{ width: `${(event.registrations / event.maxCapacity) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        {event.status === 'upcoming' && (
                                            <Button>Register</Button>
                                        )}
                                        <Button variant="outline" onClick={() => setSelectedEvent(event)}>
                                            View Details
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Alumni Profile Dialog */}
            {selectedAlumni && (
                <Dialog open={!!selectedAlumni} onOpenChange={() => setSelectedAlumni(null)}>
                    <DialogContent className="max-w-lg">
                        <DialogHeader>
                            <DialogTitle>Alumni Profile</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="flex items-center gap-4">
                                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                                    {selectedAlumni.name.split(' ').map((n) => n[0]).join('')}
                                </div>
                                <div>
                                    <h3 className="text-xl font-semibold">{selectedAlumni.name}</h3>
                                    <p className="text-muted-foreground">Batch {selectedAlumni.batch} | {selectedAlumni.class}-{selectedAlumni.section}</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p className="text-muted-foreground">Email</p>
                                    <p>{selectedAlumni.email}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Phone</p>
                                    <p>{selectedAlumni.phone}</p>
                                </div>
                                {selectedAlumni.currentCompany && (
                                    <>
                                        <div>
                                            <p className="text-muted-foreground">Company</p>
                                            <p>{selectedAlumni.currentCompany}</p>
                                        </div>
                                        <div>
                                            <p className="text-muted-foreground">Designation</p>
                                            <p>{selectedAlumni.designation}</p>
                                        </div>
                                    </>
                                )}
                                {selectedAlumni.location && (
                                    <div>
                                        <p className="text-muted-foreground">Location</p>
                                        <p>{selectedAlumni.location}</p>
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-2 pt-4">
                                <Button className="flex-1">💬 Connect</Button>
                                {selectedAlumni.linkedIn && (
                                    <Button variant="outline" className="flex-1">🔗 LinkedIn</Button>
                                )}
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}
