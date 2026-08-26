/**
 * Currency formatting — Indian Rupees, and only Indian Rupees.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * There used to be six independent `formatCurrency` implementations in this
 * codebase. One of them was configured with `currency: 'USD'` and rendered the
 * executive dashboard's rupee totals as dollars. That is a whole class of bug
 * that only exists because the formatter was copy-pasted instead of imported.
 *
 * The fix is structural, not cosmetic: the currency code is a module constant,
 * it is not a parameter, and nothing in this module accepts a locale or a
 * currency from the caller. A caller physically cannot ask for dollars.
 *
 * MONEY REPRESENTATION
 * --------------------
 * Money in this product is `numeric(12, 2)` and the unit is RUPEES, not paise.
 * Verified against apps/web/drizzle/0000_init_baseline.sql and the local
 * database: invoices.total_amount, invoices.paid_amount, payments.amount,
 * fee_components.amount, hostel_fees.amount, assets.purchase_price,
 * payment_orders.amount, payment_audit_logs.amount are all numeric(12, 2).
 * Never divide by 100 on the way in.
 *
 * `node-postgres` returns `numeric` columns as STRINGS to avoid float
 * precision loss, so every function here accepts `number | string | null`
 * and normalises. That removes the `Number(row.amount || 0)` noise at call
 * sites and stops `NaN` from reaching the screen.
 */

/** The only currency this product renders. Not configurable, by design. */
export const CURRENCY_CODE = 'INR' as const;

/** The only locale used for money. Gives Indian digit grouping (12,34,567). */
export const CURRENCY_LOCALE = 'en-IN' as const;

/** 1 lakh. */
export const LAKH = 100_000;
/** 1 crore. */
export const CRORE = 10_000_000;

/** What every formatter renders when there is genuinely no value. */
export const EMPTY_VALUE = '—';

/**
 * Anything a money column or a form field can hand us.
 * `string` is the common case: pg returns numeric(12,2) as a string.
 */
export type Amount = number | string | null | undefined;

/**
 * Normalise an amount to a finite number of RUPEES.
 * Returns `null` for null/undefined/empty/non-numeric input so callers can
 * distinguish "no value" from "zero" — 0 is a real balance.
 */
export function toRupees(amount: Amount): number | null {
    if (amount === null || amount === undefined) return null;
    if (typeof amount === 'number') return Number.isFinite(amount) ? amount : null;
    const trimmed = amount.trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Normalise an amount to a number, treating "no value" as 0.
 * Use for sums and comparisons, not for display.
 */
export function toRupeesOrZero(amount: Amount): number {
    return toRupees(amount) ?? 0;
}

const wholeRupees = new Intl.NumberFormat(CURRENCY_LOCALE, {
    style: 'currency',
    currency: CURRENCY_CODE,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
});

const preciseRupees = new Intl.NumberFormat(CURRENCY_LOCALE, {
    style: 'currency',
    currency: CURRENCY_CODE,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

/**
 * The default money renderer: `₹12,34,568`.
 *
 * Rounded to whole rupees, because that is what every existing screen shows
 * and paise are noise in a fee ledger summary. Use `formatCurrencyPrecise`
 * where the paise are load-bearing (receipts, ledger lines, reconciliation).
 */
export function formatCurrency(amount: Amount, options?: { emptyValue?: string }): string {
    const value = toRupees(amount);
    if (value === null) return options?.emptyValue ?? EMPTY_VALUE;
    return wholeRupees.format(value);
}

/** Money with paise: `₹12,34,567.89`. For receipts and ledger lines. */
export function formatCurrencyPrecise(amount: Amount, options?: { emptyValue?: string }): string {
    const value = toRupees(amount);
    if (value === null) return options?.emptyValue ?? EMPTY_VALUE;
    return preciseRupees.format(value);
}

/**
 * Indian short-scale money for dashboard tiles: `₹1.23 Cr`, `₹4.56 L`,
 * falling back to the exact figure below one lakh (`₹45,000`).
 *
 * Deliberately NOT `Intl` `notation: 'compact'`: that renders 45,000 as
 * "₹45T" (thousand), which no Indian finance user reads as forty-five
 * thousand, and its lakh/crore output varies with the ICU version bundled
 * into whichever Node runs the render.
 */
export function formatCompactCurrency(amount: Amount, options?: { emptyValue?: string }): string {
    const value = toRupees(amount);
    if (value === null) return options?.emptyValue ?? EMPTY_VALUE;

    const sign = value < 0 ? '-' : '';
    const magnitude = Math.abs(value);

    if (magnitude >= CRORE) return `${sign}₹${(magnitude / CRORE).toFixed(2)} Cr`;
    if (magnitude >= LAKH) return `${sign}₹${(magnitude / LAKH).toFixed(2)} L`;
    return wholeRupees.format(value);
}
