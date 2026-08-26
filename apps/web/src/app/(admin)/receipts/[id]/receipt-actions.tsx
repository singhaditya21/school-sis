'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';

interface ReceiptActionsProps {
    invoiceId: string;
}

/**
 * Two ways for a parent to keep this receipt: the browser's print dialog, and
 * the server-generated PDF from /api/receipts/[id]/pdf. That route now renders
 * natively (no external service), so the download is offered again.
 *
 * The receipt id is read from the route rather than taken as a prop: by the
 * time this renders, /receipts/[id] has already resolved any legacy payment id
 * to the receipt it belongs to.
 */
export function ReceiptActions({ invoiceId }: ReceiptActionsProps) {
    const params = useParams<{ id: string }>();
    const receiptId = params?.id;

    return (
        <div className="flex justify-center gap-3 pb-4 print:hidden">
            <Button onClick={() => window.print()}>Print / Save as PDF</Button>
            {receiptId && (
                <Button variant="outline" asChild>
                    <a href={`/api/receipts/${receiptId}/pdf`} download>
                        Download PDF
                    </a>
                </Button>
            )}
            <Button variant="outline" asChild>
                <Link href={`/invoices/${invoiceId}`}>View Invoice</Link>
            </Button>
        </div>
    );
}
