'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Inline mock data for library history
interface BookIssue {
    id: string;
    bookId: string;
    bookTitle: string;
    studentId: string;
    studentName: string;
    studentClass: string;
    issueDate: string;
    dueDate: string;
    returnDate?: string;
    status: 'ISSUED' | 'OVERDUE' | 'RETURNED' | 'LOST';
    fineAmount: number;
    finePaid: boolean;
}

const mockIssues: BookIssue[] = [
    { id: '1', bookId: 'b1', bookTitle: 'Introduction to Algorithms', studentId: 'stu1', studentName: 'Aarav Kumar', studentClass: '10-A', issueDate: '2023-10-01', dueDate: '2023-10-15', returnDate: '2023-10-14', status: 'RETURNED', fineAmount: 0, finePaid: true },
    { id: '2', bookId: 'b2', bookTitle: 'Physics Vol 1', studentId: 'stu2', studentName: 'Neha Sharma', studentClass: '11-B', issueDate: '2023-11-01', dueDate: '2023-11-15', status: 'OVERDUE', fineAmount: 50, finePaid: false },
    { id: '3', bookId: 'b3', bookTitle: 'Chemistry Basics', studentId: 'stu3', studentName: 'Rohan Gupta', studentClass: '9-C', issueDate: new Date().toISOString().split('T')[0], dueDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0], status: 'ISSUED', fineAmount: 0, finePaid: true }
];

const isOverdue = (dueDate: string) => new Date(dueDate) < new Date();
const calculateFine = (dueDate: string, returnDate?: string) => {
    const end = returnDate ? new Date(returnDate) : new Date();
    const due = new Date(dueDate);
    if (end <= due) return 0;
    const diffDays = Math.ceil((end.getTime() - due.getTime()) / (1000 * 3600 * 24));
    return diffDays * 5; // 5 Rs per day
};

export default function LibraryHistoryPage() {
    const [filter, setFilter] = useState<'ALL' | 'ISSUED' | 'OVERDUE' | 'RETURNED'>('ALL');
    const [searchQuery, setSearchQuery] = useState('');

    const processedIssues = mockIssues.map(issue => {
        if (issue.status === 'ISSUED' && isOverdue(issue.dueDate)) {
            return { ...issue, status: 'OVERDUE' as const, fineAmount: calculateFine(issue.dueDate) };
        }
        return { ...issue, fineAmount: issue.status === 'RETURNED' && issue.returnDate ? calculateFine(issue.dueDate, issue.returnDate) : issue.fineAmount };
    });

    const filteredIssues = processedIssues.filter(issue => {
        const matchesFilter = filter === 'ALL' || issue.status === filter;
        const matchesSearch = !searchQuery || issue.studentName.toLowerCase().includes(searchQuery.toLowerCase()) || issue.bookTitle.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    const stats = {
        total: processedIssues.length,
        issued: processedIssues.filter(i => i.status === 'ISSUED').length,
        overdue: processedIssues.filter(i => i.status === 'OVERDUE').length,
        returned: processedIssues.filter(i => i.status === 'RETURNED').length,
        totalFines: processedIssues.reduce((sum, i) => sum + i.fineAmount, 0),
        unpaidFines: processedIssues.filter(i => !i.finePaid && i.fineAmount > 0).reduce((sum, i) => sum + i.fineAmount, 0),
    };

    const getStatusBadge = (status: BookIssue['status']) => {
        const colors: Record<string, string> = { ISSUED: 'bg-blue-100 text-blue-700', OVERDUE: 'bg-red-100 text-red-700', RETURNED: 'bg-green-100 text-green-700', LOST: 'bg-gray-100 text-gray-700' };
        return <Badge className={colors[status]}>{status}</Badge>;
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div><h1 className="text-3xl font-bold">Borrowing History</h1><p className="text-gray-600 mt-1">Track all book issues, returns, and fines</p></div>
                <Link href="/library" className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">← Back to Library</Link>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <Card className="cursor-pointer" onClick={() => setFilter('ALL')}><CardContent className="pt-4"><div className="text-sm text-gray-500">Total</div><div className="text-2xl font-bold text-blue-600">{stats.total}</div></CardContent></Card>
                <Card className="cursor-pointer" onClick={() => setFilter('ISSUED')}><CardContent className="pt-4"><div className="text-sm text-gray-500">Issued</div><div className="text-2xl font-bold text-purple-600">{stats.issued}</div></CardContent></Card>
                <Card className="cursor-pointer" onClick={() => setFilter('OVERDUE')}><CardContent className="pt-4"><div className="text-sm text-gray-500">Overdue</div><div className="text-2xl font-bold text-red-600">{stats.overdue}</div></CardContent></Card>
                <Card className="cursor-pointer" onClick={() => setFilter('RETURNED')}><CardContent className="pt-4"><div className="text-sm text-gray-500">Returned</div><div className="text-2xl font-bold text-green-600">{stats.returned}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Total Fines</div><div className="text-2xl font-bold text-orange-600">₹{stats.totalFines}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Unpaid Fines</div><div className="text-2xl font-bold text-red-600">₹{stats.unpaidFines}</div></CardContent></Card>
            </div>

            <div className="flex gap-4 items-center">
                <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="flex-1 px-4 py-2 border rounded-lg" />
                <div className="flex gap-2">
                    {(['ALL', 'ISSUED', 'OVERDUE', 'RETURNED'] as const).map(status => (
                        <button key={status} onClick={() => setFilter(status)} className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === status ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>{status}</button>
                    ))}
                </div>
            </div>

            <Card>
                <CardContent className="p-0">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-left">Book</th><th className="px-4 py-3 text-left">Student</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-right">Fine</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {filteredIssues.map(issue => (
                                <tr key={issue.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium">{issue.bookTitle}</td>
                                    <td className="px-4 py-3">{issue.studentName}</td>
                                    <td className="px-4 py-3">{getStatusBadge(issue.status)}</td>
                                    <td className="px-4 py-3 text-right">{issue.fineAmount > 0 ? <span className="text-red-600 font-semibold">₹{issue.fineAmount}</span> : '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
}
