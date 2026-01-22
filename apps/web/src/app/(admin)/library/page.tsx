'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
    mockBooks,
    mockIssues,
    getLibraryStats,
    type Book,
    type BookIssue
} from '@/lib/services/library/library.service';

const categories = [
    { value: 'ALL', label: 'All Books', icon: '📚' },
    { value: 'TEXTBOOK', label: 'Textbooks', icon: '📖' },
    { value: 'REFERENCE', label: 'Reference', icon: '📕' },
    { value: 'FICTION', label: 'Fiction', icon: '📗' },
    { value: 'NON_FICTION', label: 'Non-Fiction', icon: '📘' },
];

export default function LibraryPage() {
    const [selectedCategory, setSelectedCategory] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedBook, setSelectedBook] = useState<Book | null>(null);
    const stats = getLibraryStats();

    const filteredBooks = mockBooks.filter(book => {
        const matchesCategory = selectedCategory === 'ALL' || book.category === selectedCategory;
        const matchesSearch = !searchQuery ||
            book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            book.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
            book.isbn.includes(searchQuery);
        return matchesCategory && matchesSearch;
    });

    const getCategoryBadge = (category: Book['category']) => {
        const colors: Record<string, string> = {
            TEXTBOOK: 'bg-blue-100 text-blue-700',
            REFERENCE: 'bg-purple-100 text-purple-700',
            FICTION: 'bg-green-100 text-green-700',
            NON_FICTION: 'bg-orange-100 text-orange-700',
            MAGAZINE: 'bg-pink-100 text-pink-700',
            NEWSPAPER: 'bg-gray-100 text-gray-700',
        };
        return <Badge className={colors[category]}>{category}</Badge>;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Library Management</h1>
                    <p className="text-gray-600 mt-1">Manage book catalog, issues, and returns</p>
                </div>
                <div className="flex gap-3">
                    <Link href="/library/issue" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        📖 Issue Book
                    </Link>
                    <Link href="/library/history" className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                        📋 History
                    </Link>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Total Titles</div>
                        <div className="text-2xl font-bold text-blue-600">{stats.totalBooks}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Total Copies</div>
                        <div className="text-2xl font-bold text-green-600">{stats.totalCopies}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Available</div>
                        <div className="text-2xl font-bold text-emerald-600">{stats.availableCopies}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Issued Today</div>
                        <div className="text-2xl font-bold text-purple-600">{stats.issuedToday}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Overdue</div>
                        <div className="text-2xl font-bold text-red-600">{stats.overdueBooks}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Fines Pending</div>
                        <div className="text-2xl font-bold text-orange-600">₹{stats.totalFinesPending}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Search & Filter */}
            <div className="flex gap-4 items-center">
                <input
                    type="text"
                    placeholder="Search by title, author, or ISBN..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 px-4 py-2 border rounded-lg"
                />
                <div className="flex gap-2">
                    {categories.map(cat => (
                        <button
                            key={cat.value}
                            onClick={() => setSelectedCategory(cat.value)}
                            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${selectedCategory === cat.value
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 hover:bg-gray-200'
                                }`}
                        >
                            {cat.icon} {cat.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Books Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredBooks.map(book => (
                    <Card
                        key={book.id}
                        className="cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => setSelectedBook(book)}
                    >
                        <CardContent className="pt-4">
                            <div className="flex gap-4">
                                <div className="w-16 h-20 bg-gradient-to-br from-blue-100 to-purple-100 rounded flex items-center justify-center text-2xl">
                                    📚
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-sm truncate">{book.title}</h3>
                                    <p className="text-xs text-gray-500">{book.author}</p>
                                    <div className="mt-2 flex items-center gap-2">
                                        {getCategoryBadge(book.category)}
                                    </div>
                                    <div className="mt-2 flex items-center justify-between text-xs">
                                        <span className="text-gray-500">📍 {book.location}</span>
                                        <span className={book.availableCopies > 0 ? 'text-green-600' : 'text-red-600'}>
                                            {book.availableCopies}/{book.totalCopies} available
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Book Detail Dialog */}
            <Dialog open={!!selectedBook} onOpenChange={() => setSelectedBook(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Book Details</DialogTitle>
                    </DialogHeader>
                    {selectedBook && (
                        <div className="space-y-4">
                            <div className="flex gap-4">
                                <div className="w-24 h-32 bg-gradient-to-br from-blue-100 to-purple-100 rounded-lg flex items-center justify-center text-4xl">
                                    📚
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold">{selectedBook.title}</h2>
                                    <p className="text-gray-600">{selectedBook.author}</p>
                                    <div className="mt-2">{getCategoryBadge(selectedBook.category)}</div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-gray-500">ISBN:</span>
                                    <span className="ml-2 font-mono">{selectedBook.isbn}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500">Publisher:</span>
                                    <span className="ml-2">{selectedBook.publisher}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500">Edition:</span>
                                    <span className="ml-2">{selectedBook.edition}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500">Year:</span>
                                    <span className="ml-2">{selectedBook.year}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500">Location:</span>
                                    <span className="ml-2">{selectedBook.location}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500">Availability:</span>
                                    <span className={`ml-2 font-semibold ${selectedBook.availableCopies > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {selectedBook.availableCopies} of {selectedBook.totalCopies}
                                    </span>
                                </div>
                            </div>
                            <div className="flex gap-3 pt-4">
                                <Link
                                    href={`/library/issue?bookId=${selectedBook.id}`}
                                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-center hover:bg-blue-700"
                                >
                                    Issue Book
                                </Link>
                                <button
                                    onClick={() => setSelectedBook(null)}
                                    className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
