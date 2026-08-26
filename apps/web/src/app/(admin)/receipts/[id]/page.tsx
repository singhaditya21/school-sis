import { redirect } from 'next/navigation';
import Link from 'next/link';
import { formatCurrency, formatDate } from '@/lib/utils';
import { getReceiptDocument, getReceiptIdForPayment, isUuid } from '../receipt-data';
import { amountInWords } from '../amount-in-words';
import { ReceiptActions } from './receipt-actions';

export const metadata = {
    title: 'Fee Receipt | ScholarMind',
};

const METHOD_LABELS: Record<string, string> = {
    CASH: 'Cash',
    UPI: 'UPI',
    BANK_TRANSFER: 'Bank Transfer',
    CHEQUE: 'Cheque',
    CARD: 'Card',
    ONLINE: 'Online',
};

const PRINT_STYLES = `
@page { margin: 14mm; }
@media print {
    header, aside[data-testid="sidebar"] { display: none !important; }
    main { padding: 0 !important; }
    body { background: #fff !important; }
}
`;

function methodLabel(method: string): string {
    return METHOD_LABELS[method] ?? method;
}

/** The reference a parent would quote back to the school for this payment. */
function paymentReference(receipt: {
    method: string;
    chequeNumber: string | null;
    transactionId: string | null;
    razorpayPaymentId: string | null;
}): string | null {
    if (receipt.method === 'CHEQUE') return receipt.chequeNumber;
    return receipt.transactionId ?? receipt.razorpayPaymentId ?? receipt.chequeNumber;
}

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <dt className="text-[11px] uppercase tracking-wider text-gray-500">{label}</dt>
            <dd className="text-sm font-medium text-gray-900 mt-0.5">{value}</dd>
        </div>
    );
}

