import { getSession } from '@/lib/auth/session';
import { formatCurrency, formatDate } from '@/lib/utils';

interface Invoice {
    id: string;
    invoiceNumber: string;
    totalAmount: number;
    paidAmount: number;
    dueAmount: number;
    dueDate: string;
    status: string;
}

export default async function MyFeesPage() {
    const session = await getSession();

    // Fetch parent's child's invoices from Java API
    let invoices: Invoice[] = [];

    try {
        const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/parent/fees`,
            {
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                    'Content-Type': 'application/json',
                },
                cache: 'no-store',
            }
        );

        if (response.ok) {
            const data = await response.json();
            invoices = data.data || [];
        }
    } catch (error) {
        console.error('[MyFees] API Error:', error);
    }

    const statusColors: Record<string, string> = {
        PENDING: 'bg-yellow-100 text-yellow-700',
        PARTIAL: 'bg-blue-100 text-blue-700',
        PAID: 'bg-green-100 text-green-700',
        OVERDUE: 'bg-red-100 text-red-700',
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">My Fees</h1>
                <p className="text-gray-600 mt-1">View and pay your child&apos;s fee invoices</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border">
                {invoices.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        No fee invoices found.
                    </div>
                ) : (
                    <div className="divide-y">
                        {invoices.map((invoice) => (
                            <div key={invoice.id} className="p-4 flex items-center justify-between">
                                <div>
                                    <p className="font-medium">{invoice.invoiceNumber}</p>
                                    <p className="text-sm text-gray-500">Due: {formatDate(invoice.dueDate)}</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold">{formatCurrency(invoice.dueAmount)}</p>
                                    <span className={`px-2 py-1 rounded text-xs ${statusColors[invoice.status] || 'bg-gray-100'}`}>
                                        {invoice.status}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
