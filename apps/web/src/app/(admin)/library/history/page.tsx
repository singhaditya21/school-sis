import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

import { getBorrowingSummary, listBorrowingHistory } from '../actions';
import {
    HISTORY_STATUS_BADGE_CLASSES,
    HISTORY_STATUS_LIST,
    type HistoryStatus,
} from '../catalogue-constants';
import { LIBRARY_FINE_RATE_LABEL } from '../fine-policy';

interface PageProps {
    searchParams: Promise<{ filter?: string; q?: string; from?: string; to?: string }>;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normaliseStatus(value: string | undefined): HistoryStatus {
    const upper = (value || 'ALL').toUpperCase();
    return (HISTORY_STATUS_LIST as readonly string[]).includes(upper)
        ? (upper as HistoryStatus)
        : 'ALL';
}

function normaliseDateParam(value: string | undefined): string {
    return value && ISO_DATE_RE.test(value) ? value : '';
}

/** Build a query string that keeps every active filter except the ones overridden. */
function buildHref(current: { filter: string; q: string; from: string; to: string }, next: Partial<typeof current>) {
    const merged = { ...current, ...next };
    const params = new URLSearchParams();
    if (merged.filter && merged.filter !== 'ALL') params.set('filter', merged.filter);
    if (merged.q) params.set('q', merged.q);
    if (merged.from) params.set('from', merged.from);
    if (merged.to) params.set('to', merged.to);
    const qs = params.toString();
    return qs ? `/library/history?${qs}` : '/library/history';
}

export default async function LibraryHistoryPage({ searchParams }: PageProps) {
    const params = await searchParams;

    const filter = normaliseStatus(params.filter);
    const searchQuery = (params.q || '').trim();
    const from = normaliseDateParam(params.from);
    const to = normaliseDateParam(params.to);
    const current = { filter, q: searchQuery, from, to };

    // The table honours the filters; the summary cards always describe the whole
    // tenant history so the headline numbers do not move when a filter is applied.
    const [issues, summary] = await Promise.all([
        listBorrowingHistory({ status: filter, q: searchQuery, from, to }),
        getBorrowingSummary(),
    ]);

    const filtersActive = filter !== 'ALL' || !!searchQuery || !!from || !!to;

    const statCards: { label: string; value: string; className: string; href?: string }[] = [
        { label: 'Total', value: String(summary.total), className: 'text-blue-600', href: buildHref(current, { filter: 'ALL' }) },
        { label: 'Issued', value: String(summary.issued), className: 'text-purple-600', href: buildHref(current, { filter: 'ISSUED' }) },
        { label: 'Overdue', value: String(summary.overdue), className: 'text-red-600', href: buildHref(current, { filter: 'OVERDUE' }) },
        { label: 'Returned', value: String(summary.returned), className: 'text-green-600', href: buildHref(current, { filter: 'RETURNED' }) },
        { label: 'Total Fines', value: `₹${summary.totalFines}`, className: 'text-orange-600' },
        { label: 'Unpaid Fines', value: `₹${summary.unpaidFines}`, className: 'text-red-600' },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Borrowing History</h1>
                    <p className="text-muted-foreground mt-1">
                        Track all book issues, returns, and fines · {LIBRARY_FINE_RATE_LABEL}
                    </p>
                </div>
                <Link href="/library" className="px-4 py-2 border border-border rounded-lg hover:bg-muted">
                    ← Back to Library
                </Link>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                {statCards.map((card) => {
                    const body = (
                        <Card className={card.href ? 'cursor-pointer hover:bg-muted transition-colors h-full' : 'h-full'}>
                            <CardContent className="pt-4">
                                <div className="text-sm text-muted-foreground">{card.label}</div>
                                <div className={`text-2xl font-bold ${card.className}`}>{card.value}</div>
                            </CardContent>
                        </Card>
                    );
                    return card.href ? (
                        <Link key={card.label} href={card.href}>
                            {body}
                        </Link>
                    ) : (
                        <div key={card.label}>{body}</div>
                    );
                })}
            </div>

            <Card>
                <CardContent className="p-4 space-y-4">
                    {/* Server component: filtering happens through the URL, so a plain GET form is enough. */}
                    <form action="/library/history" method="GET" className="flex flex-wrap gap-3 items-end">
                        <input type="hidden" name="filter" value={filter} />
                        <div className="flex-1 min-w-[220px]">
                            <label htmlFor="history-q" className="block text-xs text-muted-foreground mb-1">
                                Search
                            </label>
                            <input
                                id="history-q"
                                type="text"
                                name="q"
                                placeholder="Search title or student..."
                                defaultValue={searchQuery}
                                className="w-full px-4 py-2 border rounded-lg text-sm"
                            />
                        </div>
                        <div>
                            <label htmlFor="history-from" className="block text-xs text-muted-foreground mb-1">
                                Issued from
                            </label>
                            <input
                                id="history-from"
                                type="date"
                                name="from"
                                defaultValue={from}
                                className="px-3 py-2 border rounded-lg text-sm"
                                data-testid="history-from-input"
                            />
                        </div>
                        <div>
                            <label htmlFor="history-to" className="block text-xs text-muted-foreground mb-1">
                                Issued to
                            </label>
                            <input
                                id="history-to"
                                type="date"
                                name="to"
                                defaultValue={to}
                                className="px-3 py-2 border rounded-lg text-sm"
                                data-testid="history-to-input"
                            />
                        </div>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm"
                        >
                            Search
                        </button>
                        {filtersActive && (
                            <Link
                                href="/library/history"
                                className="px-4 py-2 border border-border rounded-lg hover:bg-muted text-sm"
                                data-testid="history-clear-filters"
                            >
                                Clear
                            </Link>
                        )}
                    </form>

                    <div className="flex flex-wrap gap-2">
                        {HISTORY_STATUS_LIST.map((status) => (
                            <Link
                                key={status}
                                href={buildHref(current, { filter: status })}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                    filter === status ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-gray-200'
                                }`}
                            >
                                {status}
                            </Link>
                        ))}
                    </div>

                    {filtersActive && (
                        <p className="text-xs text-muted-foreground">
                            Showing {issues.length} record{issues.length === 1 ? '' : 's'} of {summary.total}.
                        </p>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Book</TableHead>
                                <TableHead>Borrower</TableHead>
                                <TableHead>Dates</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Fine</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {issues.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                                        No borrowing records found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                issues.map((issue) => (
                                    <TableRow key={issue.id}>
                                        <TableCell className="font-medium">
                                            {issue.bookTitle || 'Unknown Book'}
                                            {issue.bookAuthor && (
                                                <div className="text-xs text-muted-foreground">{issue.bookAuthor}</div>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {issue.borrowerName || 'Unknown Borrower'}
                                            {issue.borrowerClass && (
                                                <div className="text-xs text-muted-foreground">{issue.borrowerClass}</div>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            Out: {issue.issueDate}
                                            <br />
                                            Due: {issue.dueDate}
                                            {issue.returnDate && (
                                                <>
                                                    <br />
                                                    Returned: {issue.returnDate}
                                                </>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Badge className={HISTORY_STATUS_BADGE_CLASSES[issue.status] || 'bg-muted text-foreground'}>
                                                {issue.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {issue.fineAmount > 0 ? (
                                                <span className={`font-semibold ${issue.finePaid ? 'text-green-600' : 'text-red-600'}`}>
                                                    ₹{issue.fineAmount} {issue.finePaid && '(Paid)'}
                                                </span>
                                            ) : (
                                                '-'
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
