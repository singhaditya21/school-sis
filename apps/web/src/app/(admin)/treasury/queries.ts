import { redirect } from 'next/navigation';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { hasPermission, UserRole } from '@/lib/rbac/permissions';

/**
 * Read-side queries for the campus treasury surface.
 *
 * SCOPE — this page is tenant-scoped. Row-level security only exposes the
 * signed-in campus: `tenants`, `payments` and `invoices` are all filtered to
 * `app_private.current_tenant_id()`, and `multi_campus_hierarchy` only returns
 * the caller's own mapping row. A cross-campus roll-up is therefore impossible
 * from a campus session; that view exists at /hq/treasury for platform
 * operators, whose session bypasses RLS. Nothing here invents sibling-campus
 * figures to fill the gap.
 *
 * MONEY — `payments.amount`, `invoices.total_amount` and `invoices.paid_amount`
 * are numeric(12,2) in RUPEES. They are cast to float8 for transport and
 * rendered with formatCurrency. They are never divided or re-scaled.
 *
 * OVERDUE — derived from `due_date`, not from `status = 'OVERDUE'`. No row in
 * this schema is ever written with that status, so filtering on it returns
 * nothing (same convention as /fees/defaulters).
 *
 * Column names are taken from apps/web/drizzle/0000_init_baseline.sql.
 */

/**
 * /treasury sits behind the tenant-staff route gate, which admits every staff
 * role including TEACHER. Reading the cash ledger is a finance concern, so
 * anyone without a payments/fees grant is sent to /unauthorized rather than
 * being shown the money.
 */
async function requireTreasuryRead(): Promise<{ tenantId: string; role: UserRole }> {
    const { tenantId, session } = await requireAuth();
    const role = session.role as UserRole;
    const allowed =
        hasPermission(role, 'treasury:read') ||
        hasPermission(role, 'payments:read') ||
        hasPermission(role, 'fees:read');
    if (!allowed) {
        redirect('/unauthorized');
    }
    return { tenantId, role };
}

