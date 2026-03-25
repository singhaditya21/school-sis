'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

// Mock data for UI presentation
const MOCK_INCIDENTS = [
    { id: '1', studentName: 'Aarav Sharma', type: 'INJURY', description: 'Scraped knee during recess on the playground.', actionTaken: 'Cleaned and bandaged. Ice pack applied.', incidentDate: '2026-03-24T10:15:00Z', parentNotified: true },
    { id: '2', studentName: 'Priya Patel', type: 'ILLNESS', description: 'Complained of headache and nausea.', actionTaken: 'Rested in infirmary for 1 hour. Sent home.', incidentDate: '2026-03-23T14:30:00Z', parentNotified: true },
    { id: '3', studentName: 'Rahul Singh', type: 'ALLERGY', description: 'Mild allergic reaction (hives) after lunch.', actionTaken: 'Administered antihistamine as per medical file.', incidentDate: '2026-03-22T13:00:00Z', parentNotified: false }
];

export default function HealthPage() {
    const [view, setView] = useState<'dashboard' | 'log'>('dashboard');

    const typeColor = (t: string) => {
        const m: Record<string, string> = { INJURY: 'bg-red-100 text-red-700', ILLNESS: 'bg-orange-100 text-orange-700', ALLERGY: 'bg-yellow-100 text-yellow-700', EMERGENCY: 'bg-red-200 text-red-800', OTHER: 'bg-gray-100 text-gray-700' };
        return m[t] || 'bg-gray-100 text-gray-700';
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">Health & Medical</h1>
                    <p className="text-gray-500 mt-1">Student health records, incident logging, and infirmary management.</p>
                </div>
                {view === 'dashboard' ? (
                    <Button onClick={() => setView('log')} className="bg-red-600 hover:bg-red-700 text-white shadow-sm transition-all flex items-center gap-2">
                        <span>+</span> Log New Incident
                    </Button>
                ) : (
                    <Button variant="outline" onClick={() => setView('dashboard')}>Back to Dashboard</Button>
                )}
            </div>

            {view === 'dashboard' ? (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card className="shadow-sm border-blue-100 bg-blue-50/40">
                            <CardContent className="pt-6">
                                <div className="text-sm font-medium text-blue-600 mb-1">Active Medical Files</div>
                                <div className="text-3xl font-bold text-gray-900">1,245</div>
                            </CardContent>
                        </Card>
                        <Card className="shadow-sm border-orange-100 bg-orange-50/40">
                            <CardContent className="pt-6">
                                <div className="text-sm font-medium text-orange-600 mb-1">Total Incidents (YTD)</div>
                                <div className="text-3xl font-bold text-gray-900">84</div>
                            </CardContent>
                        </Card>
                        <Card className="shadow-sm border-red-200 bg-red-50/40 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-16 h-16 bg-red-100 rounded-bl-full -mr-8 -mt-8"></div>
                            <CardContent className="pt-6 relative z-10">
                                <div className="text-sm font-semibold text-red-600 mb-1 flex items-center gap-2">
                                    <span className="relative flex h-2 w-2">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                    </span>
                                    Today&apos;s Incidents
                                </div>
                                <div className="text-3xl font-bold text-red-700">2</div>
                            </CardContent>
                        </Card>
                        <Card className="shadow-sm border-green-100 bg-green-50/40">
                            <CardContent className="pt-6">
                                <div className="text-sm font-medium text-green-600 mb-1">Immunization Compliance</div>
                                <div className="text-3xl font-bold text-gray-900">98.5%</div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="shadow-sm overflow-hidden">
                        <div className="p-5 border-b bg-gray-50/50 flex justify-between items-center">
                            <h3 className="font-semibold text-gray-900 text-lg">Recent Medical Incidents</h3>
                            <div className="text-sm text-gray-500 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-red-500 block"></span> Injury
                                <span className="w-2 h-2 rounded-full bg-orange-500 block ml-2"></span> Illness
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-white border-b border-gray-100 text-xs text-gray-500 font-semibold uppercase tracking-wider">
                                    <tr>
                                        <th className="px-5 py-4">Date & Time</th>
                                        <th className="px-5 py-4">Student</th>
                                        <th className="px-5 py-4">Category</th>
                                        <th className="px-5 py-4">Incident Description & Action</th>
                                        <th className="px-5 py-4 text-center">Parent Alert</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {MOCK_INCIDENTS.map(inc => (
                                        <tr key={inc.id} className="hover:bg-gray-50/60 transition-colors">
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <div className="font-medium text-gray-900">{new Date(inc.incidentDate).toLocaleDateString('en-IN')}</div>
                                                <div className="text-xs text-gray-500">{new Date(inc.incidentDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                            </td>
                                            <td className="px-5 py-4 font-semibold text-gray-900 whitespace-nowrap">
                                                {inc.studentName}
                                                <div className="text-xs font-normal text-gray-500 mt-0.5">Grade 5 - Sec B</div>
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <Badge className={`${typeColor(inc.type)} font-bold tracking-tight shadow-none border-0`}>{inc.type}</Badge>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="text-gray-900 font-medium mb-1 line-clamp-1">{inc.description}</div>
                                                <div className="text-xs text-gray-600 line-clamp-2">↳ {inc.actionTaken}</div>
                                            </td>
                                            <td className="px-5 py-4 text-center">
                                                {inc.parentNotified ? (
                                                    <span className="inline-flex items-center justify-center bg-green-100 text-green-700 w-8 h-8 rounded-full">✓</span>
                                                ) : (
                                                    <span className="inline-flex items-center justify-center bg-gray-100 text-gray-400 w-8 h-8 rounded-full">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </>
            ) : (
                <div className="max-w-3xl">
                    <Card className="shadow-lg border-red-100">
                        <CardHeader className="bg-red-50/50 border-b border-red-100 pb-6">
                            <CardTitle className="text-red-900">Log Medical Incident</CardTitle>
                            <CardDescription className="text-red-700/80">Record student injuries, illnesses, or emergencies observed on campus.</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <form className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label className="font-semibold text-gray-700">Student Name</Label>
                                        <Input placeholder="Search student by name or ID..." autoFocus className="focus:ring-red-500 focus:border-red-500" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="font-semibold text-gray-700">Incident Date & Time</Label>
                                        <Input type="datetime-local" className="focus:ring-red-500 focus:border-red-500" />
                                    </div>
                                </div>

                                <div className="space-y-3 pt-2">
                                    <Label className="font-semibold text-gray-700">Incident Category</Label>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        {['INJURY', 'ILLNESS', 'ALLERGY', 'EMERGENCY'].map((cat) => (
                                            <label key={cat} className={`border rounded-lg p-3 flex flex-col items-center justify-center cursor-pointer transition-all hover:bg-gray-50 ${cat === 'INJURY' ? 'border-red-500 ring-2 ring-red-200 bg-red-50' : 'border-gray-200'}`}>
                                                <input type="radio" name="category" value={cat} className="sr-only" defaultChecked={cat === 'INJURY'} />
                                                <span className={`text-sm font-bold ${cat === 'INJURY' ? 'text-red-700' : 'text-gray-600'}`}>{cat}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2 pt-2">
                                    <Label className="font-semibold text-gray-700">Detailed Description</Label>
                                    <Textarea placeholder="What happened? Where did it happen? What were the symptoms?" className="h-24 resize-none focus:ring-red-500 focus:border-red-500" />
                                </div>

                                <div className="space-y-2 pt-2">
                                    <Label className="font-semibold text-gray-700">Action Taken (Nurse/Teacher)</Label>
                                    <Textarea placeholder="First aid applied, medications given, rest periods, etc." className="h-24 resize-none focus:ring-red-500 focus:border-red-500" />
                                </div>

                                <div className="bg-orange-50 border border-orange-200 p-4 rounded-lg flex items-start gap-3 mt-6">
                                    <input type="checkbox" id="notifyParent" className="mt-1 w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500" defaultChecked />
                                    <label htmlFor="notifyParent" className="text-sm text-orange-900">
                                        <span className="font-bold block">Immediately Notify Parents via SMS/App Notification</span>
                                        An automated alert will be dispatched to the primary emergency contact.
                                    </label>
                                </div>

                                <div className="flex justify-end gap-3 pt-6 border-t mt-6">
                                    <Button type="button" variant="ghost" onClick={() => setView('dashboard')}>Cancel Log</Button>
                                    <Button type="button" onClick={() => setView('dashboard')} className="bg-red-600 hover:bg-red-700 text-white transition-colors">Save Medical Log</Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
