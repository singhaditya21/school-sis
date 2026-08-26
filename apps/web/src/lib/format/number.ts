/**
 * Plain-number formatting with Indian digit grouping.
 * Money does NOT belong here — use ./currency so the INR guarantee holds.
 */

export const NUMBER_LOCALE = 'en-IN' as const;
export const EMPTY_VALUE = '—';

export type NumericInput = number | string | null | undefined;

/** Normalise to a finite number, or null when there is no value. */
export function toNumber(value: NumericInput): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
}

/** `12,34,567` — Indian grouping, not `1,234,567`. */
export function formatNumber(
    value: NumericInput,
    options?: { decimals?: number; emptyValue?: string },
): string {
    const parsed = toNumber(value);
    if (parsed === null) return options?.emptyValue ?? EMPTY_VALUE;
    const decimals = options?.decimals ?? 0;
    return new Intl.NumberFormat(NUMBER_LOCALE, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(parsed);
}

/**
 * `94.2%`. Pass a percentage (0-100), not a ratio — every collection-rate and
 * attendance-rate value in this codebase is already stored as 0-100.
 */
export function formatPercent(
    value: NumericInput,
    options?: { decimals?: number; emptyValue?: string },
): string {
    const parsed = toNumber(value);
    if (parsed === null) return options?.emptyValue ?? EMPTY_VALUE;
    return `${formatNumber(parsed, { decimals: options?.decimals ?? 1 })}%`;
}

/** `1.23 Cr` / `4.56 L` / `45,000` — the unit-less twin of formatCompactCurrency. */
export function formatCompactNumber(value: NumericInput, options?: { emptyValue?: string }): string {
    const parsed = toNumber(value);
    if (parsed === null) return options?.emptyValue ?? EMPTY_VALUE;
    const sign = parsed < 0 ? '-' : '';
    const magnitude = Math.abs(parsed);
    if (magnitude >= 10_000_000) return `${sign}${(magnitude / 10_000_000).toFixed(2)} Cr`;
    if (magnitude >= 100_000) return `${sign}${(magnitude / 100_000).toFixed(2)} L`;
    return formatNumber(parsed);
}
