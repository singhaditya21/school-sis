'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { type School } from '@/components/school-switcher';
import { getTenantId } from '@/lib/actions/scaffolding-bridge';

export default function SchoolsPage() {
    const [schools, setSchools] = useState<(School & { createdAt: string; email: string; phone: string })[]>([]);
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [selectedSchool, setSelectedSchool] = useState<typeof schools[0] | null>(null);

    // Schools will be loaded from DB when multi-school feature is implemented.
    // For now, shows empty state until schools are fetched.

    const totalStudents = schools.reduce((sum, s) => sum + s.studentCount, 0);
    const totalStaff = schools.reduce((sum, s) => sum + s.staffCount, 0);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div><h1 className="text-3xl font-bold">School Management</h1><p className="text-gray-600 mt-1">Manage schools under your education trust</p></div>
                <button onClick={() => setShowAddDialog(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">+ Add School</button>
            </div>

            <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                        <div><h2 className="text-xl font-bold text-blue-900">Education Trust</h2><p className="text-blue-700">School management dashboard</p></div>
                        <div className="flex gap-8">
                            <div className="text-center"><div className="text-3xl font-bold text-blue-600">{schools.length}</div><div className="text-sm text-gray-600">Schools</div></div>
                            <div className="text-center"><div className="text-3xl font-bold text-green-600">{totalStudents.toLocaleString()}</div><div className="text-sm text-gray-600">Students</div></div>
                            <div className="text-center"><div className="text-3xl font-bold text-purple-600">{totalStaff}</div><div className="text-sm text-gray-600">Staff</div></div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {schools.length === 0 ? (
                <Card><CardContent className="py-12 text-center text-gray-500">No schools configured yet. Add your first school to get started.</CardContent></Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {schools.map(school => (
                        <Card key={school.id} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setSelectedSchool(school)}>
                            <CardContent className="pt-6">
                                <div className="flex items-start gap-4">
                                    <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center text-2xl">🏫</div>
                                    <div className="flex-1">
                                        <h3 className="font-semibold">{school.name}</h3>
                                        <p className="text-sm text-gray-500">{school.code}</p>
                                        <Badge className={school.isActive ? 'bg-green-100 text-green-700 mt-2' : 'bg-gray-100 text-gray-700 mt-2'}>{school.isActive ? 'Active' : 'Inactive'}</Badge>
                                    </div>
                                </div>
                                <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4 text-center">
                                    <div><div className="text-xl font-bold text-blue-600">{school.studentCount}</div><div className="text-xs text-gray-500">Students</div></div>
                                    <div><div className="text-xl font-bold text-purple-600">{school.staffCount}</div><div className="text-xs text-gray-500">Staff</div></div>
                                </div>
                                <div className="mt-4 text-xs text-gray-500">📍 {school.city} • Est. {new Date(school.createdAt).getFullYear()}</div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <Dialog open={!!selectedSchool} onOpenChange={() => setSelectedSchool(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader><DialogTitle>School Details</DialogTitle></DialogHeader>
                    {selectedSchool && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center text-3xl">🏫</div>
                                <div><h2 className="text-xl font-bold">{selectedSchool.name}</h2><p className="text-gray-500">{selectedSchool.code}</p></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div><span className="text-gray-500">Trust:</span><p className="font-medium">{selectedSchool.trustName}</p></div>
                                <div><span className="text-gray-500">Status:</span><p><Badge className={selectedSchool.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100'}>{selectedSchool.isActive ? 'Active' : 'Inactive'}</Badge></p></div>
                                <div><span className="text-gray-500">Address:</span><p className="font-medium">{selectedSchool.address}</p></div>
                                <div><span className="text-gray-500">City:</span><p className="font-medium">{selectedSchool.city}</p></div>
                                <div><span className="text-gray-500">Email:</span><p className="font-medium">{selectedSchool.email}</p></div>
                                <div><span className="text-gray-500">Phone:</span><p className="font-medium">{selectedSchool.phone}</p></div>
                                <div><span className="text-gray-500">Students:</span><p className="font-medium text-blue-600">{selectedSchool.studentCount.toLocaleString()}</p></div>
                                <div><span className="text-gray-500">Staff:</span><p className="font-medium text-purple-600">{selectedSchool.staffCount}</p></div>
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Switch to this School</button>
                                <button className="px-4 py-2 border rounded-lg hover:bg-gray-50">Edit</button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Add New School</DialogTitle></DialogHeader>
                    <div className="space-y-4 pt-4">
                        <div><label className="block text-sm font-medium mb-1">School Name</label><input type="text" className="w-full px-4 py-2 border rounded-lg" placeholder="Enter school name" /></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-sm font-medium mb-1">School Code</label><input type="text" className="w-full px-4 py-2 border rounded-lg" placeholder="GWD-XXX" /></div>
                            <div><label className="block text-sm font-medium mb-1">City</label><input type="text" className="w-full px-4 py-2 border rounded-lg" placeholder="City" /></div>
                        </div>
                        <div><label className="block text-sm font-medium mb-1">Address</label><textarea className="w-full px-4 py-2 border rounded-lg" rows={2} placeholder="Full address" /></div>
                        <div className="flex justify-end gap-3 pt-4">
                            <button onClick={() => setShowAddDialog(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
                            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Add School</button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
