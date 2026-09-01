import Link from 'next/link';
import { getCashflowOutlook } from './cashflow-data';
import CashflowView from './cashflow-view';

export const metadata = {
    title: 'Cashflow Outlook | ScholarMind',
};

export default async function CashflowPage() {
    const outlook = await getCashflowOutlook(6);

    return (
        <div className="p-6 space-y-4">
            <div className="flex justify-end">
                <Link href="/fees" className="text-primary hover:underline text-sm">
                    ← Back to Fees
                </Link>
            </div>
            <CashflowView outlook={outlook} />
        </div>
    );
}
