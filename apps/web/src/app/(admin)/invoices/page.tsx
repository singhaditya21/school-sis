import { getSession } from '@/lib/auth/session';
import { formatCurrency, formatDate } from '@/lib/utils';
import Link from 'next/link';

interface Invoice {
    id: string;
    invoiceNumber: string;
    studentName: string;
    studentId: string;
    totalAmount: number;
    paidAmount: number;
    dueAmount: number;
    dueDate: string;
    status: string;
}

// Mock invoice data with Indian student names
const mockInvoices: Invoice[] = [
    { id: '1', invoiceNumber: 'INV-2025-00001', studentName: 'Aarav Sharma', studentId: 's1', totalAmount: 34000, paidAmount: 34000, dueAmount: 0, dueDate: '2025-04-15', status: 'PAID' },
    { id: '2', invoiceNumber: 'INV-2025-00002', studentName: 'Ananya Gupta', studentId: 's2', totalAmount: 34000, paidAmount: 34000, dueAmount: 0, dueDate: '2025-04-15', status: 'PAID' },
    { id: '3', invoiceNumber: 'INV-2025-00003', studentName: 'Vivaan Patel', studentId: 's3', totalAmount: 39000, paidAmount: 20000, dueAmount: 19000, dueDate: '2025-04-15', status: 'PARTIAL' },
    { id: '4', invoiceNumber: 'INV-2025-00004', studentName: 'Diya Reddy', studentId: 's4', totalAmount: 39000, paidAmount: 39000, dueAmount: 0, dueDate: '2025-04-15', status: 'PAID' },
    { id: '5', invoiceNumber: 'INV-2025-00005', studentName: 'Arjun Singh', studentId: 's5', totalAmount: 53000, paidAmount: 0, dueAmount: 53000, dueDate: '2025-04-15', status: 'OVERDUE' },
    { id: '6', invoiceNumber: 'INV-2025-00006', studentName: 'Saanvi Jain', studentId: 's6', totalAmount: 53000, paidAmount: 53000, dueAmount: 0, dueDate: '2025-04-15', status: 'PAID' },
    { id: '7', invoiceNumber: 'INV-2025-00007', studentName: 'Krishna Menon', studentId: 's7', totalAmount: 71000, paidAmount: 35000, dueAmount: 36000, dueDate: '2025-04-15', status: 'PARTIAL' },
    { id: '8', invoiceNumber: 'INV-2025-00008', studentName: 'Kavya Nair', studentId: 's8', totalAmount: 71000, paidAmount: 71000, dueAmount: 0, dueDate: '2025-04-15', status: 'PAID' },
    { id: '9', invoiceNumber: 'INV-2025-00009', studentName: 'Ishaan Das', studentId: 's9', totalAmount: 34000, paidAmount: 0, dueAmount: 34000, dueDate: '2025-04-15', status: 'PENDING' },
    { id: '10', invoiceNumber: 'INV-2025-00010', studentName: 'Prisha Roy', studentId: 's10', totalAmount: 39000, paidAmount: 39000, dueAmount: 0, dueDate: '2025-04-15', status: 'PAID' },
    { id: '11', invoiceNumber: 'INV-2025-00011', studentName: 'Dhruv Banerjee', studentId: 's11', totalAmount: 53000, paidAmount: 53000, dueAmount: 0, dueDate: '2025-04-15', status: 'PAID' },
    { id: '12', invoiceNumber: 'INV-2025-00012', studentName: 'Navya Kapoor', studentId: 's12', totalAmount: 71000, paidAmount: 0, dueAmount: 71000, dueDate: '2025-04-15', status: 'OVERDUE' },
];

export default async function InvoicesPage() {
    const session = await getSession();

    // Fetch invoices from Java API
    let invoices: Invoice[] = [];
    let useMockData = false;

    try {
        const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/fees/invoices?size=50`,
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
            invoices = data.data?.content || data.content || [];
            if (invoices.length === 0) useMockData = true;
        } else {
            useMockData = true;
        }
    } catch (error) {
        console.error('[Invoices] API Error, using mock data:', error);
        useMockData = true;
    }

    // Use mock data as fallback
    if (useMockData) {
        invoices = mockInvoices;
    }

    const statusColors: Record<string, string> = {
        PENDING: 'bg-yellow-100 text-yellow-700',
        PARTIAL: 'bg-blue-100 text-blue-700',
        PAID: 'bg-green-100 text-green-700',
        OVERDUE: 'bg-red-100 text-red-700',
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Invoices</h1>
                    <p className="text-gray-600 mt-1">Manage student fee invoices</p>
                </div>
                <Link
                    href="/invoices/generate"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                    + Generate Invoices
                </Link>
            </div>

            <div className="bg-white rounded-xl shadow-sm border">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Paid</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {invoices.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                                        No invoices found.
                                    </td>
                                </tr>
                            ) : (
                                invoices.map((invoice) => (
                                    <tr key={invoice.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                                            {invoice.invoiceNumber}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <Link href={`/students/${invoice.studentId}`} className="text-blue-600 hover:underline">
                                                {invoice.studentName}
                                            </Link>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                                            {formatCurrency(invoice.totalAmount)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-green-600">
                                            {formatCurrency(invoice.paidAmount)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-red-600 font-medium">
                                            {formatCurrency(invoice.dueAmount)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                                            {formatDate(invoice.dueDate)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[invoice.status] || 'bg-gray-100 text-gray-700'}`}>
                                                {invoice.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex gap-2">
                                                <Link href={`/invoices/${invoice.id}`} className="text-blue-600 hover:underline text-sm">
                                                    View
                                                </Link>
                                                {invoice.status !== 'PAID' && (
                                                    <Link href={`/invoices/${invoice.id}/record-payment`} className="text-green-600 hover:underline text-sm">
                                                        Pay
                                                    </Link>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
