'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getLibraryStudents } from '@/lib/actions/scaffolding-bridge';

interface BookIssue { id: string; bookTitle: string; studentName: string; studentClass: string; issueDate: string; dueDate: string; status: string; }

export default function IssueBookPage() {
    const [mode, setMode] = useState<'issue' | 'return'>('issue');
    const [selectedBook, setSelectedBook] = useState('');
    const [selectedStudent, setSelectedStudent] = useState('');
    const [bookSearch, setBookSearch] = useState('');
    const [students, setStudents] = useState<any[]>([]);
    const [issuedBooks, setIssuedBooks] = useState<BookIssue[]>([]);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => { getLibraryStudents().then(setStudents); }, []);

    const handleReturn = (issueId: string) => {
        setIssuedBooks(prev => prev.map(issue => issue.id === issueId ? { ...issue, status: 'RETURNED' } : issue));
        setMessage({ type: 'success', text: 'Book returned successfully!' });
    };

    const getStatusBadge = (status: string) => {
        const colors: Record<string, string> = { ISSUED: 'bg-blue-100 text-blue-700', OVERDUE: 'bg-red-100 text-red-700', RETURNED: 'bg-green-100 text-green-700', LOST: 'bg-gray-100 text-gray-700' };
        return <Badge className={colors[status] || 'bg-gray-100 text-gray-700'}>{status}</Badge>;
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div><h1 className="text-3xl font-bold">Issue / Return Books</h1><p className="text-gray-600 mt-1">Manage book lending and returns</p></div>
                <Link href="/library" className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">← Back to Library</Link>
            </div>

            {message && (<div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{message.text}</div>)}

            <div className="flex gap-2">
                <button onClick={() => setMode('issue')} className={`px-6 py-3 rounded-lg font-medium ${mode === 'issue' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>📖 Issue Book</button>
                <button onClick={() => setMode('return')} className={`px-6 py-3 rounded-lg font-medium ${mode === 'return' ? 'bg-green-600 text-white' : 'bg-gray-100'}`}>↩️ Return Book</button>
            </div>

            {mode === 'issue' ? (
                <Card>
                    <CardHeader><CardTitle>Issue New Book</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-2">Search & Select Book</label>
                            <input type="text" placeholder="Search by title or ISBN..." value={bookSearch} onChange={(e) => setBookSearch(e.target.value)} className="w-full px-4 py-2 border rounded-lg mb-2" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2">Select Student</label>
                            <select value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)} className="w-full px-4 py-2 border rounded-lg">
                                <option value="">Select a student...</option>
                                {students.map((student: any) => (<option key={student.id} value={student.id}>{student.name} - Class {student.class} ({student.admissionNo})</option>))}
                            </select>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg text-sm"><p><strong>Loan Period:</strong> 14 days</p><p><strong>Fine Rate:</strong> ₹2 per day after due date</p></div>
                        <button className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">Issue Book</button>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardHeader><CardTitle>Currently Issued Books</CardTitle></CardHeader>
                    <CardContent>
                        {issuedBooks.filter(i => i.status !== 'RETURNED').length === 0 ? <p className="text-gray-500 text-center py-8">No books currently issued.</p> : (
                            <table className="w-full">
                                <thead className="bg-gray-50"><tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Book</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                                </tr></thead>
                                <tbody className="divide-y">
                                    {issuedBooks.filter(i => i.status !== 'RETURNED').map(issue => (
                                        <tr key={issue.id} className={`hover:bg-gray-50 ${issue.status === 'OVERDUE' ? 'bg-red-50' : ''}`}>
                                            <td className="px-4 py-3 font-medium">{issue.bookTitle}</td>
                                            <td className="px-4 py-3"><div>{issue.studentName}</div><div className="text-xs text-gray-500">{issue.studentClass}</div></td>
                                            <td className="px-4 py-3">{issue.dueDate}</td>
                                            <td className="px-4 py-3">{getStatusBadge(issue.status)}</td>
                                            <td className="px-4 py-3"><button onClick={() => handleReturn(issue.id)} className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700">Return</button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
