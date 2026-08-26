import { redirect } from 'next/navigation';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { hasPermission, UserRole } from '@/lib/rbac/permissions';

/**
 * Cashflow outlook.
 *
 * Two very different kinds of number live on this page and they are kept
 * strictly apart:
 *
 *   1. OUTSTANDING — measured. The unpaid balance on issued invoices, bucketed
 *      by the month they fall due. This is straight out of `invoices` and is
 *      not an estimate.
 *   2. PROJECTED — extrapolated. Outstanding multiplied by the collection rate
 *      this tenant actually realised on invoices that have already matured.
 *
 * The projection is only produced when there is enough matured history to
 * measure a rate. There is deliberately no fallback constant: a tenant with no
 * history gets `ratePercent: null` and the page shows an explicit
 * "not enough history" state rather than a made-up percentage.
 */

/** An invoice is only counted towards the realised rate once it has been due
 *  for this long — before that, "unpaid" mostly means "not yet paid on time". */
const MATURITY_GRACE_DAYS = 30;

/** How far back matured invoices are read when measuring the realised rate. */
const RATE_LOOKBACK_MONTHS = 24;

/** Below this many matured invoices the realised rate is not reported. */
const MIN_MATURED_INVOICES = 5;

/**
 * Every query below excludes DRAFT, CANCELLED and WAIVED invoices. DRAFT ones
 * have not been issued; CANCELLED and WAIVED are never expected to be
 * collected. Counting any of them would distort both the outstanding balance
 * and the realised rate. The status lists are written out literally in each
 * statement rather than interpolated, so the SQL here is fully static.
 */

export type CashflowMonth = {
    /** 'YYYY-MM' */
    month: string;
    /** 'Mar 26' */
    label: string;
    /** Measured: unpaid balance on invoices due in this month. */
    outstanding: number;
    invoiceCount: number;
    /** Extrapolated, or null when there is no measured rate to extrapolate from. */
    projectedCollection: number | null;
};

export type CollectionBasis = {
    /** True when a rate was measured from enough matured invoices. */
    measured: boolean;
    /** Whole percent, or null when `measured` is false. */
    ratePercent: number | null;
    maturedInvoiceCount: number;
    maturedBilled: number;
    maturedCollected: number;
    /** Due-date range the rate was measured over, 'YYYY-MM-DD'. */
    fromDueDate: string | null;
    toDueDate: string | null;
    minimumInvoices: number;
    graceDays: number;
    lookbackMonths: number;
};

export type CashflowBacklog = {
    /** Measured: unpaid balance already past its due date. Not part of the forecast. */
    outstanding: number;
    invoiceCount: number;
    oldestDueDate: string | null;
};

export type CashflowOutlook = {
    horizonMonths: number;
    /** 'YYYY-MM-DD' — the day the numbers were read. */
    asOf: string;
    months: CashflowMonth[];
    basis: CollectionBasis;
    backlog: CashflowBacklog;
    /** Measured: sum of `outstanding` across the horizon. */
    totalOutstanding: number;
    /** Extrapolated, or null when there is no measured rate. */
    totalProjected: number | null;
};

type MonthBucketRow = {
    month: string;
    outstanding: string;
    invoiceCount: string;
};