export default async function ReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    if (!isUuid(id)) redirect('/receipts');

    const receipt = await getReceiptDocument(id);

    if (!receipt) {
        // Older links carried a *payment* id into this route. If this id is one
        // of those, send the user to the receipt that was issued against it.
        const resolvedReceiptId = await getReceiptIdForPayment(id);
        if (resolvedReceiptId) redirect(`/receipts/${resolvedReceiptId}`);

        return (
            <div className="max-w-2xl mx-auto p-8 text-center">
                <h1 className="text-xl font-semibold text-gray-900">Receipt not found</h1>
                <p className="text-gray-500 mt-2">
                    No receipt with this reference exists for your school.
                </p>
                <Link href="/receipts" className="text-blue-600 hover:underline mt-4 inline-block">
                    Back to payment ledger
                </Link>
            </div>
        );
    }

    const amount = Number(receipt.amount);
    const invoiceTotal = Number(receipt.invoiceTotal);
    const invoicePaid = Number(receipt.invoicePaid);
    const invoiceBalance = invoiceTotal - invoicePaid;
    const words = amountInWords(receipt.amount);
    const reference = paymentReference(receipt);

    const addressLine = [
        receipt.schoolAddress,
        receipt.schoolCity,
        receipt.schoolState,
        receipt.schoolPincode,
    ]
        .filter(Boolean)
        .join(', ');

    const contactLine = [
        receipt.schoolPhone ? `Phone: ${receipt.schoolPhone}` : null,
        receipt.schoolEmail ? `Email: ${receipt.schoolEmail}` : null,
        receipt.affiliationBoard ? `Board: ${receipt.affiliationBoard}` : null,
        receipt.udiseCode ? `UDISE: ${receipt.udiseCode}` : null,
    ]
        .filter(Boolean)
        .join('  ·  ');

    const className = [receipt.gradeName, receipt.sectionName].filter(Boolean).join(' · ');

    return (
        <div className="max-w-3xl mx-auto space-y-4">
            <style dangerouslySetInnerHTML={{ __html: PRINT_STYLES }} />

            <div className="flex items-center justify-between print:hidden">
                <Link href="/receipts" className="text-sm text-blue-600 hover:underline">
                    ← Payment ledger
                </Link>
                <span className="text-sm text-gray-500">Receipt {receipt.receiptNumber}</span>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 print:border-0 print:shadow-none print:rounded-none print:p-0">
                {/* School header */}
                <div className="text-center border-b border-gray-200 pb-5">
                    <h1 className="text-2xl font-bold text-gray-900">{receipt.schoolName}</h1>
                    {addressLine && <p className="text-sm text-gray-600 mt-1">{addressLine}</p>}
                    {contactLine && <p className="text-xs text-gray-500 mt-1">{contactLine}</p>}
                </div>

                <div className="flex items-center justify-between mt-5">
                    <h2 className="text-base font-bold uppercase tracking-[0.2em] text-gray-800">
                        Fee Receipt
                    </h2>
                    {receipt.status !== 'COMPLETED' && (
                        <span className="text-xs font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                            Payment {receipt.status}
                        </span>
                    )}
                </div>

                {/* Receipt + student identity */}
                <dl className="grid grid-cols-2 gap-x-8 gap-y-4 mt-4 border-t border-gray-100 pt-4">
                    <Field label="Receipt No." value={receipt.receiptNumber} />
                    <Field label="Receipt Date" value={formatDate(receipt.issuedAt)} />
                    <Field
                        label="Student"
                        value={`${receipt.studentFirstName} ${receipt.studentLastName}`}
                    />
                    <Field label="Admission No." value={receipt.admissionNumber} />
                    <Field label="Class" value={className || '—'} />
                    <Field label="Invoice No." value={receipt.invoiceNumber} />
                </dl>

                {/* What was paid */}
                <div className="mt-6 border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500 uppercase text-[11px] tracking-wider">
                            <tr>
                                <th className="text-left px-4 py-2 font-semibold">Particulars</th>
                                <th className="text-right px-4 py-2 font-semibold">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="border-t border-gray-100">
                                <td className="px-4 py-3 text-gray-800">
                                    {receipt.invoiceDescription || 'School fees'}
                                    <span className="block text-xs text-gray-500 mt-0.5">
                                        Against invoice {receipt.invoiceNumber} · due{' '}
                                        {formatDate(receipt.invoiceDueDate)}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-right font-mono tabular-nums text-gray-900">
                                    {formatCurrency(amount)}
                                </td>
                            </tr>
                            <tr className="border-t border-gray-200 bg-gray-50">
                                <td className="px-4 py-3 font-semibold text-gray-900">Amount received</td>
                                <td className="px-4 py-3 text-right font-mono tabular-nums font-bold text-gray-900">
                                    {formatCurrency(amount)}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {words && (
                    <p className="mt-3 text-sm text-gray-700">
                        <span className="text-gray-500">In words: </span>
                        <span className="font-medium">{words}</span>
                    </p>
                )}

                {/* How it was paid */}
                <dl className="grid grid-cols-2 gap-x-8 gap-y-4 mt-6 border-t border-gray-100 pt-4">
                    <Field label="Payment Method" value={methodLabel(receipt.method)} />
                    <Field label="Payment Date" value={formatDate(receipt.paidAt)} />
                    <Field label="Reference" value={reference || '—'} />
                    <Field label="Bank" value={receipt.bankName || '—'} />
                </dl>

                {receipt.notes && (
                    <p className="mt-4 text-xs text-gray-600">
                        <span className="text-gray-500">Note: </span>
                        {receipt.notes}
                    </p>
                )}

                {/* Where the invoice stands after this payment */}
                <div className="mt-6 border-t border-gray-100 pt-4 grid grid-cols-3 gap-4 text-sm">
                    <div>
                        <p className="text-[11px] uppercase tracking-wider text-gray-500">Invoice total</p>
                        <p className="font-mono tabular-nums mt-0.5">{formatCurrency(invoiceTotal)}</p>
                    </div>
                    <div>
                        <p className="text-[11px] uppercase tracking-wider text-gray-500">Paid to date</p>
                        <p className="font-mono tabular-nums mt-0.5">{formatCurrency(invoicePaid)}</p>
                    </div>
                    <div>
                        <p className="text-[11px] uppercase tracking-wider text-gray-500">Balance due</p>
                        <p
                            className={`font-mono tabular-nums mt-0.5 font-semibold ${
                                invoiceBalance > 0 ? 'text-amber-700' : 'text-green-700'
                            }`}
                        >
                            {formatCurrency(invoiceBalance)}
                        </p>
                    </div>
                </div>

                <div className="mt-8 flex items-end justify-between">
                    <p className="text-[11px] text-gray-500 max-w-sm">
                        This is a computer-generated receipt and is valid without a signature.
                        Please retain it for your records.
                    </p>
                    <div className="text-center">
                        <div className="h-10" />
                        <p className="border-t border-gray-400 pt-1 text-xs text-gray-600 px-6">
                            For {receipt.schoolName}
                        </p>
                    </div>
                </div>
            </div>

            <ReceiptActions invoiceId={receipt.invoiceId} />
        </div>
    );
}
