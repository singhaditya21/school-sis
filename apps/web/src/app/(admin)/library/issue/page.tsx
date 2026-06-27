'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getLibraryStudents, getLibraryHistory } from '@/lib/services/library/library.service';
import { getBooks, issueBook, returnBook } from '@/lib/actions/library';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

interface BookIssue { 
    id: string; 
    bookTitle: string; 
    studentName: string; 
    studentClass: string; 
    issueDate: string; 
    dueDate: string; 
    status: string; 
}

export default function IssueBookPage() {
    const [mode, setMode] = useState<'issue' | 'return'>('issue');
    const [selectedBook, setSelectedBook] = useState('');
    const [selectedStudent, setSelectedStudent] = useState('');
    const [bookSearch, setBookSearch] = useState('');
    const [students, setStudents] = useState<any[]>([]);
    const [books, setBooks] = useState<any[]>([]);
    const [issuedBooks, setIssuedBooks] = useState<BookIssue[]>([]);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const loadData = () => {
        getLibraryStudents().then(setStudents);
        getBooks().then(setBooks);
        getLibraryHistory().then((history) => {
            const mapped = history.map(issue => {
                const sName = issue.studentName ? `${issue.studentName} ${issue.studentLastName || ''}`.trim() : `${issue.userName} ${issue.userLastName || ''}`.trim();
                return {
                    id: issue.id,
                    bookTitle: issue.bookTitle || 'Unknown Book',
                    studentName: sName || 'Unknown Borrower',
                    studentClass: issue.studentClass || 'N/A',
                    issueDate: issue.issueDate ? new Date(issue.issueDate).toISOString().split('T')[0] : '',
                    dueDate: issue.dueDate ? new Date(issue.dueDate).toISOString().split('T')[0] : '',
                    status: issue.status,
                };
            });
            setIssuedBooks(mapped);
        });
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleIssue = async () => {
        if (!selectedBook || !selectedStudent) {
            setMessage({ type: 'error', text: 'Please select both book and student.' });
            return;
        }

        const student = students.find(s => s.id === selectedStudent);
        const book = books.find(b => b.id === selectedBook);
        if (!student || !book) return;

        if (!student.userId) {
            setMessage({ type: 'error', text: 'No user account found for selected student or their primary guardian.' });
            return;
        }

        const today = new Date();
        const dueDate = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        try {
            const res = await issueBook({
                bookId: selectedBook,
                issuedToUserId: student.userId,
                issuedToStudentId: student.id,
                dueDate,
            });

            if (res.success) {
                setMessage({ type: 'success', text: `"${book.title}" successfully issued to ${student.name}.` });
                setSelectedBook('');
                setSelectedStudent('');
                loadData();
            } else {
                setMessage({ type: 'error', text: res.error || 'Failed to issue book.' });
            }
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'An error occurred.' });
        }
    };

    const handleReturn = async (issueId: string) => {
        try {
            const res = await returnBook(issueId);
            if (res.success) {
                setMessage({ type: 'success', text: 'Book returned successfully!' });
                loadData();
            } else {
                setMessage({ type: 'error', text: res.error || 'Failed to return book.' });
            }
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'An error occurred.' });
        }
    };

    const getStatusBadge = (status: string) => {
        const colors: Record<string, string> = { 
            ISSUED: 'bg-blue-100 text-blue-700', 
            OVERDUE: 'bg-red-100 text-red-700', 
            RETURNED: 'bg-green-100 text-green-700', 
            LOST: 'bg-gray-100 text-gray-700' 
        };
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
                            <select value={selectedBook} onChange={(e) => setSelectedBook(e.target.value)} className="w-full px-4 py-2 border rounded-lg">
                                <option value="">Select a book...</option>
                                {books
                                    .filter(b => b.availableCopies > 0 && (!bookSearch || b.title.toLowerCase().includes(bookSearch.toLowerCase()) || (b.isbn && b.isbn.includes(bookSearch))))
                                    .map(book => (
                                        <option key={book.id} value={book.id}>
                                            {book.title} - {book.author} ({book.availableCopies}/{book.totalCopies} available)
                                        </option>
                                    ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2">Select Student</label>
                            <select value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)} className="w-full px-4 py-2 border rounded-lg">
                                <option value="">Select a student...</option>
                                {students.map((student: any) => (<option key={student.id} value={student.id}>{student.name} - Class {student.class} ({student.admissionNo})</option>))}
                            </select>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg text-sm"><p><strong>Loan Period:</strong> 14 days</p><p><strong>Fine Rate:</strong> ₹2 per day after due date</p></div>
                        <button onClick={handleIssue} className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">Issue Book</button>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardHeader><CardTitle>Currently Issued Books</CardTitle></CardHeader>
                    <CardContent>
                        {issuedBooks.filter(i => i.status !== 'RETURNED').length === 0 ? <p className="text-gray-500 text-center py-8">No books currently issued.</p> : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Book</TableHead>
                                        <TableHead>Student</TableHead>
                                        <TableHead>Due Date</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {issuedBooks.filter(i => i.status !== 'RETURNED').map(issue => (
                                        <TableRow key={issue.id} className={issue.status === 'OVERDUE' ? 'bg-red-50' : ''}>
                                            <TableCell className="font-medium">{issue.bookTitle}</TableCell>
                                            <TableCell>
                                                <div>{issue.studentName}</div>
                                                <div className="text-xs text-gray-500">{issue.studentClass}</div>
                                            </TableCell>
                                            <TableCell>{issue.dueDate}</TableCell>
                                            <TableCell>{getStatusBadge(issue.status)}</TableCell>
                                            <TableCell>
                                                <button onClick={() => handleReturn(issue.id)} className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700">
                                                    Return
                                                </button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
