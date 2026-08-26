'use client';

import { BarChart } from '@tremor/react';
import { formatCurrency } from '@/lib/utils';

/**
 * The chart lives in its own client component because `valueFormatter` is a
 * function prop. A server component cannot pass a function across the client
 * boundary — doing so throws "Functions cannot be passed directly to Client
 * Components" at render time and 500s the page. Importing formatCurrency here
 * keeps the formatting identical while the function never crosses the boundary.
 */
export function FeeBreakdownChart({ data }: { data: { name: string; Amount: number }[] }) {
    return (
        <BarChart
            className="mt-6 h-72"
            data={data}
            index="name"
            categories={['Amount']}
            colors={['blue']}
            valueFormatter={formatCurrency}
            yAxisWidth={96}
        />
    );
}
