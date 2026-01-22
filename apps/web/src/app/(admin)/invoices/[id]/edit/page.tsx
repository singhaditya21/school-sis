import { getSession } from '@/lib/auth/session';
import Link from 'next/link';

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getSession();

    let invoice = { invoiceNumber: '', dueDate: '', notes: '' };

    try {
        const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/fees/invoices/${id}`,
            {
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (response.ok) {
            const data = await response.json();
            invoice = data.data || invoice;
        }
    } catch (error) {
        console.error('[Invoice] API Error:', error);
    }

    return (
        <div className="max-w-lg mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Edit Invoice</h1>
                <Link href={`/invoices/${id}`} className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <form action={`/api/invoices/${id}`} method="PUT" className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                    <input name="dueDate" type="date" defaultValue={invoice.dueDate?.split('T')[0]} className="w-full px-3 py-2 border rounded-lg" />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea name="notes" rows={3} defaultValue={invoice.notes} className="w-full px-3 py-2 border rounded-lg"></textarea>
                </div>

                <button type="submit" className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Save Changes
                </button>
            </form>
        </div>
    );
}
