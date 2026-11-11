'use client';

import { sanitizeCsvValue } from '@/lib/utils/csv-sanitize';

/**
 * Saves a table that is already rendered on screen as CSV.
 *
 * This is a convenience over data the viewer is already authorised to see; it deliberately
 * does not fetch anything new. Row-level and PII exports go through the governed export
 * policies in the Reporting Engine (/reports) instead, which record an audit reason and,
 * where the policy demands it, a workflow approval.
 */
export function downloadTableCsv(
    filename: string,
    headers: readonly string[],
    rows: readonly (readonly (string | number | null | undefined)[])[],
): void {
    const csv = [
        headers.map(sanitizeCsvValue).join(','),
        ...rows.map((row) => row.map(sanitizeCsvValue).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
