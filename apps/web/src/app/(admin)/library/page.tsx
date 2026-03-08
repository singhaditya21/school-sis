import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { getBooks, getLibraryStats } from '@/lib/actions/library';

export default async function LibraryPage() {
    const [bookList, stats] = await Promise.all([
        getBooks(),
        getLibraryStats(),
    ]);

    const getCategoryBadge = (category: string) => {
        const colors: Record<string, string> = {
            TEXTBOOK: 'bg-blue-100 text-blue-700',
            REFERENCE: 'bg-purple-100 text-purple-700',
            FICTION: 'bg-green-100 text-green-700',
            NON_FICTION: 'bg-orange-100 text-orange-700',
            MAGAZINE: 'bg-pink-100 text-pink-700',
            NEWSPAPER: 'bg-gray-100 text-gray-700',
            JOURNAL: 'bg-teal-100 text-teal-700',
        };
        return (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[category] || 'bg-gray-100 text-gray-700'}`}>
                {category}
            </span>
        );
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

            {/* Books Table */}
            <Card>
                <CardContent className="p-0">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Author</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ISBN</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Available</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {bookList.map(book => (
                                <tr key={book.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-14 bg-gradient-to-br from-blue-100 to-purple-100 rounded flex items-center justify-center text-lg">
                                                📚
                                            </div>
                                            <div>
                                                <div className="font-medium">{book.title}</div>
                                                {book.publisher && <div className="text-xs text-gray-500">{book.publisher} {book.edition && `· ${book.edition}`}</div>}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm">{book.author}</td>
                                    <td className="px-4 py-3 text-sm font-mono text-gray-500">{book.isbn || '—'}</td>
                                    <td className="px-4 py-3">{getCategoryBadge(book.category)}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{book.location || '—'}</td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`font-semibold ${book.availableCopies > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {book.availableCopies}/{book.totalCopies}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {bookList.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                                        No books in the catalogue. Add your first book to get started.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
}
