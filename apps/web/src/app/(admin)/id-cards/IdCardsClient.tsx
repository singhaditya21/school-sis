'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface IdCard {
    id: string;
    status: string;
    personId: string;
    validFrom: string | Date;
    validTo: string | Date;
    studentFirstName?: string;
    studentLastName?: string;
    studentRollNo?: string | null;
    staffFirstName?: string;
    staffLastName?: string;
    staffRole?: string;
}

interface IdCardStats {
    idCards: number;
    pendingCards: number;
}

export default function IdCardsClient({ stats, templates, studentCards, staffCards }: { stats: IdCardStats, templates: unknown, studentCards: IdCard[], staffCards: IdCard[] }) {
    const [activeTab, setActiveTab] = useState<'student' | 'staff'>('student');
    const [statusFilter, setStatusFilter] = useState('');
    const [selectedCards, setSelectedCards] = useState<string[]>([]);

    const cards = activeTab === 'student' ? studentCards : staffCards;
    
    // Derived stats from the props
    const currentStats = {
        total: activeTab === 'student' ? stats.idCards : stats.idCards, // Could be split properly in backend, just mocked structure here for now
        pending: stats.pendingCards,
        printed: 0,
        issued: 0,
    };

    const filteredCards = cards.filter((c: IdCard) => statusFilter ? c.status.toLowerCase() === statusFilter.toLowerCase() : true);

    const getStatusColor = (status: string) => {
        const s = status.toLowerCase();
        switch (s) {
            case 'issued': return 'bg-green-100 text-green-800';
            case 'printed': return 'bg-blue-100 text-blue-800';
            case 'pending': return 'bg-yellow-100 text-yellow-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const toggleSelect = (id: string) => setSelectedCards((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);
    const selectAll = () => setSelectedCards(selectedCards.length === filteredCards.length ? [] : filteredCards.map((c: IdCard) => c.id));

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div><h1 className="text-3xl font-bold tracking-tight">ID Card Generation</h1><p className="text-muted-foreground">Generate and manage student & staff ID cards</p></div>
                <div className="flex gap-2">
                    <Button variant="outline" disabled={selectedCards.length === 0}>🖨️ Print Selected ({selectedCards.length})</Button>
                    <Button disabled={selectedCards.length === 0}>📄 Export PDF</Button>
                </div>
            </div>

            <div className="flex gap-2">
                <Button variant={activeTab === 'student' ? 'default' : 'outline'} onClick={() => { setActiveTab('student'); setSelectedCards([]); }}>🎓 Student Cards</Button>
                <Button variant={activeTab === 'staff' ? 'default' : 'outline'} onClick={() => { setActiveTab('staff'); setSelectedCards([]); }}>👔 Staff Cards</Button>
            </div>

            <div className="grid grid-cols-4 gap-4">
                <Card><CardHeader className="pb-2"><CardDescription>Total Cards</CardDescription><CardTitle className="text-3xl">{currentStats.total}</CardTitle></CardHeader></Card>
                <Card><CardHeader className="pb-2"><CardDescription>Pending</CardDescription><CardTitle className="text-3xl text-yellow-600">{currentStats.pending}</CardTitle></CardHeader></Card>
                <Card><CardHeader className="pb-2"><CardDescription>Printed</CardDescription><CardTitle className="text-3xl text-blue-600">{currentStats.printed}</CardTitle></CardHeader></Card>
                <Card><CardHeader className="pb-2"><CardDescription>Issued</CardDescription><CardTitle className="text-3xl text-green-600">{currentStats.issued}</CardTitle></CardHeader></Card>
            </div>

            <Card>
                <CardHeader><CardTitle>Filters</CardTitle></CardHeader>
                <CardContent>
                    <div className="flex gap-4">
                        <select className="p-2 border rounded-md" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                            <option value="">All Status</option><option value="pending">Pending</option><option value="printed">Printed</option><option value="issued">Issued</option>
                        </select>
                        <Button variant="outline" onClick={() => { setStatusFilter(''); }}>Clear</Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle>{activeTab === 'student' ? 'Student' : 'Staff'} ID Cards</CardTitle>
                    <Button variant="outline" size="sm" onClick={selectAll}>{selectedCards.length === filteredCards.length && filteredCards.length > 0 ? 'Deselect All' : 'Select All'}</Button>
                </CardHeader>
                <CardContent>
                    {filteredCards.length === 0 ? (
                        <div className="text-center py-10 text-gray-500">No cards found.</div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredCards.map((card: IdCard) => (
                                <div key={card.id} onClick={() => toggleSelect(card.id)} className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${selectedCards.includes(card.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                    <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white rounded-lg p-4 mb-3">
                                        <div className="flex items-start justify-between mb-3">
                                            <div><p className="text-xs opacity-75">SCHOOL NAME</p><p className="font-bold">{activeTab === 'student' ? `${card.studentFirstName} ${card.studentLastName}` : `${card.staffFirstName} ${card.staffLastName}`}</p></div>
                                            <div className="w-12 h-14 bg-white/20 rounded flex items-center justify-center text-xs">Photo</div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-1 text-xs">
                                            {activeTab === 'student' ? (<><p>Roll: {card.studentRollNo || 'N/A'}</p></>) : (<><p>Role: {card.staffRole}</p></>)}
                                        </div>
                                        <div className="mt-2 pt-2 border-t border-white/20 flex justify-between items-center">
                                            <span className="text-xs opacity-75">{card.personId.substring(0,8)}</span>
                                            <div className="w-8 h-8 bg-white rounded flex items-center justify-center text-[8px] text-black">QR</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between"><Badge className={getStatusColor(card.status)}>{card.status}</Badge><span className="text-xs text-muted-foreground">Valid: {new Date(card.validFrom).getFullYear()} to {new Date(card.validTo).getFullYear()}</span></div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
