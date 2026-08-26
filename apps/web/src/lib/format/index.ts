/**
 * The one formatting module.
 *
 *   import { formatCurrency, formatDate } from '@/lib/format';
 *
 * WHAT GOES WHERE
 * ---------------
 *   Money        ./currency   formatCurrency, formatCurrencyPrecise,
 *                             formatCompactCurrency, toRupees
 *   Dates/times  ./date       formatDate, formatDateTime, formatTime,
 *                             formatTimeAgo, toDateInputValue
 *   Counts/rates ./number     formatNumber, formatPercent, formatCompactNumber
 *
 * RULES
 * -----
 * 1. Never write `new Intl.NumberFormat(..., { currency: ... })` in a component.
 *    Import from here. The currency code lives in exactly one place and it is
 *    'INR'. This is the rule that would have caught the executive dashboard
 *    rendering rupees as dollars.
 * 2. Never write a local `formatDate`/`formatCurrency` helper "just for this
 *    file". That is how six of them appeared.
 * 3. Every formatter accepts `number | string | null | undefined`, because pg
 *    returns numeric(12,2) as a string and nullable columns return null. You do
 *    not need `Number(x || 0)` at the call site.
 * 4. Money is RUPEES. numeric(12,2). Never divide by 100.
 *
 * `@/lib/utils` re-exports formatCurrency and formatDate for the ~30 files that
 * already import them from there; both paths resolve to this module.
 */

export {
    CURRENCY_CODE,
    CURRENCY_LOCALE,
    LAKH,
    CRORE,
    formatCurrency,
    formatCurrencyPrecise,
    formatCompactCurrency,
    toRupees,
    toRupeesOrZero,
    type Amount,
} from './currency';

export {
    DATE_LOCALE,
    SCHOOL_TIME_ZONE,
    formatDate,
    formatDateTime,
    formatTime,
    formatTimeAgo,
    toDate,
    toDateInputValue,
    type DateInput,
} from './date';

export {
    NUMBER_LOCALE,
    formatNumber,
    formatPercent,
    formatCompactNumber,
    type NumericInput,
} from './number';

/** Rendered by every formatter in this module when there is no value. */
export { EMPTY_VALUE } from './currency';