/** Local-calendar YYYY-MM-DD. `toISOString()` would shift the day in IST. */
function ymd(date: Date): string {
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${m}-${d}`;
}

function monthKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(date: Date): string {
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

/** Same guard the rest of the fee module uses: route-level access is broader
 *  than `fees:read`, so non-finance staff are redirected rather than thrown. */
async function requireFeesRead(): Promise<{ tenantId: string }> {
    const { tenantId, session } = await requireAuth();
    if (!hasPermission(session.role as UserRole, 'fees:read')) {
        redirect('/unauthorized');
    }
    return { tenantId };
}

export async function getCashflowOutlook(horizonMonths = 6): Promise<CashflowOutlook> {
    const { tenantId } = await requireFeesRead();

    const today = new Date();
    const todayStr = ymd(today);

    const maturityCutoff = new Date(today);
    maturityCutoff.setDate(maturityCutoff.getDate() - MATURITY_GRACE_DAYS);

    const lookbackStart = new Date(today);
    lookbackStart.setMonth(lookbackStart.getMonth() - RATE_LOOKBACK_MONTHS);

    const horizonEnd = new Date(today.getFullYear(), today.getMonth() + horizonMonths, 1);

    // 1. Realised collection rate on invoices that have already matured.
    const basisResult = await pool.query<{
        invoiceCount: string;
        billed: string;
        collected: string;
        fromDueDate: Date | string | null;
        toDueDate: Date | string | null;
    }>(
        `SELECT
            COUNT(*)                        AS "invoiceCount",
            COALESCE(SUM(total_amount), 0)  AS billed,
            COALESCE(SUM(paid_amount), 0)   AS collected,
            MIN(due_date)                   AS "fromDueDate",
            MAX(due_date)                   AS "toDueDate"
         FROM invoices
         WHERE tenant_id = $1
           AND status NOT IN ('DRAFT', 'CANCELLED', 'WAIVED')
           AND due_date < $2
           AND due_date >= $3`,
        [tenantId, ymd(maturityCutoff), ymd(lookbackStart)],
    );

    const basisRow = basisResult.rows[0];
    const maturedInvoiceCount = Number(basisRow?.invoiceCount ?? 0);
    const maturedBilled = Number(basisRow?.billed ?? 0);
    const maturedCollected = Number(basisRow?.collected ?? 0);
    const measured = maturedInvoiceCount >= MIN_MATURED_INVOICES && maturedBilled > 0;

    const basis: CollectionBasis = {
        measured,
        ratePercent: measured ? Math.round((maturedCollected / maturedBilled) * 100) : null,
        maturedInvoiceCount,
        maturedBilled,
        maturedCollected,
        fromDueDate: basisRow?.fromDueDate ? toDateString(basisRow.fromDueDate) : null,
        toDueDate: basisRow?.toDueDate ? toDateString(basisRow.toDueDate) : null,
        minimumInvoices: MIN_MATURED_INVOICES,
        graceDays: MATURITY_GRACE_DAYS,
        lookbackMonths: RATE_LOOKBACK_MONTHS,
    };

    // 2. Outstanding balance ahead of today, bucketed by due month.
    const bucketResult = await pool.query<MonthBucketRow>(
        `SELECT
            to_char(due_date, 'YYYY-MM')                          AS month,
            COALESCE(SUM(total_amount - paid_amount), 0)          AS outstanding,
            COUNT(*)                                              AS "invoiceCount"
         FROM invoices
         WHERE tenant_id = $1
           AND status NOT IN ('PAID', 'DRAFT', 'CANCELLED', 'WAIVED')
           AND due_date >= $2
           AND due_date < $3
         GROUP BY 1`,
        [tenantId, todayStr, ymd(horizonEnd)],
    );

    const byMonth = new Map<string, MonthBucketRow>();
    for (const row of bucketResult.rows) {
        byMonth.set(row.month, row);
    }

    const months: CashflowMonth[] = [];
    let totalOutstanding = 0;
    let totalProjected: number | null = measured ? 0 : null;

    for (let i = 0; i < horizonMonths; i++) {
        const monthDate = new Date(today.getFullYear(), today.getMonth() + i, 1);
        const key = monthKey(monthDate);
        const row = byMonth.get(key);

        const outstanding = Number(row?.outstanding ?? 0);
        const projectedCollection = basis.ratePercent === null
            ? null
            : Math.round(outstanding * (basis.ratePercent / 100));

        months.push({
            month: key,
            label: monthLabel(monthDate),
            outstanding,
            invoiceCount: Number(row?.invoiceCount ?? 0),
            projectedCollection,
        });

        totalOutstanding += outstanding;
        if (totalProjected !== null && projectedCollection !== null) {
            totalProjected += projectedCollection;
        }
    }

    // 3. Already-overdue balance. Real money owed, but not future inflow —
    //    it is reported separately and never folded into the projection.
    const backlogResult = await pool.query<{
        outstanding: string;
        invoiceCount: string;
        oldestDueDate: Date | string | null;
    }>(
        `SELECT
            COALESCE(SUM(total_amount - paid_amount), 0)  AS outstanding,
            COUNT(*)                                      AS "invoiceCount",
            MIN(due_date)                                 AS "oldestDueDate"
         FROM invoices
         WHERE tenant_id = $1
           AND status NOT IN ('PAID', 'DRAFT', 'CANCELLED', 'WAIVED')
           AND due_date < $2`,
        [tenantId, todayStr],
    );

    const backlogRow = backlogResult.rows[0];

    return {
        horizonMonths,
        asOf: todayStr,
        months,
        basis,
        backlog: {
            outstanding: Number(backlogRow?.outstanding ?? 0),
            invoiceCount: Number(backlogRow?.invoiceCount ?? 0),
            oldestDueDate: backlogRow?.oldestDueDate ? toDateString(backlogRow.oldestDueDate) : null,
        },
        totalOutstanding,
        totalProjected,
    };
}

function toDateString(value: Date | string): string {
    return value instanceof Date ? ymd(value) : String(value).slice(0, 10);
}
