'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { IDCardService } from '@/lib/services/idcard/idcard.service';

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

    const studentCards = IDCardService.getStudentCards({
        class: classFilter || undefined,
        status: statusFilter || undefined,
    });

    const staffCards = IDCardService.getStaffCards({
        department: deptFilter || undefined,
        status: statusFilter || undefined,
    });

    const cards = activeTab === 'student' ? studentCards : staffCards;
    const currentStats = activeTab === 'student' ? stats.students : stats.staff;

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'issued':
                return 'bg-green-100 text-green-800';
            case 'printed':
                return 'bg-blue-100 text-blue-800';
            case 'pending':
                return 'bg-yellow-100 text-yellow-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const toggleSelect = (id: string) => {
        setSelectedCards((prev) =>
            prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
        );
    };

    const selectAll = () => {
        if (selectedCards.length === cards.length) {
            setSelectedCards([]);
        } else {
            setSelectedCards(cards.map((c) => c.id));
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">ID Card Generation</h1>
                    <p className="text-muted-foreground">Generate and manage student & staff ID cards</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" disabled={selectedCards.length === 0}>
                        🖨️ Print Selected ({selectedCards.length})
                    </Button>
                    <Button disabled={selectedCards.length === 0}>
                        📄 Export PDF
                    </Button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2">
                <Button
                    variant={activeTab === 'student' ? 'default' : 'outline'}
                    onClick={() => { setActiveTab('student'); setSelectedCards([]); }}
                >
                    🎓 Student Cards
                </Button>
                <Button
                    variant={activeTab === 'staff' ? 'default' : 'outline'}
                    onClick={() => { setActiveTab('staff'); setSelectedCards([]); }}
                >
                    👔 Staff Cards
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Total Cards</CardDescription>
                        <CardTitle className="text-3xl">{currentStats.total}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Pending</CardDescription>
                        <CardTitle className="text-3xl text-yellow-600">{currentStats.pending}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Printed</CardDescription>
                        <CardTitle className="text-3xl text-blue-600">{currentStats.printed}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Issued</CardDescription>
                        <CardTitle className="text-3xl text-green-600">{currentStats.issued}</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {/* Templates */}
            <Card>
                <CardHeader>
                    <CardTitle>Available Templates</CardTitle>
                    <CardDescription>Select a template for card generation</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-4">
                        {templates.map((template) => (
                            <div
                                key={template.id}
                                className="p-4 border-2 rounded-lg cursor-pointer hover:border-blue-500 transition-all"
                                style={{ borderColor: template.backgroundColor }}
                            >
                                <div
                                    className="w-32 h-20 rounded mb-2 flex items-center justify-center"
                                    style={{ backgroundColor: template.backgroundColor, color: template.textColor }}
                                >
                                    <span className="text-sm font-medium">Preview</span>
                                </div>
                                <p className="text-sm font-medium text-center">{template.name}</p>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle>Filters</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-4">
                        {activeTab === 'student' ? (
                            <select
                                className="p-2 border rounded-md"
                                value={classFilter}
                                onChange={(e) => setClassFilter(e.target.value)}
                            >
                                <option value="">All Classes</option>
                                {classes.map((c) => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        ) : (
                            <select
                                className="p-2 border rounded-md"
                                value={deptFilter}
                                onChange={(e) => setDeptFilter(e.target.value)}
                            >
                                <option value="">All Departments</option>
                                {departments.map((d) => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                        )}
                        <select
                            className="p-2 border rounded-md"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <option value="">All Status</option>
                            <option value="pending">Pending</option>
                            <option value="printed">Printed</option>
                            <option value="issued">Issued</option>
                        </select>
                        <Button variant="outline" onClick={() => { setClassFilter(''); setDeptFilter(''); setStatusFilter(''); }}>
                            Clear
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Cards Grid */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>{activeTab === 'student' ? 'Student' : 'Staff'} ID Cards</CardTitle>
                        <Button variant="outline" size="sm" onClick={selectAll}>
                            {selectedCards.length === cards.length ? 'Deselect All' : 'Select All'}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                        {cards.map((card) => (
                            <div
                                key={card.id}
                                onClick={() => toggleSelect(card.id)}
                                className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${selectedCards.includes(card.id)
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-gray-200 hover:border-gray-300'
                                    }`}
                            >
                                {/* ID Card Preview */}
                                <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white rounded-lg p-4 mb-3">
                                    <div className="flex items-start justify-between mb-3">
                                        <div>
                                            <p className="text-xs opacity-75">SCHOOL NAME</p>
                                            <p className="font-bold">{'studentName' in card ? card.studentName : card.staffName}</p>
                                        </div>
                                        <div className="w-12 h-14 bg-white/20 rounded flex items-center justify-center text-xs">
                                            Photo
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 text-xs">
                                        {'class' in card ? (
                                            <>
                                                <p>Class: {card.class}-{card.section}</p>
                                                <p>Roll: {card.rollNo}</p>
                                            </>
                                        ) : (
                                            <>
                                                <p>{card.designation}</p>
                                                <p>{card.department}</p>
                                            </>
                                        )}
                                    </div>
                                    <div className="mt-2 pt-2 border-t border-white/20 flex justify-between items-center">
                                        <span className="text-xs opacity-75">
                                            {'studentId' in card ? card.studentId : card.staffId}
                                        </span>
                                        <div className="w-8 h-8 bg-white rounded flex items-center justify-center text-[8px] text-black">
                                            QR
                                        </div>
                                    </div>
                                </div>
                                {/* Card Meta */}
                                <div className="flex items-center justify-between">
                                    <Badge className={getStatusColor(card.status)}>{card.status}</Badge>
                                    <span className="text-xs text-muted-foreground">
                                        Valid: {card.validFrom} to {card.validTo}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
