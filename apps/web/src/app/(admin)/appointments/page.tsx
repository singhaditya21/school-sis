'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getAppointments } from '@/lib/actions/scaffolding-bridge';

export default function AppointmentsPage() {
    const [appointments, setAppointments] = useState<any[]>([]);
    useEffect(() => { getAppointments().then(setAppointments); }, []);

    const getStatusColor = (s: string) => ({ scheduled: 'bg-blue-100 text-blue-800', completed: 'bg-green-100 text-green-800', cancelled: 'bg-red-100 text-red-800' }[s] || 'bg-gray-100 text-gray-800');

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div><h1 className="text-3xl font-bold">Appointments</h1><p className="text-gray-600 mt-1">Manage meetings and appointments</p></div>
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">+ New Appointment</button>
            </div>
            {appointments.length === 0 ? <Card><CardContent className="py-12 text-center text-gray-500">No appointments scheduled.</CardContent></Card> : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {appointments.map((appt: any) => (
                        <Card key={appt.id}>
                            <CardHeader>
                                <CardTitle className="flex items-center justify-between text-lg">
                                    <span>{appt.title}</span><Badge className={getStatusColor(appt.status)}>{appt.status}</Badge>
                                </CardTitle>
                                <p className="text-sm text-gray-500">{appt.date} at {appt.time} • {appt.duration} min</p>
                            </CardHeader>
                            <CardContent>
                                <p className="text-gray-700 mb-2">{appt.description}</p>
                                <p className="text-sm text-gray-500">With: <strong>{appt.with}</strong></p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
