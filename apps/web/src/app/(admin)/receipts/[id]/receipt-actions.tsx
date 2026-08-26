'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface ReceiptActionsProps {
    invoiceId: string;
}

/**
 * Printing is the delivery mechanism for this receipt — the browser's print
 * dialog also produces the PDF a parent keeps. (A server-rendered PDF endpoint
 * exists but returns 501 unless PDF_SERVICE_URL is configured, so it is not
 * offered here.)
 */
export function ReceiptActions({ invoiceId }: ReceiptActionsProps) {
    return (
        <div className="flex justify-center gap-3 pb-4 print:hidden">
            <Button onClick={() => window.print()}>Print / Save as PDF</Button>
            <Button variant="outline" asChild>
                <Link href={`/invoices/${invoiceId}`}>View Invoice</Link>
            </Button>
        </div>
    );
}
