'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { rescanStockAlerts } from '../actions';

/**
 * Re-runs the stock-level check. The count reported back is how many
 * consumables sit at or below their minimum, not how many new alert rows were
 * written — items with an alert already open are counted but not duplicated.
 */
export default function RescanButton() {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const handleRescan = () => {
        startTransition(async () => {
            const result = await rescanStockAlerts();
            if (!result.success) {
                toast.error(result.error ?? 'Could not re-scan stock levels.');
                return;
            }
            const flagged = result.itemsBelowMinimum ?? 0;
            toast.success(
                flagged === 0
                    ? 'Stock re-scanned — nothing is below its minimum.'
                    : `Stock re-scanned — ${flagged} item${flagged === 1 ? '' : 's'} at or below minimum.`,
            );
            router.refresh();
        });
    };

    return (
        <button
            type="button"
            onClick={handleRescan}
            disabled={isPending}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium disabled:opacity-50"
            data-testid="rescan-stock-btn"
        >
            {isPending ? 'Re-scanning…' : 'Re-scan Stock Levels'}
        </button>
    );
}
