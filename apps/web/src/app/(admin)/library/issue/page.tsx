'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    mockBooks,
    mockIssues,
    calculateDueDate,
    type Book,
    type BookIssue
} from '@/lib/services/library/library.service';

// Mock students for selection
const mockStudents = [
    { id: 's1', name: 'Aarav Sharma', class: '10-A', admissionNumber: 'GWD2020001' },
    { id: 's2', name: 'Priya Patel', class: '12-B', admissionNumber: 'GWD2018015' },
    { id: 's3', name: 'Arjun Singh', class: '11-A', admissionNumber: 'GWD2019023' },
    { id: 's4', name: 'Ananya Gupta', class: '9-C', admissionNumber: 'GWD2021034' },
    { id: 's5', name: 'Vivaan Reddy', class: '11-B', admissionNumber: 'GWD2019045' },
    { id: 's6', name: 'Saanvi Jain', class: '12-A', admissionNumber: 'GWD2018056' },
    { id: 's7', name: 'Krishna Menon', class: '10-B', admissionNumber: 'GWD2020067' },
    { id: 's8', name: 'Kavya Nair', class: '11-C', admissionNumber: 'GWD2019078' },
];

export default function IssueBookPage() {
    const [mode, setMode] = useState<'issue' | 'return'>('issue');
    const [selectedBook, setSelectedBook] = useState('');
    const [selectedStudent, setSelectedStudent] = useState('');
    const [bookSearch, setBookSearch] = useState('');
    const [issuedBooks, setIssuedBooks] = useState(mockIssues.filter(i => i.status !== 'RETURNED'));
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const availableBooks = mockBooks.filter(b =>
        b.availableCopies > 0 &&
        (bookSearch === '' ||
            b.title.toLowerCase().includes(bookSearch.toLowerCase()) ||
            b.isbn.includes(bookSearch))
    );

    const handleIssue = () => {
        if (!selectedBook || !selectedStudent) {
            setMessage({ type: 'error', text: 'Please select both book and student' });
            return;
        }

        const book = mockBooks.find(b => b.id === selectedBook);
        const student = mockStudents.find(s => s.id === selectedStudent);

        if (!book || !student) return;

        const today = new Date().toISOString().split('T')[0];
        const newIssue: BookIssue = {
            id: `i${issuedBooks.length + 10}`,
            bookId: book.id,
            bookTitle: book.title,
            studentId: student.id,
            studentName: student.name,
            studentClass: student.class,
            issueDate: today,
            dueDate: calculateDueDate(today),
            status: 'ISSUED',
            fineAmount: 0,
            finePaid: false,
        };

        setIssuedBooks([newIssue, ...issuedBooks]);
        setMessage({ type: 'success', text: `"${book.title}" issued to ${student.name}. Due: ${newIssue.dueDate}` });
        setSelectedBook('');
        setSelectedStudent('');
    };

    const handleReturn = (issueId: string) => {
        setIssuedBooks(prev =>
            prev.map(issue =>
                issue.id === issueId
                    ? { ...issue, status: 'RETURNED' as const, returnDate: new Date().toISOString().split('T')[0] }
                    : issue
            )
        );
        setMessage({ type: 'success', text: 'Book returned successfully!' });
    };

    const getStatusBadge = (status: BookIssue['status']) => {
        const colors: Record<string, string> = {
            ISSUED: 'bg-blue-100 text-blue-700',
            OVERDUE: 'bg-red-100 text-red-700',
            RETURNED: 'bg-green-100 text-green-700',
            LOST: 'bg-gray-100 text-gray-700',
        };
        return <Badge className={colors[status]}>{status}</Badge>;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Issue / Return Books</h1>
                    <p className="text-gray-600 mt-1">Manage book lending and returns</p>
                </div>
                <Link href="/library" className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                    ← Back to Library
                </Link>
            </div>

            {/* Message */}
            {message && (
                <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {message.text}
                </div>
            )}

            {/* Mode Toggle */}
            <div className="flex gap-2">
                <button
                    onClick={() => setMode('issue')}
                    className={`px-6 py-3 rounded-lg font-medium ${mode === 'issue' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
                >
                    📖 Issue Book
                </button>
                <button
                    onClick={() => setMode('return')}
                    className={`px-6 py-3 rounded-lg font-medium ${mode === 'return' ? 'bg-green-600 text-white' : 'bg-gray-100'}`}
                >
                    ↩️ Return Book
                </button>
            </div>

            {mode === 'issue' ? (
                /* Issue Form */
                <Card>
                    <CardHeader>
                        <CardTitle>Issue New Book</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-2">Search & Select Book</label>
                            <input
                                type="text"
                                placeholder="Search by title or ISBN..."
                                value={bookSearch}
                                onChange={(e) => setBookSearch(e.target.value)}
                                className="w-full px-4 py-2 border rounded-lg mb-2"
                            />
                            <select
                                value={selectedBook}
                                onChange={(e) => setSelectedBook(e.target.value)}
                                className="w-full px-4 py-2 border rounded-lg"
                            >
                                <option value="">Select a book...</option>
                                {availableBooks.map(book => (
                                    <option key={book.id} value={book.id}>
                                        {book.title} - {book.author} ({book.availableCopies} available)
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2">Select Student</label>
                            <select
                                value={selectedStudent}
                                onChange={(e) => setSelectedStudent(e.target.value)}
                                className="w-full px-4 py-2 border rounded-lg"
                            >
                                <option value="">Select a student...</option>
                                {mockStudents.map(student => (
                                    <option key={student.id} value={student.id}>
                                        {student.name} - Class {student.class} ({student.admissionNumber})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg text-sm">
                            <p><strong>Loan Period:</strong> 14 days</p>
                            <p><strong>Fine Rate:</strong> ₹2 per day after due date</p>
                        </div>
                        <button
                            onClick={handleIssue}
                            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
                        >
                            Issue Book
                        </button>
                    </CardContent>
                </Card>
            ) : (
                /* Return Section */
                <Card>
                    <CardHeader>
                        <CardTitle>Currently Issued Books</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Book</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Issue Date</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {issuedBooks.filter(i => i.status !== 'RETURNED').map(issue => (
                                    <tr key={issue.id} className={`hover:bg-gray-50 ${issue.status === 'OVERDUE' ? 'bg-red-50' : ''}`}>
                                        <td className="px-4 py-3 font-medium">{issue.bookTitle}</td>
                                        <td className="px-4 py-3">
                                            <div>{issue.studentName}</div>
                                            <div className="text-xs text-gray-500">{issue.studentClass}</div>
                                        </td>
                                        <td className="px-4 py-3">{new Date(issue.issueDate).toLocaleDateString('en-IN')}</td>
                                        <td className="px-4 py-3">{new Date(issue.dueDate).toLocaleDateString('en-IN')}</td>
                                        <td className="px-4 py-3">{getStatusBadge(issue.status)}</td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => handleReturn(issue.id)}
                                                className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                                            >
                                                Return
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
