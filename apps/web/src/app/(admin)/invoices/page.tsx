import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getInvoices } from '@/lib/actions/fees';
import { formatCurrency } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

const STATUS_FILTERS = [
    { value: '', label: 'All', testId: 'filter-all' },
    { value: 'PENDING', label: 'Pending', testId: 'filter-pending' },
    { value: 'PARTIAL', label: 'Part paid', testId: 'filter-partial' },
    { value: 'OVERDUE', label: 'Overdue', testId: 'filter-overdue' },
    { value: 'PAID', label: 'Paid', testId: 'filter-paid' },
];

const STATUS_STYLES: Record<string, string> = {
    PAID: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    PARTIAL: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    PENDING: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
    OVERDUE: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    CANCELLED: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
    WAIVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
};

function buildHref(status: string, search: string, page: number) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (search) params.set('q', search);
    if (page > 1) params.set('page', String(page));
    const qs = params.toString();
    return qs ? `/invoices?${qs}` : '/invoices';
}

export default async function InvoicesPage({
    searchParams,
}: {
    searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
    const { status = '', q = '', page: pageParam } = await searchParams;
    const page = Math.max(Number(pageParam) || 1, 1);

    const { items, total } = await getInvoices({
        status: status || undefined,
        search: q || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
    });

    const lastPage = Math.max(Math.ceil(total / PAGE_SIZE), 1);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
                <p className="text-muted-foreground">
                    Look up an invoice to record a payment taken at the counter
                </p>
            </div>

            <Card>
                <CardHeader className="gap-4">
                    <div className="flex flex-wrap gap-2">
                        {STATUS_FILTERS.map((f) => (
                            <Link
                                key={f.testId}
                                href={buildHref(f.value, q, 1)}
                                data-testid={f.testId}
                                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                                    status === f.value
                                        ? 'bg-primary text-primary-foreground border-primary'
                                        : 'hover:bg-muted'
                                }`}
                            >
                                {f.label}
                            </Link>
                        ))}
                    </div>
                    <form action="/invoices" method="get" className="flex gap-2">
                        {status ? <input type="hidden" name="status" value={status} /> : null}
                        <input
                            type="search"
                            name="q"
                            defaultValue={q}
                            placeholder="Search by student or invoice number"
                            aria-label="Search invoices"
                            className="flex h-10 w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        />
                        <button
                            type="submit"
                            className="h-10 rounded-md border px-4 text-sm hover:bg-muted"
                        >
                            Search
                        </button>
                    </form>
                </CardHeader>
                <CardContent>
                    <CardDescription className="mb-4">
                        {total} {total === 1 ? 'invoice' : 'invoices'}
                        {status ? ` · ${status.toLowerCase()}` : ''}
                        {q ? ` · matching “${q}”` : ''}
                    </CardDescription>

                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Invoice</TableHead>
                                <TableHead>Student</TableHead>
                                <TableHead>Due</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead className="text-right">Paid</TableHead>
                                <TableHead className="text-right">Balance</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {items.map((invoice) => {
                                const balance = Number(invoice.totalAmount) - Number(invoice.paidAmount);
                                return (
                                    <TableRow key={invoice.id} data-testid="invoice-row">
                                        <TableCell className="font-medium">
                                            <Link href={`/invoices/${invoice.id}`} className="hover:underline">
                                                {invoice.invoiceNumber}
                                            </Link>
                                        </TableCell>
                                        <TableCell>{invoice.studentName}</TableCell>
                                        <TableCell>{invoice.dueDate}</TableCell>
                                        <TableCell className="text-right tabular-nums">{formatCurrency(Number(invoice.totalAmount))}</TableCell>
                                        <TableCell className="text-right tabular-nums">{formatCurrency(Number(invoice.paidAmount))}</TableCell>
                                        <TableCell className="text-right tabular-nums font-medium">{formatCurrency(balance)}</TableCell>
                                        <TableCell>
                                            <Badge className={STATUS_STYLES[invoice.status] || ''}>{invoice.status}</Badge>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {items.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                                        No invoices match this view.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>

                    {lastPage > 1 && (
                        <div className="mt-4 flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Page {page} of {lastPage}</span>
                            <div className="flex gap-2">
                                {page > 1 && (
                                    <Link href={buildHref(status, q, page - 1)} className="rounded-md border px-3 py-1.5 hover:bg-muted">
                                        Previous
                                    </Link>
                                )}
                                {page < lastPage && (
                                    <Link href={buildHref(status, q, page + 1)} className="rounded-md border px-3 py-1.5 hover:bg-muted">
                                        Next
                                    </Link>
                                )}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
