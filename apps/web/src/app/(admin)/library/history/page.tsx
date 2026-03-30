import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { db } from '@/lib/db';
import { bookIssues, books, students, users } from '@/lib/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { setTenantContext } from '@/lib/db';

interface PageProps {
    searchParams: Promise<{ filter?: string, q?: string }>;
}

const isOverdue = (dueDate: string) => new Date(dueDate) < new Date();
const calculateFine = (dueDate: string, returnDate?: string) => {
    const end = returnDate ? new Date(returnDate) : new Date();
    const due = new Date(dueDate);
    if (end <= due) return 0;
    const diffDays = Math.ceil((end.getTime() - due.getTime()) / (1000 * 3600 * 24));
    return diffDays * 5; // 5 Rs per day
};

export default async function LibraryHistoryPage({ searchParams }: PageProps) {
    const { tenantId } = await requireAuth('library:read');
    await setTenantContext(tenantId);
    
    // Unroll search parameters
    const params = await searchParams;
    const filter = params.filter || 'ALL';
    const searchQuery = params.q?.toLowerCase() || '';

    // Fetch live issues joined with books and users/students
    const rawIssues = await db
        .select({
            id: bookIssues.id,
            bookId: bookIssues.bookId,
            bookTitle: books.title,
            studentId: bookIssues.issuedToStudentId,
            studentName: students.firstName,
            studentLastName: students.lastName,
            userName: users.firstName,
            userLastName: users.lastName,
            issueDate: bookIssues.issueDate,
            dueDate: bookIssues.dueDate,
            returnDate: bookIssues.returnDate,
            status: bookIssues.status,
            fineAmount: bookIssues.fineAmount,
            finePaid: bookIssues.isFinePaid,
        })
        .from(bookIssues)
        .leftJoin(books, eq(bookIssues.bookId, books.id))
        .leftJoin(students, eq(bookIssues.issuedToStudentId, students.id))
        .leftJoin(users, eq(bookIssues.issuedToUserId, users.id))
        .where(eq(bookIssues.tenantId, tenantId))
        .orderBy(desc(bookIssues.issueDate));

    // Process raw issues and auto-calculate dynamic overdue fines
    const processedIssues = rawIssues.map(issue => {
        let currentStatus = issue.status;
        const sName = issue.studentName ? `${issue.studentName} ${issue.studentLastName || ''}` : `${issue.userName} ${issue.userLastName || ''}`;
        
        let calculatedFine = Number(issue.fineAmount || 0);

        if (currentStatus === 'ISSUED' && isOverdue(issue.dueDate)) {
            currentStatus = 'OVERDUE';
            calculatedFine = Math.max(calculatedFine, calculateFine(issue.dueDate));
        } else if (currentStatus === 'RETURNED' && issue.returnDate) {
            calculatedFine = Math.max(calculatedFine, calculateFine(issue.dueDate, issue.returnDate));
        }

        return {
            ...issue,
            studentName: sName.trim() || 'Unknown Borrower',
            bookTitle: issue.bookTitle || 'Unknown Book',
            status: currentStatus as 'ISSUED' | 'OVERDUE' | 'RETURNED' | 'LOST',
            fineAmount: calculatedFine,
        };
    });

    // Apply filtering and search
    const filteredIssues = processedIssues.filter(issue => {
        const matchesFilter = filter === 'ALL' || issue.status === filter;
        const matchesSearch = !searchQuery || 
                               issue.studentName.toLowerCase().includes(searchQuery) || 
                               issue.bookTitle.toLowerCase().includes(searchQuery);
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

    const getStatusBadge = (status: string) => {
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
                <Link href="?filter=ALL">
                  <Card className="cursor-pointer hover:bg-gray-50 transition-colors"><CardContent className="pt-4"><div className="text-sm text-gray-500">Total</div><div className="text-2xl font-bold text-blue-600">{stats.total}</div></CardContent></Card>
                </Link>
                <Link href="?filter=ISSUED">
                  <Card className="cursor-pointer hover:bg-gray-50 transition-colors"><CardContent className="pt-4"><div className="text-sm text-gray-500">Issued</div><div className="text-2xl font-bold text-purple-600">{stats.issued}</div></CardContent></Card>
                </Link>
                <Link href="?filter=OVERDUE">
                  <Card className="cursor-pointer hover:bg-gray-50 transition-colors"><CardContent className="pt-4"><div className="text-sm text-gray-500">Overdue</div><div className="text-2xl font-bold text-red-600">{stats.overdue}</div></CardContent></Card>
                </Link>
                <Link href="?filter=RETURNED">
                  <Card className="cursor-pointer hover:bg-gray-50 transition-colors"><CardContent className="pt-4"><div className="text-sm text-gray-500">Returned</div><div className="text-2xl font-bold text-green-600">{stats.returned}</div></CardContent></Card>
                </Link>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Total Fines</div><div className="text-2xl font-bold text-orange-600">₹{stats.totalFines}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Unpaid Fines</div><div className="text-2xl font-bold text-red-600">₹{stats.unpaidFines}</div></CardContent></Card>
            </div>

            <div className="flex gap-4 items-center">
                {/* As a Server Component, search happens via form action to update the URL */}
                <form action="" method="GET" className="flex-1 flex gap-2 w-full max-w-sm">
                    <input type="hidden" name="filter" value={filter} />
                    <input type="text" name="q" placeholder="Search title or student..." defaultValue={searchQuery} className="flex-1 px-4 py-2 border rounded-lg" />
                    <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Search</button>
                </form>
                
                <div className="flex gap-2">
                    {(['ALL', 'ISSUED', 'OVERDUE', 'RETURNED'] as const).map(status => (
                        <Link 
                            key={status} 
                            href={`?filter=${status}${searchQuery ? `&q=${searchQuery}` : ''}`} 
                            className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === status ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'} transition-all`}
                        >
                            {status}
                        </Link>
                    ))}
                </div>
            </div>

            <Card>
                <CardContent className="p-0">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-left">Book</th><th className="px-4 py-3 text-left">Borrower</th><th className="px-4 py-3 text-left">Dates</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-right">Fine</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {filteredIssues.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-8 text-center text-gray-500">No borrowing records found.</td>
                                </tr>
                            ) : (
                                filteredIssues.map(issue => (
                                    <tr key={issue.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 font-medium">{issue.bookTitle}</td>
                                        <td className="px-4 py-3">{issue.studentName}</td>
                                        <td className="px-4 py-3 text-xs text-gray-500">Out: {issue.issueDate}<br/>Due: {issue.dueDate}</td>
                                        <td className="px-4 py-3">{getStatusBadge(issue.status)}</td>
                                        <td className="px-4 py-3 text-right">
                                            {issue.fineAmount > 0 
                                                ? <span className={`font-semibold ${issue.finePaid ? 'text-green-600' : 'text-red-600'}`}>₹{issue.fineAmount} {issue.finePaid && '(Paid)'}</span> 
                                                : '-'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
}