/** Indian financial year: 1 April → 31 March. Returned as YYYY-MM-DD. */
export function financialYearStart(now: Date = new Date()): string {
    const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${startYear}-04-01`;
}

export interface TreasuryScope {
    campusName: string;
    campusCode: string;
    /** Null when this campus has no multi_campus_hierarchy row. */
    groupName: string | null;
    region: string | null;
    campusType: string | null;
}

export interface TreasurySummary {
    /** COMPLETED payments received since the start of the financial year. */
    collectedYtd: number;
    collectedYtdCount: number;
    /** All-time COMPLETED receipts, for context on the YTD figure. */
    collectedAllTime: number;
    /** total_amount - paid_amount over invoices that are still payable. */
    outstanding: number;
    outstandingCount: number;
    /** The share of `outstanding` whose due date has already passed. */
    overdue: number;
    overdueCount: number;
}

export interface MethodMixRow {
    method: string;
    amount: number;
    txnCount: number;
}

export interface PaymentExceptionRow {
    id: string;
    transactionId: string | null;
    method: string;
    amount: number;
    status: string;
    paidAt: Date | string;
    invoiceId: string | null;
    invoiceNumber: string | null;
}

export interface LedgerMismatchRow {
    id: string;
    invoiceNumber: string;
    status: string;
    totalAmount: number;
    paidAmount: number;
    settled: number;
}

export interface LedgerRow {
    id: string;
    transactionId: string | null;
    invoiceId: string | null;
    invoiceNumber: string | null;
    studentName: string | null;
    method: string;
    amount: number;
    paidAt: Date | string;
    status: string;
}

export interface TreasuryPageData {
    scope: TreasuryScope | null;
    summary: TreasurySummary;
    fyStart: string;
    methodMix: MethodMixRow[];
    paymentExceptions: PaymentExceptionRow[];
    ledgerMismatches: LedgerMismatchRow[];
    ledger: LedgerRow[];
}

export async function getTreasuryPageData(): Promise<TreasuryPageData> {
    const { tenantId } = await requireTreasuryRead();
    const fyStart = financialYearStart();

    const [scopeResult, collectedResult, receivablesResult, methodResult, exceptionsResult, mismatchResult, ledgerResult] =
        await Promise.all([
            pool.query(
                `SELECT
                    t.name AS "campusName",
                    t.code AS "campusCode",
                    g.name AS "groupName",
                    mch.region AS "region",
                    mch.campus_type AS "campusType"
                 FROM tenants t
                 LEFT JOIN multi_campus_hierarchy mch ON mch.tenant_id = t.id
                 LEFT JOIN hq_groups g ON g.id = mch.group_id
                 WHERE t.id = $1`,
                [tenantId],
            ),
            pool.query(
                `SELECT
                    COALESCE(SUM(p.amount) FILTER (WHERE p.paid_at >= $2::date), 0)::float8 AS "collectedYtd",
                    COUNT(*) FILTER (WHERE p.paid_at >= $2::date)::int AS "collectedYtdCount",
                    COALESCE(SUM(p.amount), 0)::float8 AS "collectedAllTime"
                 FROM payments p
                 WHERE p.tenant_id = $1 AND p.status = 'COMPLETED'`,
                [tenantId, fyStart],
            ),
            pool.query(
                `SELECT
                    COALESCE(SUM(i.total_amount - i.paid_amount), 0)::float8 AS "outstanding",
                    COUNT(*)::int AS "outstandingCount",
                    COALESCE(
                        SUM(i.total_amount - i.paid_amount) FILTER (WHERE i.due_date < CURRENT_DATE), 0
                    )::float8 AS "overdue",
                    COUNT(*) FILTER (WHERE i.due_date < CURRENT_DATE)::int AS "overdueCount"
                 FROM invoices i
                 WHERE i.tenant_id = $1
                   AND i.status NOT IN ('DRAFT', 'PAID', 'CANCELLED', 'WAIVED')`,
                [tenantId],
            ),
            pool.query(
                `SELECT
                    p.method::text AS method,
                    SUM(p.amount)::float8 AS amount,
                    COUNT(*)::int AS "txnCount"
                 FROM payments p
                 WHERE p.tenant_id = $1 AND p.status = 'COMPLETED' AND p.paid_at >= $2::date
                 GROUP BY p.method
                 ORDER BY amount DESC`,
                [tenantId, fyStart],
            ),
            pool.query(
                `SELECT
                    p.id,
                    p.transaction_id AS "transactionId",
                    p.method::text AS method,
                    p.amount::float8 AS amount,
                    p.status::text AS status,
                    p.paid_at AS "paidAt",
                    i.id AS "invoiceId",
                    i.invoice_number AS "invoiceNumber"
                 FROM payments p
                 LEFT JOIN invoices i ON i.id = p.invoice_id AND i.tenant_id = p.tenant_id
                 WHERE p.tenant_id = $1 AND p.status <> 'COMPLETED'
                 ORDER BY p.paid_at DESC
                 LIMIT 50`,
                [tenantId],
            ),
            pool.query(
                `SELECT
                    i.id,
                    i.invoice_number AS "invoiceNumber",
                    i.status::text AS status,
                    i.total_amount::float8 AS "totalAmount",
                    i.paid_amount::float8 AS "paidAmount",
                    COALESCE(settled.total, 0)::float8 AS settled
                 FROM invoices i
                 LEFT JOIN LATERAL (
                    SELECT SUM(p.amount) AS total
                    FROM payments p
                    WHERE p.invoice_id = i.id
                      AND p.tenant_id = i.tenant_id
                      AND p.status = 'COMPLETED'
                 ) settled ON TRUE
                 WHERE i.tenant_id = $1
                   AND i.paid_amount <> COALESCE(settled.total, 0)
                 ORDER BY ABS(i.paid_amount - COALESCE(settled.total, 0)) DESC
                 LIMIT 25`,
                [tenantId],
            ),
            pool.query(
                `SELECT
                    p.id,
                    p.transaction_id AS "transactionId",
                    p.method::text AS method,
                    p.amount::float8 AS amount,
                    p.paid_at AS "paidAt",
                    p.status::text AS status,
                    i.id AS "invoiceId",
                    i.invoice_number AS "invoiceNumber",
                    s.first_name || ' ' || s.last_name AS "studentName"
                 FROM payments p
                 LEFT JOIN invoices i ON i.id = p.invoice_id AND i.tenant_id = p.tenant_id
                 LEFT JOIN students s ON s.id = p.student_id AND s.tenant_id = p.tenant_id
                 WHERE p.tenant_id = $1 AND p.status = 'COMPLETED'
                 ORDER BY p.paid_at DESC
                 LIMIT 50`,
                [tenantId],
            ),
        ]);

    const collected = collectedResult.rows[0] ?? {};
    const receivables = receivablesResult.rows[0] ?? {};

    return {
        scope: (scopeResult.rows[0] as TreasuryScope | undefined) ?? null,
        fyStart,
        summary: {
            collectedYtd: Number(collected.collectedYtd ?? 0),
            collectedYtdCount: Number(collected.collectedYtdCount ?? 0),
            collectedAllTime: Number(collected.collectedAllTime ?? 0),
            outstanding: Number(receivables.outstanding ?? 0),
            outstandingCount: Number(receivables.outstandingCount ?? 0),
            overdue: Number(receivables.overdue ?? 0),
            overdueCount: Number(receivables.overdueCount ?? 0),
        },
        methodMix: methodResult.rows as MethodMixRow[],
        paymentExceptions: exceptionsResult.rows as PaymentExceptionRow[],
        ledgerMismatches: mismatchResult.rows as LedgerMismatchRow[],
        ledger: ledgerResult.rows as LedgerRow[],
    };
}
