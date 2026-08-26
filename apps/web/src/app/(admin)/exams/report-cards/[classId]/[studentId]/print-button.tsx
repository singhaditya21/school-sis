'use client';

import { Printer } from 'lucide-react';

/**
 * Opens the browser print dialog for the current page. There is no server-side
 * PDF renderer in this deployment, so "print to PDF" is the honest export path.
 */
export function PrintButton() {
    return (
        <button
            type="button"
            onClick={() => window.print()}
            className="print:hidden inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
        >
            <Printer className="h-4 w-4" />
            Print
        </button>
    );
}
