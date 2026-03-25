'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// Minimal inline mocks to resolve import errors
const IDCardService = {
    getCardStats: () => ({
        students: { total: 1200, pending: 45, printed: 800, issued: 355 },
        staff: { total: 85, pending: 2, printed: 50, issued: 33 }
    }),
    getTemplates: (type: string) => [
        { id: 't1', name: 'Standard Blue', backgroundColor: '#1e3a8a', textColor: '#ffffff' },
        { id: 't2', name: 'Modern White', backgroundColor: '#ffffff', textColor: '#000000' }
    ],
    getClasses: () => ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    getDepartments: () => ['Science', 'Math', 'Language', 'Sports', 'Admin'],
    getStudentCards: (filters: any) => [
        { id: 's1', studentName: 'Aarav Kumar', class: '10', section: 'A', rollNo: '101', studentId: 'ST2024001', status: 'issued', validFrom: '2024', validTo: '2025' },
        { id: 's2', studentName: 'Neha Sharma', class: '10', section: 'B', rollNo: '102', studentId: 'ST2024002', status: 'pending', validFrom: '2024', validTo: '2025' }
    ],
    getStaffCards: (filters: any) => [
        { id: 'st1', staffName: 'Rahul Verma', designation: 'Teacher', department: 'Science', staffId: 'EMP001', status: 'issued', validFrom: '2024', validTo: '2025' }
    ]
};

export default function IDCardsPage() {
    const [activeTab, setActiveTab] = useState<'student' | 'staff'>('student');
    const [classFilter, setClassFilter] = useState('');
    const [deptFilter, setDeptFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [selectedCards, setSelectedCards] = useState<string[]>([]);

    const stats = IDCardService.getCardStats();
    const templates = IDCardService.getTemplates(activeTab);
    const classes = IDCardService.getClasses();
    const departments = IDCardService.getDepartments();

    const studentCards = IDCardService.getStudentCards({ class: classFilter || undefined, status: statusFilter || undefined });
    const staffCards = IDCardService.getStaffCards({ department: deptFilter || undefined, status: statusFilter || undefined });

    const cards = activeTab === 'student' ? studentCards : staffCards;
    const currentStats = activeTab === 'student' ? stats.students : stats.staff;

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'issued': return 'bg-green-100 text-green-800';
            case 'printed': return 'bg-blue-100 text-blue-800';
            case 'pending': return 'bg-yellow-100 text-yellow-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const toggleSelect = (id: string) => setSelectedCards((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);
    const selectAll = () => setSelectedCards(selectedCards.length === cards.length ? [] : cards.map((c) => c.id));

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
                <CardHeader><CardTitle>Available Templates</CardTitle><CardDescription>Select a template for card generation</CardDescription></CardHeader>
                <CardContent>
                    <div className="flex gap-4">
                        {templates.map((template) => (
                            <div key={template.id} className="p-4 border-2 rounded-lg cursor-pointer hover:border-blue-500 transition-all" style={{ borderColor: template.backgroundColor }}>
                                <div className="w-32 h-20 rounded mb-2 flex items-center justify-center" style={{ backgroundColor: template.backgroundColor, color: template.textColor }}><span className="text-sm font-medium">Preview</span></div>
                                <p className="text-sm font-medium text-center">{template.name}</p>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>Filters</CardTitle></CardHeader>
                <CardContent>
                    <div className="flex gap-4">
                        {activeTab === 'student' ? (
                            <select className="p-2 border rounded-md" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
                                <option value="">All Classes</option>{classes.map((c) => (<option key={c} value={c}>{c}</option>))}
                            </select>
                        ) : (
                            <select className="p-2 border rounded-md" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
                                <option value="">All Departments</option>{departments.map((d) => (<option key={d} value={d}>{d}</option>))}
                            </select>
                        )}
                        <select className="p-2 border rounded-md" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                            <option value="">All Status</option><option value="pending">Pending</option><option value="printed">Printed</option><option value="issued">Issued</option>
                        </select>
                        <Button variant="outline" onClick={() => { setClassFilter(''); setDeptFilter(''); setStatusFilter(''); }}>Clear</Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle>{activeTab === 'student' ? 'Student' : 'Staff'} ID Cards</CardTitle>
                    <Button variant="outline" size="sm" onClick={selectAll}>{selectedCards.length === cards.length ? 'Deselect All' : 'Select All'}</Button>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {cards.map((card) => (
                            <div key={card.id} onClick={() => toggleSelect(card.id)} className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${selectedCards.includes(card.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white rounded-lg p-4 mb-3">
                                    <div className="flex items-start justify-between mb-3">
                                        <div><p className="text-xs opacity-75">SCHOOL NAME</p><p className="font-bold">{'studentName' in card ? card.studentName : card.staffName}</p></div>
                                        <div className="w-12 h-14 bg-white/20 rounded flex items-center justify-center text-xs">Photo</div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 text-xs">
                                        {'class' in card ? (<><p>Class: {card.class}-{card.section}</p><p>Roll: {card.rollNo}</p></>) : (<><p>{card.designation}</p><p>{card.department}</p></>)}
                                    </div>
                                    <div className="mt-2 pt-2 border-t border-white/20 flex justify-between items-center">
                                        <span className="text-xs opacity-75">{'studentId' in card ? card.studentId : card.staffId}</span>
                                        <div className="w-8 h-8 bg-white rounded flex items-center justify-center text-[8px] text-black">QR</div>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between"><Badge className={getStatusColor(card.status)}>{card.status}</Badge><span className="text-xs text-muted-foreground">Valid: {card.validFrom} to {card.validTo}</span></div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
